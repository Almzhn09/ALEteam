import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import type {ArchiveUpload, Prisma} from '../generated/prisma/index.js';
import type {ArchiveUploadDTO, UploadState, UploadMime} from '../contracts/uploads';
import {db} from './db';
import {ApiError, idSchema, json, pageSchema, queryParams, rateLimit, readJson} from './http';
import {staffContext, audit} from './staff';
import {allows} from './staff-policy';
import {catalogLock} from './archive-publication';
import {publicDocumentWhere} from './public-visibility';
import {stageUpload, readStagedUpload, removeStagedUpload, uploadMaxBytes} from './upload-storage';

const inspection = {method: 'signature-size-sha256-v1', fullFormatParsing: false, antivirus: 'not-configured'} as const;
const mimeSchema = z.enum(['application/pdf','image/png','image/jpeg']);
export const uploadCreateSchema = z.object({documentId: idSchema,
  originalName: z.string().trim().min(1).max(180).refine(v => !/[\x00-\x1f\x7f/\\]/u.test(v)),
  mimeType: mimeSchema, expectedBytes: z.number().int().min(1).max(uploadMaxBytes), expectedSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  rights: z.string().trim().min(1).max(1000), sourceNote: z.string().trim().min(1).max(1000),
}).strict().refine(v => v.mimeType === 'application/pdf' ? /\.pdf$/iu.test(v.originalName)
  : v.mimeType === 'image/png' ? /\.png$/iu.test(v.originalName) : /\.jpe?g$/iu.test(v.originalName), {path: ['originalName'], message: 'Extension must match declared format'});
function dto(row: ArchiveUpload): ArchiveUploadDTO {
  return {id: row.id, documentId: row.documentId, uploaderId: row.uploaderId, reviewerId: row.reviewerId, fileId: row.fileId,
    originalName: row.originalName, expectedBytes: row.expectedBytes, expectedSha256: row.expectedSha256,
    actualBytes: row.actualBytes, actualSha256: row.actualSha256, rights: row.rights, sourceNote: row.sourceNote,
    failureCode: row.failureCode, reviewReason: row.reviewReason, rightsConfirmed: row.rightsConfirmed,
    state: row.state as UploadState, mimeType: row.mimeType as UploadMime,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), inspection};
}
const root = () => process.env.FILE_STORAGE_ROOT || '.local/files';
function stale() {throw new ApiError(409, 'STALE_UPLOAD', 'Загрузка изменилась. Обновите данные.');}
function nextTime(row: {updatedAt: Date}) {return new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));}
async function authorized(request: Request, id: string, permission = 'catalog.read') {
  idSchema.parse(id);
  const item = await db.archiveUpload.findUnique({where: {id}, include: {document: {include: {fund: true}}}});
  if (!item || item.document.deletedAt) throw new ApiError(404, 'NOT_FOUND', 'Загрузка не найдена.');
  const context = await staffContext(request, permission, item.document.fund.branchId);
  return {item, context};
}
function owner(row: ArchiveUpload, userId: string) {
  if (row.uploaderId !== userId) throw new ApiError(403, 'UPLOAD_OWNER_REQUIRED', 'Содержимое загрузки изменяет только её автор.');
}
export async function uploads(request: Request, id?: string) {
  if (request.method === 'GET') {
    if (id) {z.object({}).strict().parse(queryParams(request)); return json({item: dto((await authorized(request, id)).item)});}
    const context = await staffContext(request);
    const branches = context.branches('catalog.read');
    if (branches !== null && !branches.length) throw new ApiError(403, 'FORBIDDEN', 'Недостаточно прав сотрудника.');
    const p = pageSchema.extend({documentId: idSchema.optional(), state: z.enum(['AWAITING_CONTENT','RECEIVING','QUARANTINED','APPROVED','REJECTED','PUBLISHED','FAILED']).optional()}).strict().parse(queryParams(request));
    const where: Prisma.ArchiveUploadWhereInput = {...(p.documentId ? {documentId: p.documentId} : {}), ...(p.state ? {state: p.state} : {}),
      document: {deletedAt: null, ...(branches === null ? {} : {fund: {branchId: {in: branches}}})}};
    const [rows, total] = await db.$transaction([db.archiveUpload.findMany({where, orderBy: [{createdAt: 'desc'}, {id: 'asc'}], take: p.pageSize, skip: (p.page - 1) * p.pageSize}), db.archiveUpload.count({where})], {isolationLevel: 'RepeatableRead'});
    return json({items: rows.map(dto), total, page: p.page, pageSize: p.pageSize});
  }
  const p = uploadCreateSchema.parse(await readJson(request, 4096));
  const document = await db.document.findUnique({where: {id: p.documentId}, include: {fund: true}});
  if (!document || document.deletedAt) throw new ApiError(404, 'NOT_FOUND', 'Документ не найден.');
  const context = await staffContext(request, 'catalog.write', document.fund.branchId);
  await rateLimit(`upload-create:${context.user.id}`, 30, 60);
  const item = await db.$transaction(async tx => {
    await catalogLock(tx);
    const current = await tx.document.findUnique({where: {id: document.id}});
    if (!current || current.deletedAt) throw new ApiError(404, 'NOT_FOUND', 'Документ не найден.');
    const active = await tx.archiveUpload.count({where: {uploaderId: context.user.id, state: {notIn: ['PUBLISHED','REJECTED']}}});
    const quota = await tx.archiveUpload.aggregate({where: {state: {not: 'PUBLISHED'}}, _sum: {expectedBytes: true}});
    if (active >= 100 || (quota._sum.expectedBytes ?? 0) + p.expectedBytes > 1024 * 1024 * 1024) throw new ApiError(409, 'UPLOAD_QUOTA', 'Достигнут лимит ожидающих загрузок. Завершите их проверку.');
    const row = await tx.archiveUpload.create({data: {...p, id: randomUUID(), uploaderId: context.user.id}});
    await audit(tx, context.user.id, 'UPLOAD_CREATED', row.id); return row;
  });
  return json({item: dto(item)}, 201);
}
export async function uploadContent(request: Request, id: string) {
  const {item, context} = await authorized(request, id, request.method === 'PUT' ? 'catalog.write' : 'catalog.read');
  if (request.method === 'GET') {
    if (!item.storageKey || !['QUARANTINED','APPROVED','REJECTED','PUBLISHED'].includes(item.state)) throw new ApiError(404, 'NOT_FOUND', 'Файл не найден.');
    const bytes = await readStagedUpload({...item, storageKey: item.storageKey}, root());
    const ext = item.mimeType === 'application/pdf' ? 'pdf' : item.mimeType === 'image/png' ? 'png' : 'jpg';
    return new Response(new Uint8Array(bytes), {headers: {'Content-Type': item.mimeType, 'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="review-${item.id}.${ext}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'"}});
  }
  owner(item, context.user.id);
  if (request.headers.get('content-type')?.split(';')[0].trim() !== item.mimeType) throw new ApiError(415, 'UPLOAD_CONTENT_TYPE', 'Передайте содержимое в заявленном формате файла.');
  const match = request.headers.get('if-match')?.match(/^"([^"]+)"$/u)?.[1];
  if (!match || match !== item.updatedAt.toISOString() || item.state !== 'AWAITING_CONTENT') stale();
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) !== item.expectedBytes)) throw new ApiError(400, 'UPLOAD_SIZE_MISMATCH', 'Размер загруженного файла не совпадает с заявленным.');
  await rateLimit(`upload-content:${context.user.id}`, 30, 60);
  const token = randomUUID();
  await db.$transaction(async tx => {
    const reserved = await tx.archiveUpload.updateMany({where: {id, updatedAt: item.updatedAt, state: 'AWAITING_CONTENT'}, data: {state: 'RECEIVING', receiveToken: token, failureCode: null, updatedAt: nextTime(item)}});
    if (reserved.count !== 1) stale();
    await audit(tx, context.user.id, 'UPLOAD_RECEIVE_STARTED', id);
  });
  let staged: Awaited<ReturnType<typeof stageUpload>> | undefined;
  try {
    staged = await stageUpload(request, {bytes: item.expectedBytes, sha256: item.expectedSha256, mime: item.mimeType as UploadMime}, root());
    const updated = await db.$transaction(async tx => {
      const current = await tx.archiveUpload.findUniqueOrThrow({where: {id}});
      const written = await tx.archiveUpload.updateMany({where: {id, state: 'RECEIVING', receiveToken: token}, data: {
        state: 'QUARANTINED', receiveToken: null, storageKey: staged!.storageKey, actualBytes: staged!.bytes, actualSha256: staged!.sha256, updatedAt: nextTime(current)}});
      if (written.count !== 1) stale();
      await audit(tx, context.user.id, 'UPLOAD_CONTENT_VERIFIED', id);
      return tx.archiveUpload.findUniqueOrThrow({where: {id}});
    });
    return json({item: dto(updated)});
  } catch (error) {
    if (staged) await removeStagedUpload(staged.storageKey, root());
    await db.$transaction(async tx => {
      const failed = await tx.archiveUpload.updateMany({where: {id, state: 'RECEIVING', receiveToken: token}, data: {state: 'FAILED', receiveToken: null,
        failureCode: error instanceof ApiError ? error.code : 'STORAGE_UNAVAILABLE', updatedAt: new Date()}});
      if (failed.count) await audit(tx, context.user.id, 'UPLOAD_FAILED', id);
    });
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'UPLOAD_STORAGE_UNAVAILABLE', 'Хранилище загрузок временно недоступно.');
  }
}
export async function uploadRetry(request: Request, id: string) {
  const {item, context} = await authorized(request, id, 'catalog.write'); owner(item, context.user.id);
  await rateLimit(`upload-action:${context.user.id}`, 60, 60);
  const p = z.object({expectedUpdatedAt: z.iso.datetime()}).strict().parse(await readJson(request, 1024));
  const expired = item.state === 'RECEIVING' && Date.now() - item.updatedAt.getTime() > 120000;
  if (p.expectedUpdatedAt !== item.updatedAt.toISOString() || item.state !== 'FAILED' && !expired) stale();
  const result = await db.$transaction(async tx => {
    const change = await tx.archiveUpload.updateMany({where: {id, updatedAt: item.updatedAt, state: item.state}, data: {
      state: 'AWAITING_CONTENT', receiveToken: null, failureCode: null, updatedAt: nextTime(item)}});
    if (change.count !== 1) stale();
    await audit(tx, context.user.id, 'UPLOAD_RETRIED', id); return tx.archiveUpload.findUniqueOrThrow({where: {id}});
  });
  return json({item: dto(result)});
}
export async function reviewUpload(request: Request, id: string) {
  const {item, context} = await authorized(request, id, 'content.review');
  if (!allows(context.grants, 'catalog.read', item.document.fund.branchId)) throw new ApiError(403, 'FORBIDDEN', 'Недостаточно прав сотрудника.');
  await rateLimit(`upload-action:${context.user.id}`, 60, 60);
  const p = z.object({expectedUpdatedAt: z.iso.datetime(), decision: z.enum(['APPROVE','REJECT']), rightsConfirmed: z.boolean(), reason: z.string().trim().min(3).max(500)}).strict().parse(await readJson(request, 2048));
  if (item.uploaderId === context.user.id) throw new ApiError(403, 'SELF_APPROVAL', 'Проверку должен выполнить другой сотрудник.');
  if (p.expectedUpdatedAt !== item.updatedAt.toISOString() || item.state !== 'QUARANTINED') stale();
  if (p.decision === 'APPROVE' && !p.rightsConfirmed) throw new ApiError(400, 'UPLOAD_RIGHTS_REQUIRED', 'Подтвердите права на публикацию файла.');
  if (p.decision === 'APPROVE') {
    if (!item.storageKey) stale();
    await readStagedUpload({...item, storageKey: item.storageKey!}, root());
  }
  const row = await db.$transaction(async tx => {
    const updated = await tx.archiveUpload.updateMany({where: {id, updatedAt: item.updatedAt, state: 'QUARANTINED'}, data: {
      state: p.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', reviewerId: context.user.id,
      rightsConfirmed: p.decision === 'APPROVE', reviewReason: p.reason, updatedAt: nextTime(item)}});
    if (updated.count !== 1) stale();
    await audit(tx, context.user.id, p.decision === 'APPROVE' ? 'UPLOAD_APPROVED' : 'UPLOAD_REJECTED', id);
    return tx.archiveUpload.findUniqueOrThrow({where: {id}});
  });
  return json({item: dto(row)});
}
export async function publishUpload(request: Request, id: string) {
  const {item, context} = await authorized(request, id, 'content.publish');
  if (!allows(context.grants, 'catalog.read', item.document.fund.branchId)) throw new ApiError(403, 'FORBIDDEN', 'Недостаточно прав сотрудника.');
  await rateLimit(`upload-action:${context.user.id}`, 60, 60);
  const p = z.object({expectedUpdatedAt: z.iso.datetime(), downloadable: z.boolean().default(false)}).strict().parse(await readJson(request, 1024));
  if (p.expectedUpdatedAt !== item.updatedAt.toISOString() || item.state !== 'APPROVED' || !item.storageKey) stale();
  await readStagedUpload({...item, storageKey: item.storageKey!}, root());
  const row = await db.$transaction(async tx => {
    await catalogLock(tx); await tx.$queryRaw`SELECT id FROM "ArchiveUpload" WHERE id=${id} FOR UPDATE`;
    const current = await tx.archiveUpload.findUniqueOrThrow({where: {id}});
    if (current.updatedAt.toISOString() !== p.expectedUpdatedAt || current.state !== 'APPROVED') stale();
    const document = await tx.document.findFirst({where: {id: current.documentId, ...publicDocumentWhere, allowDigitalCopy: true}});
    if (!document) throw new ApiError(409, 'UPLOAD_PUBLIC_COPY_REQUIRED', 'Сначала опубликуйте карточку и разрешите цифровую копию.');
    const fileId = 'upload-' + id;
    await tx.archiveFile.create({data: {id: fileId, documentId: current.documentId, storageKey: current.storageKey!, name: current.originalName,
      mimeType: current.mimeType, size: current.expectedBytes, isPublic: true, downloadable: p.downloadable}});
    const updated = await tx.archiveUpload.update({where: {id}, data: {state: 'PUBLISHED', fileId, updatedAt: nextTime(current)}});
    await audit(tx, context.user.id, 'UPLOAD_PUBLISHED', id); return updated;
  });
  return json({item: dto(row)});
}

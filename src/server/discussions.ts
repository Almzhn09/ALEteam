import { Prisma } from '../generated/prisma/index.js';
import { z } from 'zod';
import { db } from './db';
import { ApiError, idSchema, json, pageSchema, queryParams, rateLimit, readJson, requireUser } from './http';
import { publicDocument } from './catalog';
import { moderate } from './services';

export const commentBody = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
const publicSelect = { id: true, body: true, createdAt: true, author: { select: { name: true } } } satisfies Prisma.CommentSelect;
export async function listComments(request: Request, documentId: string) {
  await publicDocument(documentId);
  const p = pageSchema.strict().parse(queryParams(request));
  const where = { documentId, status: 'PUBLISHED' as const };
  const [items, total] = await db.$transaction([
    db.comment.findMany({ where, select: publicSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    db.comment.count({ where }),
  ], { isolationLevel: 'RepeatableRead' });
  return json({ items, total, ...p });
}
export async function createComment(request: Request, documentId: string) {
  const user = await requireUser(request);
  await publicDocument(documentId);
  const { body } = commentBody.parse(await readJson(request));
  const idempotencyKey = z.uuid().parse(request.headers.get('idempotency-key'));
  const existing = await db.comment.findUnique({ where: { authorId_idempotencyKey: { authorId: user.id, idempotencyKey } } });
  if (existing) {
    if (existing.body !== body || existing.documentId !== documentId) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Ключ уже использован для другого запроса.');
    return json({ item: existing });
  }
  await rateLimit(`comment:${user.id}`, 5, 60);
  const result = await moderate(body);
  try {
    const item = await db.comment.create({ data: { documentId, authorId: user.id, body, idempotencyKey,
      status: result.status, reason: result.reason, moderationVersion: result.version } });
    return json({ item }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const item = await db.comment.findUniqueOrThrow({ where: { authorId_idempotencyKey: { authorId: user.id, idempotencyKey } } });
      if (item.body !== body || item.documentId !== documentId) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Ключ уже использован для другого запроса.');
      return json({ item });
    }
    throw error;
  }
}
export async function ownComments(request: Request) {
  const user = await requireUser(request);
  const p = pageSchema.strict().parse(queryParams(request));
  const where = { authorId: user.id, document: { isPublic: true } };
  const [items, total] = await db.$transaction([
    db.comment.findMany({ where, select: { id: true, documentId: true, body: true, status: true, reason: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: p.pageSize, skip: (p.page - 1) * p.pageSize }),
    db.comment.count({ where }),
  ], { isolationLevel: 'RepeatableRead' });
  return json({ items, total, ...p });
}
export async function reportComment(request: Request, id: string) {
  idSchema.parse(id);
  const user = await requireUser(request);
  const body = z.object({ reason: z.string().trim().min(3).max(500) }).strict().parse(await readJson(request));
  await rateLimit(`report:${user.id}`, 10, 60);
  const comment = await db.comment.findFirst({ where: { id, status: 'PUBLISHED', document: { isPublic: true } } });
  if (!comment) throw new ApiError(404, 'NOT_FOUND', 'Комментарий не найден.');
  const item = await db.report.upsert({ where: { commentId_reporterId: { commentId: id, reporterId: user.id } },
    create: { commentId: id, reporterId: user.id, reason: body.reason }, update: {}, select: { id: true, createdAt: true } });
  return json({ item }, 201);
}
export async function moderationQueue(request: Request) {
  await requireUser(request, true);
  const p = pageSchema.extend({ status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN']).optional() }).strict().parse(queryParams(request));
  const where: Prisma.CommentWhereInput = p.status ? { status: p.status } : { OR: [{ status: 'PENDING' }, { reports: { some: { resolvedAt: null } } }] };
  const [items, total] = await db.$transaction([
    db.comment.findMany({ where, include: { author: { select: { id: true, name: true } }, reports: { where: { resolvedAt: null }, select: { id: true, reason: true, createdAt: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: p.pageSize, skip: (p.page - 1) * p.pageSize }),
    db.comment.count({ where }),
  ], { isolationLevel: 'RepeatableRead' });
  return json({ items, total, page: p.page, pageSize: p.pageSize });
}
export async function decideComment(request: Request, id: string) {
  idSchema.parse(id);
  const user = await requireUser(request, true);
  const p = z.object({ status: z.enum(['PUBLISHED', 'REJECTED', 'HIDDEN']), reason: z.string().trim().min(3).max(500),
    expectedUpdatedAt: z.iso.datetime() }).strict().parse(await readJson(request));
  await rateLimit(`moderate:${user.id}`, 60, 60);
  const item = await db.$transaction(async tx => {
    // Row lock serializes decisions. expectedUpdatedAt prevents stale UI overwrites.
    await tx.$queryRaw`SELECT id FROM "Comment" WHERE id = ${id} FOR UPDATE`;
    const current = await tx.comment.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Комментарий не найден.');
    if (current.updatedAt.toISOString() !== p.expectedUpdatedAt) throw new ApiError(409, 'STALE_DECISION', 'Комментарий изменился. Обновите очередь.');
    const updated = await tx.comment.update({ where: { id }, data: { status: p.status, reason: 'MANUAL_DECISION',
      updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) } });
    await tx.moderationDecision.create({ data: { commentId: id, moderatorId: user.id, fromStatus: current.status, toStatus: p.status, reason: p.reason } });
    await tx.report.updateMany({ where: { commentId: id, resolvedAt: null }, data: { resolvedAt: new Date() } });
    return updated;
  });
  return json({ item });
}
export async function decisionHistory(request: Request, id: string) {
  await requireUser(request, true); idSchema.parse(id);
  const p = pageSchema.strict().parse(queryParams(request));
  const [items, total] = await db.$transaction([
    db.moderationDecision.findMany({ where: { commentId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: p.pageSize, skip: (p.page - 1) * p.pageSize }),
    db.moderationDecision.count({ where: { commentId: id } }),
  ], { isolationLevel: 'RepeatableRead' });
  return json({ items, total, ...p });
}

import { Prisma } from '../generated/prisma/index.js';
import { z } from 'zod';
import { realpath, open } from 'node:fs/promises';
import path from 'node:path';
import { db } from './db';
import { ApiError, idSchema, json, pageSchema, queryParams } from './http';
import { archiveLocale } from './archive-schema';

const filterText = z.string().trim().min(1).max(200);
export const catalogSchema = pageSchema.extend({
  q: z.string().trim().max(200).default(''), locale: archiveLocale.default('ru'),
  branchId: idSchema.optional(), fundId: idSchema.optional(), inventoryId: idSchema.optional(), caseId: idSchema.optional(),
  fundNumber: filterText.optional(), inventoryNumber: filterText.optional(), caseNumber: filterText.optional(),
  reference: filterText.optional(), author: filterText.optional(), organization: filterText.optional(),
  locality: filterText.optional(), originalLanguage: z.string().trim().min(1).max(60).optional(),
  category: z.string().trim().min(1).max(100).optional(), tag: z.string().trim().min(1).max(60).optional(),
  type: z.enum(['LETTER', 'PHOTO', 'MAP', 'REPORT']).optional(),
  yearFrom: z.coerce.number().int().min(1).max(2100).optional(),
  yearTo: z.coerce.number().int().min(1).max(2100).optional(),
  sort: z.enum(['year_asc', 'year_desc', 'title']).default('year_desc'),
}).strict().refine(v => v.yearFrom === undefined || v.yearTo === undefined || v.yearFrom <= v.yearTo, {message: 'Invalid year range', path: ['yearTo']});
const contains = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
export async function documentList(request: Request) {
  const p = catalogSchema.parse(queryParams(request));
  const filter = Prisma.sql`d."isPublic" = true AND d."deletedAt" IS NULL AND t.locale = ${p.locale}
    ${p.q ? Prisma.sql`AND (t."searchVector" @@ plainto_tsquery('simple', ${p.q})
      OR ${p.locale === 'ru' ? Prisma.sql`t."russianVector" @@ plainto_tsquery('russian', ${p.q})` : Prisma.sql`false`}
      OR t.title ILIKE ${contains(p.q)} OR d.reference ILIKE ${contains(p.q)}
      OR EXISTS(SELECT 1 FROM unnest(t.tags) AS term WHERE term ILIKE ${contains(p.q)}))` : Prisma.empty}
    ${p.branchId ? Prisma.sql`AND f."branchId" = ${p.branchId}` : Prisma.empty}
    ${p.fundId ? Prisma.sql`AND d."fundId" = ${p.fundId}` : Prisma.empty}
    ${p.inventoryId ? Prisma.sql`AND c."inventoryId" = ${p.inventoryId}` : Prisma.empty}
    ${p.caseId ? Prisma.sql`AND d."caseId" = ${p.caseId}` : Prisma.empty}
    ${p.fundNumber ? Prisma.sql`AND f.number = ${p.fundNumber}` : Prisma.empty}
    ${p.inventoryNumber ? Prisma.sql`AND i.number = ${p.inventoryNumber}` : Prisma.empty}
    ${p.caseNumber ? Prisma.sql`AND c.number = ${p.caseNumber}` : Prisma.empty}
    ${p.reference ? Prisma.sql`AND d.reference ILIKE ${contains(p.reference)}` : Prisma.empty}
    ${p.author ? Prisma.sql`AND t."authorName" ILIKE ${contains(p.author)}` : Prisma.empty}
    ${p.organization ? Prisma.sql`AND t.organization ILIKE ${contains(p.organization)}` : Prisma.empty}
    ${p.locality ? Prisma.sql`AND t.locality ILIKE ${contains(p.locality)}` : Prisma.empty}
    ${p.originalLanguage ? Prisma.sql`AND lower(d."originalLanguage") = lower(${p.originalLanguage})` : Prisma.empty}
    ${p.category ? Prisma.sql`AND lower(t.category) = lower(${p.category})` : Prisma.empty}
    ${p.tag ? Prisma.sql`AND EXISTS(SELECT 1 FROM unnest(t.tags) AS tag WHERE lower(tag) = lower(${p.tag}))` : Prisma.empty}
    ${p.type ? Prisma.sql`AND d.type = ${p.type}` : Prisma.empty}
    ${p.yearFrom !== undefined ? Prisma.sql`AND COALESCE(d."yearTo", d.year) >= ${p.yearFrom}` : Prisma.empty}
    ${p.yearTo !== undefined ? Prisma.sql`AND d.year <= ${p.yearTo}` : Prisma.empty}`;
  const order = {year_asc: Prisma.sql`d.year ASC, d.id ASC`, year_desc: Prisma.sql`d.year DESC, d.id ASC`, title: Prisma.sql`t.title ASC, d.id ASC`}[p.sort];
  const tables = Prisma.sql`"Document" d JOIN "DocumentTranslation" t ON t."documentId"=d.id
    JOIN "Fund" f ON f.id=d."fundId" LEFT JOIN "ArchivalCase" c ON c.id=d."caseId" LEFT JOIN "Inventory" i ON i.id=c."inventoryId"`;
  const [items, counts] = await db.$transaction([
    db.$queryRaw(Prisma.sql`SELECT d.id, t.title, t.description, d.reference, d.year, d."yearTo", d.type, d."fundId", d."caseId", d."isDemo", d."originalLanguage",
      f."branchId", c."inventoryId", t.category, t.tags, t."authorName", t.organization, t.locality, t.locale,
      ARRAY(SELECT locale FROM "DocumentTranslation" other WHERE other."documentId"=d.id ORDER BY locale) AS "availableLocales"
      FROM ${tables} WHERE ${filter} ORDER BY ${order} LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}`),
    db.$queryRaw<{count: number}[]>(Prisma.sql`SELECT count(*)::int AS count FROM ${tables} WHERE ${filter}`),
  ], {isolationLevel: 'RepeatableRead'});
  return json({items, page: p.page, pageSize: p.pageSize, total: counts[0].count, locale: p.locale});
}
export async function publicDocument(id: string, request?: Request) {
  idSchema.parse(id);
  const {locale} = z.object({locale: archiveLocale.default('ru')}).strict().parse(request ? queryParams(request) : {});
  const document = await db.document.findFirst({where: {id, isPublic: true, deletedAt: null}, select: {
    id: true, reference: true, year: true, yearTo: true, type: true, isDemo: true, isPublic: true, fundId: true, createdAt: true,
    originalLanguage: true, leafCount: true, allowDigitalCopy: true,
    translations: {select: {locale: true, title: true, description: true, rights: true, sourceUrl: true, sourceNote: true,
      authorName: true, organization: true, locality: true, storageLocation: true, accessConditions: true, category: true, tags: true}},
    archivalCase: {select: {id: true, number: true, title: true, inventory: {select: {id: true, number: true, title: true}}}},
    fund: {select: {id: true, name: true, description: true, branchId: true, number: true}},
    files: {where: {isPublic: true, document: {allowDigitalCopy: true}}, select: {id: true, name: true, mimeType: true, size: true, downloadable: true}},
  }});
  const translation = document?.translations.find(t => t.locale === locale);
  if (!document || !translation) throw new ApiError(404, 'NOT_FOUND', 'Документ не найден.');
  const {translations, ...metadata} = document;
  return {...metadata, ...translation, availableLocales: translations.map(t => t.locale).sort()};
}
export async function fileResponse(request: Request, id: string) {
  idSchema.parse(id);
  const params = z.object({ download: z.enum(['1']).optional() }).strict().parse(queryParams(request));
  const file = await db.archiveFile.findFirst({ where: { id, isPublic: true, document: { isPublic: true, deletedAt:null, allowDigitalCopy:true } } });
  if (!file || (params.download && !file.downloadable)) throw new ApiError(404, 'NOT_FOUND', 'Файл не найден.');
  const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
  if (!allowed.includes(file.mimeType) || file.size > 20 * 1024 * 1024) throw new ApiError(404, 'NOT_FOUND', 'Файл не найден.');
  const root = await realpath(process.env.FILE_STORAGE_ROOT || '.local/files');
  let location: string;
  try { location = await realpath(path.resolve(root, file.storageKey)); }
  catch { throw new ApiError(404, 'NOT_FOUND', 'Файл не найден.'); }
  if (!location.startsWith(root + path.sep)) throw new ApiError(404, 'NOT_FOUND', 'Файл не найден.');
  const handle = await open(location, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== file.size || stat.size > 20 * 1024 * 1024) throw new ApiError(404, 'NOT_FOUND', 'Файл не найден.');
    const data = await handle.readFile();
    const valid = file.mimeType === 'application/pdf' ? data.subarray(0, 5).toString() === '%PDF-'
      : file.mimeType === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : data[0] === 255 && data[1] === 216 && data[2] === 255;
    if (!valid) throw new ApiError(404, 'NOT_FOUND', 'Файл не найден.');
    return new Response(new Uint8Array(data), { headers: {
      'Content-Type': file.mimeType, 'Content-Length': String(data.byteLength),
      'Content-Disposition': `${params.download ? 'attachment' : 'inline'}; filename="archive-${file.id}.${file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType === 'image/png' ? 'png' : 'jpg'}"`,
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'",
      'Cache-Control': 'private, no-store',
    } });
  } finally { await handle.close(); }
}

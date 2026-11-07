import { Prisma } from '../generated/prisma/index.js';
import { z } from 'zod';
import { realpath, open } from 'node:fs/promises';
import path from 'node:path';
import { db } from './db';
import { ApiError, idSchema, json, pageSchema, queryParams } from './http';

export const catalogSchema = pageSchema.extend({
  q: z.string().trim().max(200).default(''),
  fundId: idSchema.optional(), type: z.enum(['LETTER', 'PHOTO', 'MAP', 'REPORT']).optional(),
  yearFrom: z.coerce.number().int().min(1).max(2100).optional(),
  yearTo: z.coerce.number().int().min(1).max(2100).optional(),
  sort: z.enum(['year_asc', 'year_desc', 'title']).default('year_desc'),
}).strict().refine(v => v.yearFrom === undefined || v.yearTo === undefined || v.yearFrom <= v.yearTo, { message: 'Invalid year range', path: ['yearTo'] });

export async function documentList(request: Request) {
  const p = catalogSchema.parse(queryParams(request));
  const filter = Prisma.sql`d."isPublic" = true
    ${p.q ? Prisma.sql`AND (d."searchVector" @@ plainto_tsquery('russian', ${p.q}) OR d."reference" ILIKE ${`%${p.q.replace(/[\\%_]/g, '\\$&')}%`})` : Prisma.empty}
    ${p.fundId ? Prisma.sql`AND d."fundId" = ${p.fundId}` : Prisma.empty}
    ${p.type ? Prisma.sql`AND d."type" = ${p.type}` : Prisma.empty}
    ${p.yearFrom !== undefined ? Prisma.sql`AND d."year" >= ${p.yearFrom}` : Prisma.empty}
    ${p.yearTo !== undefined ? Prisma.sql`AND d."year" <= ${p.yearTo}` : Prisma.empty}`;
  const order = { year_asc: Prisma.sql`d."year" ASC, d.id ASC`, year_desc: Prisma.sql`d."year" DESC, d.id ASC`, title: Prisma.sql`d.title ASC, d.id ASC` }[p.sort];
  const [items, counts] = await db.$transaction([
    db.$queryRaw(Prisma.sql`SELECT d.id, d.title, d.description, d."reference", d.year, d.type, d."fundId", d."isDemo" FROM "Document" d WHERE ${filter} ORDER BY ${order} LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}`),
    db.$queryRaw<{ count: number }[]>(Prisma.sql`SELECT count(*)::int AS count FROM "Document" d WHERE ${filter}`),
  ], { isolationLevel: 'RepeatableRead' });
  return json({ items, page: p.page, pageSize: p.pageSize, total: counts[0].count });
}
export async function publicDocument(id: string) {
  idSchema.parse(id);
  const document = await db.document.findFirst({ where: { id, isPublic: true }, include: {
    fund: true, files: { where: { isPublic: true }, select: { id: true, name: true, mimeType: true, size: true, downloadable: true } },
  } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Документ не найден.');
  return document;
}
export async function fileResponse(request: Request, id: string) {
  idSchema.parse(id);
  const params = z.object({ download: z.enum(['1']).optional() }).strict().parse(queryParams(request));
  const file = await db.archiveFile.findFirst({ where: { id, isPublic: true, document: { isPublic: true } } });
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

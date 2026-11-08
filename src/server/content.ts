import { z } from 'zod';
import { db } from './db';
import { ApiError, idSchema, json, pageSchema, queryParams, rateLimit, readJson, requireUser } from './http';

const kindSchema = z.enum(['NEWS', 'COLLECTION']);
const listSchema = pageSchema.extend({ kind: kindSchema.optional() }).strict();
const visibilitySchema = z.object({ isVisible: z.boolean(), expectedUpdatedAt: z.iso.datetime() }).strict();
const documentSelect = { id: true, title: true, description: true, reference: true, year: true, type: true, fundId: true, isDemo: true } as const;

type Item = { documentIds: string[] };
// Collections resolve to currently public documents only, in the curated order.
async function withDocuments<T extends Item>(items: T[]) {
  const ids = [...new Set(items.flatMap(item => item.documentIds))];
  const rows = ids.length ? await db.document.findMany({ where: { id: { in: ids }, isPublic: true }, select: documentSelect }) : [];
  const byId = new Map(rows.map(row => [row.id, row]));
  return items.map(({ documentIds, ...item }) => ({ ...item, documents: documentIds.flatMap(id => byId.get(id) ?? []) }));
}
async function page(request: Request, visibleOnly: boolean) {
  const p = listSchema.parse(queryParams(request));
  const where = { ...(p.kind ? { kind: p.kind } : {}), ...(visibleOnly ? { isVisible: true } : {}) };
  const select = { id: true, kind: true, title: true, summary: true, sourceUrl: true, publishedAt: true, documentIds: true, isDemo: true,
    ...(visibleOnly ? {} : { isVisible: true, updatedAt: true }) };
  const [items, total] = await db.$transaction([
    db.contentItem.findMany({ where, select, orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }], skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    db.contentItem.count({ where }),
  ], { isolationLevel: 'RepeatableRead' });
  return json({ items: await withDocuments(items), total, page: p.page, pageSize: p.pageSize });
}
export const publicContent = (request: Request) => page(request, true);
export async function editorContent(request: Request) {
  await requireUser(request, true);
  return page(request, false);
}
export async function setContentVisibility(request: Request, id: string) {
  idSchema.parse(id);
  const user = await requireUser(request, true);
  const input = visibilitySchema.parse(await readJson(request));
  await rateLimit(`content:${user.id}`, 60, 60);
  const item = await db.$transaction(async tx => {
    // Row lock + expectedUpdatedAt: same stale-write protection as moderation decisions.
    await tx.$queryRaw`SELECT id FROM "ContentItem" WHERE id = ${id} FOR UPDATE`;
    const current = await tx.contentItem.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Материал не найден.');
    if (current.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new ApiError(409, 'STALE_CONTENT', 'Материал изменился. Обновите список.');
    return tx.contentItem.update({ where: { id }, data: { isVisible: input.isVisible, updatedById: user.id,
      updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) },
      select: { id: true, isVisible: true, updatedAt: true } });
  });
  return json({ item });
}

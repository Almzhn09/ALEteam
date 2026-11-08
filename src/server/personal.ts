import { z } from 'zod';
import { db } from './db';
import { ApiError, idSchema, json, pageSchema, queryParams, rateLimit, readJson, requireUser } from './http';

export async function listFavorites(request: Request) {
  const user = await requireUser(request);
  const p = pageSchema.strict().parse(queryParams(request));
  const where = { userId: user.id, document: { isPublic: true } };
  const [rows, total] = await db.$transaction([
    db.favorite.findMany({ where, include: { document: { select: { id: true, title: true, reference: true, year: true, type: true, isDemo: true } } },
      orderBy: [{ createdAt: 'desc' }, { documentId: 'asc' }], skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    db.favorite.count({ where }),
  ], { isolationLevel: 'RepeatableRead' });
  return json({ items: rows.map(row => ({ ...row.document, savedAt: row.createdAt })), total, ...p, ownerId: user.id });
}
export async function saveFavorites(request: Request, documentId?: string) {
  const user = await requireUser(request);
  const ids = documentId ? [idSchema.parse(documentId)] : z.object({ documentIds: z.array(idSchema).min(1).max(100) }).strict().parse(await readJson(request)).documentIds;
  if (documentId) z.object({}).strict().parse(await readJson(request, 4096));
  await rateLimit(`favorites:${user.id}`, 100, 60);
  const added = await db.$transaction(async tx => {
    // Serialize additions to enforce the per-account limit even under concurrent imports.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const visible = await tx.document.findMany({ where: { id: { in: [...new Set(ids)] }, isPublic: true }, select: { id: true } });
    if (documentId && !visible.length) throw new ApiError(404, 'NOT_FOUND', 'Документ не найден.');
    const current = await tx.favorite.findMany({ where: { userId: user.id }, select: { documentId: true } });
    const additions = visible.filter(d => !current.some(f => f.documentId === d.id));
    if (current.length + additions.length > 1000) throw new ApiError(409, 'FAVORITES_LIMIT', 'В избранном может быть не более 1000 документов.');
    return (await tx.favorite.createMany({ data: additions.map(d => ({ userId: user.id, documentId: d.id })), skipDuplicates: true })).count;
  });
  return json({ added });
}
export async function deleteFavorites(request: Request, documentId?: string) {
  const user = await requireUser(request);
  if (documentId) idSchema.parse(documentId);
  await rateLimit(`favorites:${user.id}`, 100, 60);
  await db.favorite.deleteMany({ where: { userId: user.id, ...(documentId ? { documentId } : {}) } });
  return json({ ok: true });
}

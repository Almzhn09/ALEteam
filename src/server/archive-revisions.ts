import { z } from 'zod';
import { db } from './db';
import { ApiError, idSchema, json, readJson, rateLimit } from './http';
import { staffContext, audit } from './staff';
import { archiveLocale, parseDocumentPayload } from './archive-schema';
import { catalogLock, validateDocumentRevision } from './archive-publication';

export async function newDocumentRevision(request: Request, id: string) {
  idSchema.parse(id);
  const document = await db.document.findUnique({where: {id}, include: {fund: true}});
  if (!document || document.deletedAt) throw new ApiError(404, 'NOT_FOUND', 'Документ не найден.');
  const context = await staffContext(request, 'catalog.write', document.fund.branchId);
  const body = z.object({locale: archiveLocale, payload: z.unknown()}).strict().parse(await readJson(request));
  const payload = parseDocumentPayload(body.locale, body.payload);
  await rateLimit(`catalog-write:${context.user.id}`, 60, 60);
  const revision = await db.$transaction(async tx => {
    await catalogLock(tx);
    const current = await tx.document.findUniqueOrThrow({where: {id}});
    if (current.deletedAt) throw new ApiError(404, 'NOT_FOUND', 'Документ не найден.');
    let itemId = current.contentItemId;
    if (!itemId) {
      const item = await tx.contentItem.create({data: {slug: '_archive-' + current.id, kind: 'ARCHIVE_DOCUMENT', branchId: document.fund.branchId, isDemo: current.isDemo}});
      itemId = item.id;
      await tx.document.update({where: {id}, data: {contentItemId: itemId}});
    }
    await validateDocumentRevision(tx, itemId, body.locale, payload);
    const latest = await tx.contentRevision.findFirst({where: {itemId, locale: body.locale}, orderBy: {version: 'desc'}});
    if (latest && ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'].includes(latest.status)) throw new ApiError(409, 'DRAFT_EXISTS', 'Сначала завершите текущую редакцию.');
    const revision = await tx.contentRevision.create({data: {itemId, locale: body.locale, version: (latest?.version ?? 0) + 1, payload, catalogBaseVersion: current.catalogVersion, authorId: context.user.id}});
    await audit(tx, context.user.id, 'DOCUMENT_REVISION_CREATED', revision.id);
    return revision;
  });
  return json({item: revision}, 201);
}

import { Prisma } from '../generated/prisma/index.js';
import { ApiError } from './http';
import { audit } from './staff';
import { documentMetadataSchema, parseDocumentPayload, textProjection } from './archive-schema';

// One transaction lock covers catalog mutations and publication, including hierarchy checks.
// This deliberately simple prototype policy can be narrowed after measuring TZ-B12 workloads.
export async function catalogLock(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(782032102)`;
}
export async function catalogDocument(tx: Prisma.TransactionClient, itemId: string) {
  const document = await tx.document.findUnique({where: {contentItemId: itemId}, include: {fund: true}});
  if (!document || document.deletedAt) throw new ApiError(404, 'NOT_FOUND', 'Документ не найден.');
  return document;
}
export async function validateDocumentRevision(tx: Prisma.TransactionClient, itemId: string, locale: string, payload: unknown) {
  const document = await catalogDocument(tx, itemId);
  const parsed = parseDocumentPayload(locale, payload);
  if (!document.isDemo && !parsed.sourceUrl && !parsed.sourceNote) throw new ApiError(400, 'SOURCE_REQUIRED', 'Укажите происхождение материала.');
  if (locale === 'ru') {
    const metadata = documentMetadataSchema.parse(parsed);
    if (metadata.caseId && !await tx.archivalCase.count({where: {id: metadata.caseId, fundId: document.fundId}})) {
      throw new ApiError(409, 'INVALID_RELATION', 'Проверьте связанные записи.');
    }
  } else if (!document.isPublic) throw new ApiError(409, 'BASE_NOT_PUBLISHED', 'Сначала опубликуйте основную карточку на русском языке.');
  return document;
}
async function invalidateTranslations(tx: Prisma.TransactionClient, itemId: string, actorId: string) {
  const revisions = await tx.contentRevision.findMany({where: {itemId, locale: {not: 'ru'}, status: {not: 'ARCHIVED'}}});
  for (const revision of revisions) {
    const status = revision.status === 'PUBLISHED' ? 'ARCHIVED' : ['IN_REVIEW', 'APPROVED'].includes(revision.status) ? 'CHANGES_REQUESTED' : revision.status;
    if (status !== revision.status) {
      await tx.contentRevision.update({where: {id: revision.id}, data: {status, reviewerId: null, updatedAt: new Date(Math.max(Date.now(), revision.updatedAt.getTime() + 1))}});
      await tx.publicationEvent.create({data: {revisionId: revision.id, actorId, fromStatus: revision.status, toStatus: status, reason: 'Изменилась основная карточка; перевод требует повторной проверки.'}});
      await audit(tx, actorId, 'TRANSLATION_SOURCE_CHANGED', revision.id);
    }
    if (revision.authorId !== actorId) await tx.editorialNotice.create({data: {userId: revision.authorId, revisionId: revision.id, event: 'SOURCE_CHANGED'}});
  }
  const document = await catalogDocument(tx, itemId);
  await tx.documentTranslation.deleteMany({where: {documentId: document.id, locale: {not: 'ru'}}});
}
export async function applyDocumentPublication(
  tx: Prisma.TransactionClient,
  revision: {id: string; itemId: string; locale: string; payload: Prisma.JsonValue; catalogBaseVersion: number | null},
  target: string,
  actorId: string,
) {
  const document = await catalogDocument(tx, revision.itemId);
  if (target === 'ARCHIVED') {
    if (revision.locale === 'ru') {
      await invalidateTranslations(tx, revision.itemId, actorId);
      await tx.document.update({where: {id: document.id}, data: {isPublic: false, allowDigitalCopy: false, catalogVersion: {increment: 1}}});
      await tx.documentTranslation.deleteMany({where: {documentId: document.id}});
    } else await tx.documentTranslation.deleteMany({where: {documentId: document.id, locale: revision.locale}});
    return;
  }
  await validateDocumentRevision(tx, revision.itemId, revision.locale, revision.payload);
  if (revision.catalogBaseVersion !== document.catalogVersion) throw new ApiError(409, 'CATALOG_SOURCE_CHANGED', 'Основная карточка изменилась. Обновите и повторно согласуйте редакцию.');
  if (target !== 'PUBLISHED') return;
  if (revision.locale === 'ru') {
    const metadata = documentMetadataSchema.parse(revision.payload);
    await invalidateTranslations(tx, revision.itemId, actorId);
    await tx.document.update({where: {id: document.id}, data: {...metadata, isPublic: true, catalogVersion: {increment: 1}}});
  }
  const text = textProjection(revision.payload);
  await tx.documentTranslation.upsert({
    where: {documentId_locale: {documentId: document.id, locale: revision.locale}},
    create: {...text, documentId: document.id, locale: revision.locale, revisionId: revision.id},
    update: {...text, revisionId: revision.id},
  });
}

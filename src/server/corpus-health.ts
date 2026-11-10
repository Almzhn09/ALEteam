// TZ-A08: read-only editorial measurements, independent of visitor collection/B10.
import {Prisma} from '../generated/prisma/index.js';
import {db} from './db';
import {ApiError, idSchema, json, queryParams, rateLimit} from './http';
import {staffContext} from './staff';
import {allows} from './staff-policy';
import {locales} from '../contracts/cms';
import type {CorpusHealthCounts, CorpusHealthReport} from '../contracts/assistant-quality';
import {z} from 'zod';

type Publication = {locale: string; updatedAt: Date; valid: boolean};
export type HealthItem = {isDemo: boolean; restrictedCopy: boolean; publications: Publication[]};
function counts(items: readonly HealthItem[], cutoff: number): CorpusHealthCounts {
  const result: CorpusHealthCounts = {items: 0, demoItems: 0, restrictedCopies: 0, reviewDueItems: 0,
    invalidPublications: 0, locales: {ru: {published: 0, missing: 0}, kk: {published: 0, missing: 0}, en: {published: 0, missing: 0}}};
  for (const item of items) {
    if (!item.publications.length) result.invalidPublications++;
    result.invalidPublications += item.publications.filter(p => !p.valid || !locales.includes(p.locale as typeof locales[number])).length;
    const valid = item.publications.filter(p => p.valid && locales.includes(p.locale as typeof locales[number]));
    if (!valid.length) continue;
    result.items++;
    result.demoItems += Number(item.isDemo);
    result.restrictedCopies += Number(item.restrictedCopy);
    if (valid.some(p => p.updatedAt.getTime() < cutoff)) result.reviewDueItems++;
    for (const locale of locales) {
      const versions = valid.filter(p => p.locale === locale);
      if (versions.length) result.locales[locale].published++;
      else result.locales[locale].missing++;
      // A locale must have exactly one current published projection.
      result.invalidPublications += Math.max(0, versions.length - 1);
    }
  }
  return result;
}
export function corpusHealthReport(content: readonly HealthItem[], catalog: readonly HealthItem[], options: {
  now: Date; reviewAfterDays: number; branchIds: string[] | null;
}): CorpusHealthReport {
  if (!Number.isFinite(options.now.getTime()) || !Number.isInteger(options.reviewAfterDays)
    || options.reviewAfterDays < 1 || options.reviewAfterDays > 3650) throw Error('Invalid measurement options');
  const cutoff = options.now.getTime() - options.reviewAfterDays * 86400000;
  const report: CorpusHealthReport = {measuredAt: options.now.toISOString(),
    scope: {branchIds: options.branchIds === null ? null : [...options.branchIds].sort(), publicBranchesOnly: true},
    reviewAfterDays: options.reviewAfterDays, reviewPolicy: 'proposed-technical-threshold',
    content: counts(content, cutoff), catalog: counts(catalog, cutoff), recommendations: [],
    traffic: {status: 'not-connected', searches: null, emptyResults: null}, modelContribution: 'none-in-corpus-report'};
  for (const corpus of ['content', 'catalog'] as const) {
    const totals = report[corpus];
    for (const locale of locales) if (totals.locales[locale].missing) report.recommendations.push({
      action: 'review-missing-translations', corpus, locale, count: totals.locales[locale].missing,
      owner: 'translator-editor', method: 'corpus-rule', requiresHumanReview: true});
    if (totals.reviewDueItems) report.recommendations.push({action: 'verify-publication-age', corpus,
      count: totals.reviewDueItems, owner: 'editor', method: 'corpus-rule', requiresHumanReview: true});
    if (totals.invalidPublications) report.recommendations.push({action: 'check-publication-integrity', corpus,
      count: totals.invalidPublications, owner: 'administrator', method: 'corpus-rule', requiresHumanReview: true});
  }
  return report;
}

const scanLimit = 20000;
export async function readCorpusHealth(branchIds: string[] | null, reviewAfterDays = 180) {
  // One bounded, consistent DB snapshot. A too-large corpus is an explicit error, never a partial report.
  return db.$transaction(async tx => {
    const visible = {AND: [
      {OR: [{branchId: null}, {branch: {isPublic: true}}]},
      ...(branchIds === null ? [] : [{branchId: {in: branchIds}}]),
    ]};
    const itemWhere: Prisma.ContentItemWhereInput = {kind: {notIn: ['SETTING', 'ARCHIVE_DOCUMENT']}, ...visible,
      revisions: {some: {status: 'PUBLISHED'}}};
    const documentWhere: Prisma.DocumentWhereInput = {isPublic: true, deletedAt: null, fund: visible};
    const [contentSize, catalogSize] = await Promise.all([tx.contentItem.count({where: itemWhere}), tx.document.count({where: documentWhere})]);
    if (contentSize + catalogSize > scanLimit) throw new ApiError(503, 'QUALITY_SCAN_LIMIT', 'Корпус превышает предел проверки. Нужен пакетный отчёт.');
    // No content text, titles, user names, revision reasons, files or session/event data are read.
    const content = await tx.contentItem.findMany({where: itemWhere, select: {isDemo: true,
      revisions: {where: {status: 'PUBLISHED'}, select: {locale: true, updatedAt: true, authorId: true, reviewerId: true}}}});
    const documents = await tx.document.findMany({where: documentWhere, select: {isDemo: true, allowDigitalCopy: true, contentItemId: true,
      translations: {select: {locale: true, revision: {select: {locale: true, itemId: true, status: true, updatedAt: true, authorId: true, reviewerId: true}}}},
      updatedAt: true}});
    const contentItems: HealthItem[] = content.map(item => ({isDemo: item.isDemo, restrictedCopy: false,
      publications: item.revisions.map(r => ({locale: r.locale, updatedAt: r.updatedAt, valid: !!r.reviewerId && r.reviewerId !== r.authorId}))}));
    const catalogItems: HealthItem[] = documents.map(item => ({isDemo: item.isDemo, restrictedCopy: !item.allowDigitalCopy,
      publications: item.translations.map(t => ({locale: t.locale, updatedAt: t.revision?.updatedAt ?? item.updatedAt,
        valid: t.revision ? t.revision.status === 'PUBLISHED' && t.revision.locale === t.locale
          && t.revision.itemId === item.contentItemId && !!t.revision.reviewerId && t.revision.reviewerId !== t.revision.authorId
          : t.locale === 'ru' && item.contentItemId === null}))}));
    return corpusHealthReport(contentItems, catalogItems, {now: new Date(), reviewAfterDays, branchIds});
  }, {isolationLevel: 'RepeatableRead', timeout: 30000});
}
export async function assistantQuality(request: Request) {
  const context = await staffContext(request);
  const allowed = context.branches('analytics.read');
  if (allowed !== null && !allowed.length) throw new ApiError(403, 'FORBIDDEN', 'Недостаточно прав аналитика.');
  const params = z.object({branchId: idSchema.optional(), reviewAfterDays: z.coerce.number().int().min(1).max(3650).default(180)}).strict().parse(queryParams(request));
  if (params.branchId && !allows(context.grants, 'analytics.read', params.branchId)) throw new ApiError(403, 'FORBIDDEN', 'Недостаточно прав аналитика.');
  await rateLimit(`assistant-quality:${context.user.id}`, 30, 60);
  return json({item: await readCorpusHealth(params.branchId ? [params.branchId] : allowed, params.reviewAfterDays)});
}

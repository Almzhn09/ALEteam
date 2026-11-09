import { z } from 'zod';
import { locales } from '../contracts/cms';
export const archiveLocale = z.enum(locales);
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);
const sourceUrl = z.string().url().max(2000).refine(value => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
});
const tags = z.array(z.string().trim().min(1).max(60)).max(20).default([])
  .refine(values => new Set(values.map(v => v.normalize('NFKC').toLowerCase())).size === values.length);
export const documentTextSchema = z.object({
  title: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(4000),
  rights: z.string().trim().min(1).max(1000), sourceUrl: sourceUrl.nullable().default(null),
  sourceNote: nullableText(1000), authorName: nullableText(200), organization: nullableText(200),
  locality: nullableText(200), storageLocation: nullableText(500), accessConditions: nullableText(1000),
  category: nullableText(100), tags,
}).strict();
export const documentMetadataSchema = documentTextSchema.extend({
  reference: z.string().trim().min(1).max(120),
  caseId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).nullable().default(null),
  year: z.number().int().min(1).max(2100), yearTo: z.number().int().min(1).max(2100).nullable().default(null),
  type: z.enum(['LETTER', 'PHOTO', 'MAP', 'REPORT']), originalLanguage: nullableText(60),
  leafCount: z.number().int().min(0).max(2147483647).nullable().default(null), allowDigitalCopy: z.boolean().default(false),
}).refine(p => p.yearTo === null || p.yearTo >= p.year, {path: ['yearTo'], message: 'Invalid year range'});
export const createDocumentSchema = documentTextSchema.extend({
  fundId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  ...documentMetadataSchema.shape,
  isDemo: z.boolean().default(true), internalNotes: z.string().trim().max(2000).nullable().default(null),
}).omit({allowDigitalCopy: true}).refine(p => p.yearTo === null || p.yearTo >= p.year, {path: ['yearTo'], message: 'Invalid year range'});
export function parseDocumentPayload(locale: string, value: unknown) {
  return locale === 'ru' ? documentMetadataSchema.parse(value) : documentTextSchema.parse(value);
}
export function textProjection(value: unknown) {
  // Explicit whitelist: structural and administrative fields never become translated text.
  return documentTextSchema.strip().parse(value);
}

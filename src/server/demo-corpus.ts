import { createHash } from 'node:crypto';
import { z } from 'zod';
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const document = z.object({
  id: z.string().regex(/^demo-doc-\d{2}$/), title: z.string().startsWith('Демо:'), description: z.string().min(100).max(4000),
  year: z.number().int().min(1).max(2100), type: z.enum(['LETTER','PHOTO','MAP','REPORT']),
  reference: z.string().regex(/^DEMO-Ф[12]-О1-Д\d+$/), fundId: z.enum(['demo-fund-1','demo-fund-2']),
  keywords: z.string(), isDemo: z.literal(true), sourceUrl: z.null(),
  provenance: z.object({ creator: z.literal('ALEteam'), origin: z.string().min(1), license: z.literal('CC0-1.0'), historicalClaim: z.literal(false), createdOn: z.iso.date(), sha256: hash }).strict(),
}).strict();
const scan = z.object({
  id: z.string().regex(/^demo-scan-\d+$/), documentId: z.string(), storageKey: z.string().regex(/^demo-doc-\d{2}\.png$/),
  mimeType: z.literal('image/png'), size: z.number().int().positive().max(20 * 1024 * 1024), sha256: hash, sourceTextSha256: hash,
  creator: z.literal('ALEteam'), license: z.literal('CC0-1.0'), historicalScan: z.literal(false), provenance: z.string().min(1),
}).strict();
export function validateDemoCorpus(records: unknown, images: unknown) {
  const documents = z.array(document).min(20).parse(records);
  const scans = z.array(scan).min(5).parse(images);
  const unique = (values: string[]) => { if (new Set(values).size !== values.length) throw new Error('DUPLICATE_CORPUS_IDENTIFIER'); };
  unique(documents.map(d => d.id)); unique(documents.map(d => d.reference)); unique(scans.map(s => s.id)); unique(scans.map(s => s.storageKey));
  for (const d of documents) {
    if (!d.description.includes('ДЕМОНСТРАЦИОННЫЙ') || createHash('sha256').update(d.description).digest('hex') !== d.provenance.sha256) throw new Error('CORPUS_TEXT_INTEGRITY_MISMATCH');
  }
  for (const s of scans) {
    const source = documents.find(d => d.id === s.documentId);
    if (!source || source.provenance.sha256 !== s.sourceTextSha256 || s.storageKey !== `${source.id}.png`) throw new Error('SCAN_SOURCE_MISMATCH');
  }
  return { documents, scans };
}

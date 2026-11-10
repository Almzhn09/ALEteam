// B08 metadata interchange. Original accounting identifiers are strings and never normalized.
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {documentMetadataSchema, documentTextSchema} from './archive-schema';
const key = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/u);
const number = z.string().min(1).max(80).refine(v => v.trim() === v && !/[\x00-\x1f\x7f]/u.test(v));
const title = z.string().trim().min(1).max(200);
const importMetadata = z.object({...documentMetadataSchema.shape, caseId: z.never().optional()}).strict()
  .refine(p => p.yearTo === null || p.yearTo >= p.year, {path: ['yearTo'], message: 'Invalid year range'});
export const catalogImportSchema = z.object({
  version: z.literal(1), branchId: key, sourceNamespace: key, isDemo: z.boolean().default(true),
  funds: z.array(z.object({key, number, name: title, description: z.string().trim().min(1).max(2000)}).strict()).min(1).max(100),
  inventories: z.array(z.object({key, fundKey: key, number, title}).strict()).max(100),
  cases: z.array(z.object({key, inventoryKey: key, number, title}).strict()).max(100),
  documents: z.array(z.object({sourceId: z.string().min(1).max(120).refine(v => v.trim() === v && !/[\x00-\x1f\x7f]/u.test(v)),
    fundKey: key, caseKey: key.nullable().default(null), metadata: importMetadata,
    translations: z.object({kk: documentTextSchema.optional(), en: documentTextSchema.optional()}).strict().default({}),
  }).strict()).min(1).max(100),
}).strict();
export type CatalogImportManifest = z.infer<typeof catalogImportSchema>;
export interface ImportIssue {path: string; code: string}
export function canonicalHash(input: unknown): string {
  function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => [k, stable(v)]));
    return value;
  }
  return createHash('sha256').update(JSON.stringify(stable(input))).digest('hex');
}
export function importManifestDigest(manifest: CatalogImportManifest) {
  const compare = (a: {key: string}, b: {key: string}) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  return canonicalHash({...manifest, funds: [...manifest.funds].sort(compare), inventories: [...manifest.inventories].sort(compare), cases: [...manifest.cases].sort(compare),
    documents: [...manifest.documents].sort((a,b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0)});
}
export function importStructureIssues(manifest: CatalogImportManifest): ImportIssue[] {
  const issues: ImportIssue[] = []; const issue = (path: string, code: string) => issues.push({path, code});
  for (const kind of ['funds','inventories','cases'] as const) {
    const keys = new Set<string>(), numbers = new Set<string>();
    manifest[kind].forEach((row,index) => {
      const parent = 'fundKey' in row ? row.fundKey : 'inventoryKey' in row ? row.inventoryKey : manifest.branchId;
      const compound = JSON.stringify([parent, row.number]);
      if (keys.has(row.key)) issue(`${kind}.${index}.key`, 'duplicate-key');
      if (numbers.has(compound)) issue(`${kind}.${index}.number`, 'duplicate-number-in-parent');
      keys.add(row.key); numbers.add(compound);
    });
  }
  const funds = new Map(manifest.funds.map(row => [row.key,row]));
  const inventories = new Map(manifest.inventories.map(row => [row.key,row]));
  const cases = new Map(manifest.cases.map(row => [row.key,row]));
  manifest.inventories.forEach((row,i) => {if (!funds.has(row.fundKey)) issue(`inventories.${i}.fundKey`, 'missing-parent');});
  manifest.cases.forEach((row,i) => {if (!inventories.has(row.inventoryKey)) issue(`cases.${i}.inventoryKey`, 'missing-parent');});
  const sources = new Set<string>(), references = new Set<string>();
  manifest.documents.forEach((row,i) => {
    if (!funds.has(row.fundKey)) issue(`documents.${i}.fundKey`, 'missing-parent');
    if (row.caseKey !== null && !cases.has(row.caseKey)) issue(`documents.${i}.caseKey`, 'missing-parent');
    const caseRow = row.caseKey ? cases.get(row.caseKey) : undefined;
    if (caseRow && inventories.get(caseRow.inventoryKey)?.fundKey !== row.fundKey) issue(`documents.${i}.caseKey`, 'wrong-fund');
    if (sources.has(row.sourceId)) issue(`documents.${i}.sourceId`, 'duplicate-source');
    if (references.has(row.metadata.reference)) issue(`documents.${i}.metadata.reference`, 'duplicate-reference');
    sources.add(row.sourceId); references.add(row.metadata.reference);
    for (const [locale,payload] of [['ru',row.metadata],...Object.entries(row.translations)] as const) {
      if (!payload) continue;
      if (!manifest.isDemo && !payload.sourceUrl && !payload.sourceNote) issue(`documents.${i}.${locale}`, 'source-required');
    }
  });
  return issues;
}
export function importDocumentHash(manifest: CatalogImportManifest, row: CatalogImportManifest['documents'][number]) {
  const fund = manifest.funds.find(f => f.key === row.fundKey);
  const caseRow = row.caseKey ? manifest.cases.find(c => c.key === row.caseKey) : undefined;
  const inventory = caseRow ? manifest.inventories.find(i => i.key === caseRow.inventoryKey) : undefined;
  return canonicalHash({fundNumber: fund?.number, inventoryNumber: inventory?.number ?? null, caseNumber: caseRow?.number ?? null,
    isDemo: manifest.isDemo, metadata: row.metadata, translations: row.translations});
}

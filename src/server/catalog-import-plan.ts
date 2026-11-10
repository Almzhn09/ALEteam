import type {Prisma} from '../generated/prisma/index.js';
import {canonicalHash, importDocumentHash, importStructureIssues, type CatalogImportManifest, type ImportIssue} from './catalog-import-schema';
import {documentMetadataSchema, documentTextSchema} from './archive-schema';
export interface ImportRowPlan {index: number; sourceId: string; action: 'CREATE' | 'UNCHANGED' | 'BLOCKED'; documentId?: string; contentHash: string}
export interface ImportPlan {valid: boolean; issues: ImportIssue[]; rows: ImportRowPlan[]; counts: {create: number; unchanged: number}; publication: 'draft-only'}
type Database = Prisma.TransactionClient;
export async function validateCatalogImport(tx: Database, manifest: CatalogImportManifest) {
  const issues = importStructureIssues(manifest);
  const funds = new Map<string,string>(), inventories = new Map<string,string>(), cases = new Map<string,string>();
  const rows: ImportRowPlan[] = [];
  const finish = () => ({report: {valid: !issues.length, issues, rows, counts: {create: rows.filter(r => r.action === 'CREATE').length,
    unchanged: rows.filter(r => r.action === 'UNCHANGED').length}, publication: 'draft-only'} satisfies ImportPlan, funds, inventories, cases});
  if (issues.length) {
    manifest.documents.forEach((row,index) => rows.push({index, sourceId: row.sourceId, action: 'BLOCKED', contentHash: importDocumentHash(manifest,row)}));
    return finish();
  }
  for (const [index,row] of manifest.funds.entries()) {
    const existing = await tx.fund.findFirst({where: {branchId: manifest.branchId, number: row.number}});
    if (existing) {
      funds.set(row.key, existing.id);
      if (existing.name !== row.name || existing.description !== row.description) issues.push({path: `funds.${index}`, code: 'existing-node-differs'});
    }
  }
  for (const [index,row] of manifest.inventories.entries()) {
    const fundId = funds.get(row.fundKey);
    const existing = fundId ? await tx.inventory.findFirst({where: {fundId, number: row.number}}) : undefined;
    if (existing) {inventories.set(row.key, existing.id); if (existing.title !== row.title) issues.push({path: `inventories.${index}`, code: 'existing-node-differs'});}
  }
  for (const [index,row] of manifest.cases.entries()) {
    const inventoryId = inventories.get(row.inventoryKey);
    const existing = inventoryId ? await tx.archivalCase.findFirst({where: {inventoryId, number: row.number}}) : undefined;
    if (existing) {cases.set(row.key, existing.id); if (existing.title !== row.title) issues.push({path: `cases.${index}`, code: 'existing-node-differs'});}
  }
  for (const [index,row] of manifest.documents.entries()) {
    const contentHash = importDocumentHash(manifest,row);
    const mapped = await tx.catalogImportSource.findUnique({where: {branchId_sourceNamespace_sourceId: {
      branchId: manifest.branchId, sourceNamespace: manifest.sourceNamespace, sourceId: row.sourceId}},
      include: {document: {include: {fund: true, archivalCase: {include: {inventory: true}}, contentItem: {include: {revisions: {orderBy: {version: 'desc'}}}}}}}});
    let action: ImportRowPlan['action'] = 'CREATE'; let documentId: string | undefined;
    if (mapped) {
      documentId = mapped.documentId;
      const document = mapped.document;
      let currentMatches = !document.deletedAt && document.isDemo === manifest.isDemo && document.fund.branchId === manifest.branchId && document.fundId === funds.get(row.fundKey)
        && document.caseId === (row.caseKey === null ? null : cases.get(row.caseKey));
      const revision = document.contentItem?.revisions.find(r => r.locale === 'ru');
      const parsed = revision ? documentMetadataSchema.safeParse(revision.payload) : undefined;
      if (!parsed?.success || revision?.status === 'ARCHIVED') currentMatches = false;
      else {const {caseId: _case, ...metadata} = parsed.data; if (canonicalHash(metadata) !== canonicalHash(row.metadata)) currentMatches = false;}
      for (const [locale,payload] of Object.entries(row.translations)) {
        if (!payload) continue;
        const translated = document.contentItem?.revisions.find(r => r.locale === locale);
        const parsedTranslation = translated ? documentTextSchema.safeParse(translated.payload) : undefined;
        if (!parsedTranslation?.success || translated?.status === 'ARCHIVED' || canonicalHash(parsedTranslation.data) !== canonicalHash(payload)) currentMatches = false;
      }
      if (mapped.contentHash !== contentHash || !currentMatches) {action = 'BLOCKED'; issues.push({path: `documents.${index}`, code: 'source-or-destination-changed'});}
      else action = 'UNCHANGED';
    } else if (await tx.document.count({where: {reference: row.metadata.reference}})) {
      action = 'BLOCKED'; issues.push({path: `documents.${index}.metadata.reference`, code: 'reference-in-use'});
    }
    rows.push({index, sourceId: row.sourceId, action, ...(documentId ? {documentId} : {}), contentHash});
  }
  return finish();
}

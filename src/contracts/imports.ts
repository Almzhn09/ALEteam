import type {DocumentMetadataInput, DocumentTextInput} from './catalog';
export interface CatalogImportInput {
  version: 1; branchId: string; sourceNamespace: string; isDemo?: boolean;
  funds: {key: string; number: string; name: string; description: string}[];
  inventories: {key: string; fundKey: string; number: string; title: string}[];
  cases: {key: string; inventoryKey: string; number: string; title: string}[];
  documents: {sourceId: string; fundKey: string; caseKey?: string | null;
    metadata: Omit<DocumentMetadataInput, 'caseId'>; translations?: {kk?: DocumentTextInput; en?: DocumentTextInput}}[];
}
export interface CatalogImportControl {expectedUpdatedAt: string; digest: string}
export interface CatalogImportReport {
  valid: boolean; issues: {path: string; code: string}[];
  rows: {index: number; sourceId: string; action: 'CREATE' | 'UNCHANGED' | 'BLOCKED'; documentId?: string; contentHash: string}[];
  counts: {create: number; unchanged: number}; publication: 'draft-only';
}
export interface CatalogImportDTO {
  id: string; branchId: string; sourceNamespace: string; authorId: string; digest: string;
  state: 'READY' | 'VALIDATION_FAILED' | 'COMMITTED' | 'ROLLED_BACK' | 'CANCELLED';
  report: CatalogImportReport; createdDocuments: {id: string; updatedAt: string; revisions: {id: string; updatedAt: string}[]}[];
  createdAt: string; updatedAt: string; manifest?: CatalogImportInput;
}

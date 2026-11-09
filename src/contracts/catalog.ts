import type { ContentLocale, PublicationState } from './cms';
export type DocumentType = 'LETTER' | 'PHOTO' | 'MAP' | 'REPORT';
export interface DocumentTextInput {
  title: string;
  description: string;
  rights: string;
  sourceUrl?: string | null;
  sourceNote?: string | null;
  authorName?: string | null;
  organization?: string | null;
  locality?: string | null;
  storageLocation?: string | null;
  accessConditions?: string | null;
  category?: string | null;
  tags?: string[];
}
export interface DocumentMetadataInput extends DocumentTextInput {
  reference: string;
  caseId?: string | null;
  year: number;
  yearTo?: number | null;
  type: DocumentType;
  originalLanguage?: string | null;
  leafCount?: number | null;
  allowDigitalCopy?: boolean;
}
export interface DocumentCreateInput extends Omit<DocumentMetadataInput, 'allowDigitalCopy'> {
  fundId: string;
  isDemo?: boolean;
  internalNotes?: string | null;
}
export type DocumentRevisionInput = {locale: 'ru'; payload: DocumentMetadataInput}
  | {locale: 'kk' | 'en'; payload: DocumentTextInput};
export interface CatalogRevision {
  id: string;
  itemId: string;
  locale: ContentLocale;
  version: number;
  status: PublicationState;
  payload: DocumentMetadataInput | DocumentTextInput;
  authorId: string;
  reviewerId: string | null;
  catalogBaseVersion: number;
  createdAt: string;
  updatedAt: string;
}
export interface CatalogFilters {
  q?: string;
  locale?: ContentLocale;
  branchId?: string;
  fundId?: string;
  inventoryId?: string;
  caseId?: string;
  fundNumber?: string;
  inventoryNumber?: string;
  caseNumber?: string;
  reference?: string;
  author?: string;
  organization?: string;
  locality?: string;
  originalLanguage?: string;
  category?: string;
  tag?: string;
  type?: DocumentType;
  yearFrom?: number;
  yearTo?: number;
  sort?: 'year_asc' | 'year_desc' | 'title';
  page?: number;
  pageSize?: number;
}
export type CatalogTimestamp = {expectedUpdatedAt: string};
export type DocumentNotesInput = CatalogTimestamp & {internalNotes: string | null};

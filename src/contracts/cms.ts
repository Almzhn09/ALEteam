/** Browser-safe CMS contracts. Dates are ISO 8601 strings; never import server/db here. */
export const locales = ['ru', 'kk', 'en'] as const;
export type ContentLocale = typeof locales[number];
export const contentKinds = [
  'PAGE', 'FAQ', 'NEWS', 'COLLECTION', 'PERSON', 'EVENT', 'MEMOIR',
  'EXHIBITION', 'EXHIBIT', 'BRANCH_PROFILE', 'SETTING',
] as const;
export type ContentKind = typeof contentKinds[number];
export const publicationStates = [
  'DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED',
] as const;
export type PublicationState = typeof publicationStates[number];
export type StaffGrant = { permission: string; branchId: string | null };
export type StaffMe = { item: { id: string; name: string; grants: StaffGrant[] } };
export interface ContentPayload {
  navigation?: {key:string;label:string;href?:string;material?:{kind:'document'|'cms';id:string};zone?:'header'|'footer'|'home';children?:{key:string;label:string;href?:string;material?:{kind:'document'|'cms';id:string};zone?:'header'|'footer'|'home'}[]}[];
  title: string;
  /** Plain text. Render as text, never dangerouslySetInnerHTML. */
  body: string;
  rights: string;
  sourceUrl?: string;
  sourceNote?: string;
  date?: string;
  yearFrom?: number;
  yearTo?: number;
  category?: string;
  tags: string[];
  documentIds: string[];
  contentIds: string[];
  fileIds: string[];
  /** Ordered list of content item IDs of kind EXHIBIT. */
  exhibitIds: string[];
  address?: string;
  phone?: string;
  email?: string;
  hours?: string;
  latitude?: number;
  longitude?: number;
  seoDescription?: string;
  seoKeywords: string[];
  links: { label: string; url: string }[];
}
type DefaultedPayloadFields = 'tags' | 'documentIds' | 'contentIds' | 'fileIds' | 'exhibitIds' | 'seoKeywords' | 'links';
export type ContentPayloadInput = Omit<ContentPayload, DefaultedPayloadFields> & Partial<Pick<ContentPayload, DefaultedPayloadFields>>;
export interface ContentRevision {
  id: string;
  itemId: string;
  locale: ContentLocale;
  version: number;
  status: PublicationState;
  payload: ContentPayload;
  authorId: string;
  reviewerId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface StaffContentItem {
  id: string;
  slug: string;
  kind: ContentKind;
  branchId: string | null;
  isDemo: boolean;
  createdAt: string;
  revisions: ContentRevision[];
}
export interface PublicContentItem {
  id: string;
  slug: string;
  kind: ContentKind;
  branchId: string | null;
  isDemo: boolean;
  locale: ContentLocale;
  availableLocales: ContentLocale[];
  updatedAt: string;
  payload: ContentPayload;
}
export interface ContentCreateInput {
  slug: string;
  kind: ContentKind;
  branchId?: string | null;
  isDemo?: boolean;
  locale: ContentLocale;
  payload: ContentPayloadInput;
}
export interface NewRevisionInput { locale: ContentLocale; payload: ContentPayloadInput }
export interface RevisionEditInput { expectedUpdatedAt: string; payload: ContentPayloadInput }
export interface RevisionTransitionInput {
  status: Exclude<PublicationState, 'DRAFT'>;
  expectedUpdatedAt: string;
  reason: string;
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface ApiFailure { error: { code: string; message: string; fields?: { path: string; code: string }[] } }

// Frontend-safe DTOs: do not import src/server modules into client components.
export type DocumentType = 'LETTER' | 'PHOTO' | 'MAP' | 'REPORT';
export type CommentStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'HIDDEN';
export type UserRole = 'AUTHOR' | 'MODERATOR';
export interface Page<T> { items: T[]; page: number; pageSize: number; total: number }
export interface ApiErrorBody { error: { code: string; message: string; fields?: { path: string; code: string }[] } }
export interface CatalogQuery {
  q?: string; fundId?: string; type?: DocumentType; yearFrom?: number; yearTo?: number;
  sort?: 'year_asc' | 'year_desc' | 'title'; page?: number; pageSize?: number;
}
export interface Fund { id: string; name: string; description: string }
export interface DocumentSummary {
  id: string; title: string; description: string; reference: string;
  year: number; type: DocumentType; fundId: string; isDemo: boolean;
}
export interface ArchiveFile { id: string; name: string; mimeType: string; size: number; downloadable: boolean }
export interface DocumentDetail extends DocumentSummary {
  sourceUrl: string | null; rights: string; isPublic: boolean; createdAt: string;
  fund: Fund; files: ArchiveFile[];
}
export interface CurrentUser { id: string; name: string; email: string; role: UserRole }
export interface PublicComment { id: string; parentId?: string | null; body: string; createdAt: string; author: { name: string } }
export interface OwnComment {
  id: string; documentId: string; body: string; status: CommentStatus; reason: string; createdAt: string;
}
export interface CreatedComment extends OwnComment {
  authorId: string; parentId?: string | null; moderationVersion: string; idempotencyKey: string; updatedAt: string;
}
export type Favorite = Pick<DocumentSummary, 'id' | 'title' | 'reference' | 'year' | 'type' | 'isDemo'> & { savedAt: string };
export interface NotificationItem {
  id: string; kind: 'COMMENT_REPLY' | 'MODERATION_DECISION'; status: CommentStatus | null;
  createdAt: string; readAt: string | null; commentId: string; documentId: string;
}
export interface NotificationSettings { notifyReplies: boolean; notifyModeration: boolean }
export interface ModerationQueueItem extends CreatedComment {
  author: { id: string; name: string };
  reports: { id: string; reason: string; createdAt: string }[];
}
export interface ModerationInput {
  status: 'PUBLISHED' | 'REJECTED' | 'HIDDEN'; reason: string; expectedUpdatedAt: string;
}
export interface AssistantInput { question: string; history?: { role: 'user' | 'assistant'; content: string }[] }
export interface AssistantAnswer {
  answer: string; noAnswer: boolean; mode: 'retrieval' | 'llm' | 'external';
  sources: { id: string; title: string; isDemo: boolean; kind: 'document' | 'guide'; href: string }[];
}

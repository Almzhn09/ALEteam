export const uploadStates = ['AWAITING_CONTENT','RECEIVING','QUARANTINED','APPROVED','REJECTED','PUBLISHED','FAILED'] as const;
export type UploadState = typeof uploadStates[number];
export type UploadMime = 'application/pdf' | 'image/png' | 'image/jpeg' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export interface UploadCreateInput {
  documentId: string; originalName: string; mimeType: UploadMime;
  expectedBytes: number; expectedSha256: string; rights: string; sourceNote: string;
}
export interface UploadPublishInput {expectedUpdatedAt: string; downloadable?: boolean}
export interface ArchiveUploadDTO extends UploadCreateInput {
  id: string; uploaderId: string; reviewerId: string | null; fileId: string | null;
  actualBytes: number | null; actualSha256: string | null; state: UploadState;
  failureCode: string | null; reviewReason: string | null; rightsConfirmed: boolean;
  createdAt: string; updatedAt: string;
  inspection: {method: string; fullFormatParsing: boolean; antivirus: 'not-configured'; parserState?: 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED'; pages?: number; limitations?: string[]};
}

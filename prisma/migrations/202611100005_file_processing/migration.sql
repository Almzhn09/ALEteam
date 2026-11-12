ALTER TABLE "ArchiveUpload" ADD COLUMN inspection jsonb;
ALTER TABLE "ArchiveFile" ADD COLUMN variant text NOT NULL DEFAULT 'master',ADD COLUMN "parentFileId" text;
CREATE TABLE "UploadInspectionJob"(id text PRIMARY KEY,"uploadId" text NOT NULL UNIQUE REFERENCES "ArchiveUpload"(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'QUEUED' CHECK(state IN('QUEUED','RUNNING','PASSED','FAILED')),attempts integer NOT NULL DEFAULT 0,
 "leaseToken" text,"leaseUntil" timestamp(3),result jsonb,"failureCode" text,"previewStorageKey" text,"previewSha256" text,"previewBytes" integer,"previewFileId" text UNIQUE,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX ON "UploadInspectionJob"(state,"leaseUntil");
CREATE TABLE "FileImportPreview"(id text PRIMARY KEY,"branchId" text NOT NULL REFERENCES "ArchiveBranch"(id),"authorId" text NOT NULL,
 "sourceNamespace" text NOT NULL,format text NOT NULL,"sourceHash" text NOT NULL,"originalBytes" bytea NOT NULL,mapping jsonb NOT NULL,result jsonb NOT NULL,
 "catalogBatchId" text,"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX ON "FileImportPreview"("branchId","createdAt",id);

CREATE TABLE "ArchiveUpload" (
 id text PRIMARY KEY,
 "documentId" text NOT NULL REFERENCES "Document"(id),
 "uploaderId" text NOT NULL REFERENCES "User"(id),
 "reviewerId" text REFERENCES "User"(id),
 "fileId" text UNIQUE REFERENCES "ArchiveFile"(id),
 "originalName" text NOT NULL,
 "mimeType" text NOT NULL CHECK ("mimeType" IN ('application/pdf','image/png','image/jpeg')),
 "expectedBytes" integer NOT NULL CHECK ("expectedBytes">0 AND "expectedBytes"<=20971520),
 "expectedSha256" text NOT NULL CHECK ("expectedSha256" ~ '^[a-f0-9]{64}$'),
 "actualBytes" integer,
 "actualSha256" text CHECK ("actualSha256" IS NULL OR "actualSha256" ~ '^[a-f0-9]{64}$'),
 rights text NOT NULL,
 "sourceNote" text NOT NULL,
 state text NOT NULL DEFAULT 'AWAITING_CONTENT' CHECK (state IN ('AWAITING_CONTENT','RECEIVING','QUARANTINED','APPROVED','REJECTED','PUBLISHED','FAILED')),
 "storageKey" text UNIQUE,
 "receiveToken" text,
 "failureCode" text,
 "reviewReason" text,
 "rightsConfirmed" boolean NOT NULL DEFAULT false,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (state NOT IN ('QUARANTINED','APPROVED','PUBLISHED') OR
   ("actualBytes" IS NOT NULL AND "actualSha256" IS NOT NULL AND "actualBytes"="expectedBytes" AND "actualSha256"="expectedSha256" AND "storageKey" IS NOT NULL)),
 CHECK (state NOT IN ('APPROVED','PUBLISHED') OR
   ("reviewerId" IS NOT NULL AND "reviewerId"<>"uploaderId" AND "rightsConfirmed")),
 CHECK (state<>'PUBLISHED' OR "fileId" IS NOT NULL)
);
CREATE INDEX "ArchiveUpload_documentId_createdAt_idx" ON "ArchiveUpload"("documentId","createdAt");
CREATE INDEX "ArchiveUpload_uploaderId_state_idx" ON "ArchiveUpload"("uploaderId",state);

CREATE TABLE "CatalogImport" (
 id text PRIMARY KEY,
 "branchId" text NOT NULL REFERENCES "ArchiveBranch"(id),
 "sourceNamespace" text NOT NULL,
 "authorId" text NOT NULL REFERENCES "User"(id),
 manifest jsonb NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN ('READY','VALIDATION_FAILED','COMMITTED','ROLLED_BACK','CANCELLED')),
 report jsonb NOT NULL,
 "createdDocuments" jsonb NOT NULL DEFAULT '[]'::jsonb,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,"branchId","sourceNamespace")
);
CREATE INDEX "CatalogImport_branchId_createdAt_idx" ON "CatalogImport"("branchId","createdAt");
CREATE TABLE "CatalogImportSource" (
 "branchId" text NOT NULL,
 "sourceNamespace" text NOT NULL,
 "sourceId" text NOT NULL,
 "batchId" text NOT NULL,
 "documentId" text NOT NULL UNIQUE REFERENCES "Document"(id),
 "contentHash" text NOT NULL CHECK("contentHash" ~ '^[a-f0-9]{64}$'),
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("branchId","sourceNamespace","sourceId"),
 FOREIGN KEY("batchId","branchId","sourceNamespace") REFERENCES "CatalogImport"(id,"branchId","sourceNamespace")
);

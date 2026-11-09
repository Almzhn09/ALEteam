ALTER TYPE "ContentKind" ADD VALUE 'ARCHIVE_DOCUMENT';
ALTER TABLE "Fund" ADD COLUMN "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Inventory" ADD COLUMN "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ArchivalCase" ADD COLUMN "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "Fund_branchId_number_key" ON "Fund"("branchId",number);
ALTER TABLE "Document" ADD COLUMN "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "deletedAt" timestamp(3), ADD COLUMN "contentItemId" text UNIQUE REFERENCES "ContentItem"(id),
 ADD COLUMN category text, ADD COLUMN tags text[] NOT NULL DEFAULT '{}', ADD COLUMN "sourceNote" text,
 ADD COLUMN "catalogVersion" integer NOT NULL DEFAULT 0 CHECK("catalogVersion">=0);
ALTER TABLE "ContentRevision" ADD COLUMN "catalogBaseVersion" integer CHECK("catalogBaseVersion">=0);
CREATE TABLE "DocumentTranslation"(
 "documentId" text NOT NULL REFERENCES "Document"(id) ON DELETE CASCADE,
 locale text NOT NULL CHECK(locale IN ('ru','kk','en')),
 title text NOT NULL, description text NOT NULL, rights text NOT NULL,
 "authorName" text, organization text, locality text, "storageLocation" text, "accessConditions" text,
 category text, tags text[] NOT NULL DEFAULT '{}', "sourceUrl" text, "sourceNote" text,
 "revisionId" text UNIQUE REFERENCES "ContentRevision"(id),
 PRIMARY KEY("documentId",locale),
 "searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, title||' '||description||' '||COALESCE("authorName",'')||' '||COALESCE(organization,'')||' '||COALESCE(locality,'')||' '||COALESCE(category,''))) STORED,
 "russianVector" tsvector GENERATED ALWAYS AS (to_tsvector('russian'::regconfig, title||' '||description||' '||COALESCE("authorName",'')||' '||COALESCE(organization,'')||' '||COALESCE(locality,'')||' '||COALESCE(category,''))) STORED
);
CREATE INDEX "DocumentTranslation_search_idx" ON "DocumentTranslation" USING GIN("searchVector");
CREATE INDEX "DocumentTranslation_russian_idx" ON "DocumentTranslation" USING GIN("russianVector");
CREATE INDEX "DocumentTranslation_tags_idx" ON "DocumentTranslation" USING GIN(tags);
CREATE INDEX "Document_caseId_idx" ON "Document"("caseId");
CREATE INDEX "Document_originalLanguage_idx" ON "Document"("originalLanguage");
-- Preserve approved legacy public cards without inventing a reviewer or publication event.
INSERT INTO "DocumentTranslation"("documentId",locale,title,description,rights,"authorName",organization,locality,"storageLocation","accessConditions",category,tags,"sourceUrl","sourceNote")
 SELECT id,'ru',title,description,rights,"authorName",organization,locality,"storageLocation","accessConditions",category,tags,"sourceUrl","sourceNote" FROM "Document" WHERE "isPublic"=true;

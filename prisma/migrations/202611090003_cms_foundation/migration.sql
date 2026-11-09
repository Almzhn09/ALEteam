ALTER TABLE "User" ADD COLUMN "isActive" boolean NOT NULL DEFAULT true;
ALTER TABLE "Session" ADD COLUMN "lastActivityAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "ArchiveBranch"(id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
 "isPublic" boolean NOT NULL DEFAULT false, "isDemo" boolean NOT NULL DEFAULT true,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE "Fund" ADD COLUMN "branchId" text REFERENCES "ArchiveBranch"(id), ADD COLUMN number text;
CREATE TABLE "Inventory"(id text PRIMARY KEY, "fundId" text NOT NULL REFERENCES "Fund"(id), number text NOT NULL, title text NOT NULL,
 UNIQUE(id,"fundId"),UNIQUE("fundId",number));
CREATE TABLE "ArchivalCase"(id text PRIMARY KEY,"inventoryId" text NOT NULL,"fundId" text NOT NULL,number text NOT NULL,title text NOT NULL,
 FOREIGN KEY("inventoryId","fundId") REFERENCES "Inventory"(id,"fundId"), UNIQUE(id,"fundId"),UNIQUE("inventoryId",number));
ALTER TABLE "Document" ADD COLUMN "caseId" text, ADD COLUMN "authorName" text, ADD COLUMN organization text,
 ADD COLUMN locality text, ADD COLUMN "originalLanguage" text, ADD COLUMN "leafCount" integer CHECK("leafCount">=0),
 ADD COLUMN "yearTo" integer, ADD COLUMN "storageLocation" text, ADD COLUMN "accessConditions" text,
 ADD COLUMN "internalNotes" text, ADD COLUMN "allowDigitalCopy" boolean NOT NULL DEFAULT false,
 ADD FOREIGN KEY("caseId","fundId") REFERENCES "ArchivalCase"(id,"fundId"),
 ADD CHECK("yearTo" IS NULL OR "yearTo">=year);
-- Preserve previously approved demo/public file access; new documents default to no copy access.
UPDATE "Document" SET "allowDigitalCopy"=true WHERE "isPublic"=true;
CREATE TABLE "StaffRole"(id text PRIMARY KEY,name text NOT NULL);
CREATE TABLE "StaffPermission"("roleId" text REFERENCES "StaffRole"(id) ON DELETE CASCADE,permission text NOT NULL,PRIMARY KEY("roleId",permission));
CREATE TABLE "StaffAssignment"(id text PRIMARY KEY,"userId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 "roleId" text NOT NULL REFERENCES "StaffRole"(id),"branchId" text REFERENCES "ArchiveBranch"(id),"scopeKey" text NOT NULL,
 CHECK("scopeKey"=COALESCE("branchId",'*')),UNIQUE("userId","roleId","scopeKey"));
CREATE TABLE "AuditEvent"(id text PRIMARY KEY,"actorId" text NOT NULL REFERENCES "User"(id),action text NOT NULL,"entityId" text NOT NULL,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX ON "AuditEvent"("createdAt",id);
CREATE TYPE "ContentKind" AS ENUM('PAGE','FAQ','NEWS','COLLECTION','PERSON','EVENT','MEMOIR','EXHIBITION','EXHIBIT','BRANCH_PROFILE','SETTING');
CREATE TYPE "PublicationState" AS ENUM('DRAFT','IN_REVIEW','CHANGES_REQUESTED','APPROVED','PUBLISHED','ARCHIVED');
CREATE TABLE "ContentItem"(id text PRIMARY KEY,slug text NOT NULL UNIQUE,kind "ContentKind" NOT NULL,"branchId" text REFERENCES "ArchiveBranch"(id),
 "isDemo" boolean NOT NULL DEFAULT true,"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "ContentRevision"(id text PRIMARY KEY,"itemId" text NOT NULL REFERENCES "ContentItem"(id),locale text NOT NULL CHECK(locale IN ('ru','kk','en')),
 version integer NOT NULL CHECK(version>0),status "PublicationState" NOT NULL DEFAULT 'DRAFT',payload jsonb NOT NULL,
 "authorId" text NOT NULL REFERENCES "User"(id),"reviewerId" text REFERENCES "User"(id),
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("itemId",locale,version));
CREATE UNIQUE INDEX "one_published_content_locale" ON "ContentRevision"("itemId",locale) WHERE status='PUBLISHED';
CREATE INDEX ON "ContentRevision"(status,"itemId",locale);
CREATE TABLE "EditorialNotice"(id text PRIMARY KEY,"userId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 "revisionId" text NOT NULL REFERENCES "ContentRevision"(id),event text NOT NULL,"readAt" timestamp(3),"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX ON "EditorialNotice"("userId","createdAt");
INSERT INTO "StaffRole"(id,name) VALUES ('SUPERADMIN','Главный администратор');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SUPERADMIN','staff.users.manage');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SUPERADMIN','staff.roles.manage');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SUPERADMIN','branches.manage');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SUPERADMIN','catalog.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SUPERADMIN','catalog.write');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SUPERADMIN','content.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SUPERADMIN','content.write');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SUPERADMIN','content.review');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SUPERADMIN','content.publish');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SUPERADMIN','audit.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SUPERADMIN','analytics.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SUPERADMIN','settings.manage');
INSERT INTO "StaffRole"(id,name) VALUES ('SITE_ADMIN','Администратор сайта');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SITE_ADMIN','staff.users.manage');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SITE_ADMIN','branches.manage');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SITE_ADMIN','catalog.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SITE_ADMIN','catalog.write');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SITE_ADMIN','content.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SITE_ADMIN','content.write');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SITE_ADMIN','content.review');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SITE_ADMIN','content.publish');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SITE_ADMIN','audit.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SITE_ADMIN','analytics.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('SITE_ADMIN','settings.manage');
INSERT INTO "StaffRole"(id,name) VALUES ('EDITOR','Редактор');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('EDITOR','content.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('EDITOR','content.write');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('EDITOR','content.review');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('EDITOR','content.publish');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('EDITOR','catalog.read');
INSERT INTO "StaffRole"(id,name) VALUES ('ARCHIVIST','Сотрудник архива');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('ARCHIVIST','catalog.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('ARCHIVIST','catalog.write');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('ARCHIVIST','content.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('ARCHIVIST','content.write');
INSERT INTO "StaffRole"(id,name) VALUES ('BRANCH_ADMIN','Администратор филиала');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('BRANCH_ADMIN','branches.manage');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('BRANCH_ADMIN','catalog.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('BRANCH_ADMIN','catalog.write');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('BRANCH_ADMIN','content.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('BRANCH_ADMIN','content.write');
INSERT INTO "StaffRole"(id,name) VALUES ('CONTENT_MODERATOR','Модератор публикаций');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('CONTENT_MODERATOR','content.read');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('CONTENT_MODERATOR','content.review');
INSERT INTO "StaffRole"(id,name) VALUES ('ANALYST','Аналитик');
INSERT INTO "StaffPermission"("roleId",permission) VALUES ('ANALYST','analytics.read');

CREATE TABLE "PublicationEvent"(id text PRIMARY KEY,"revisionId" text NOT NULL REFERENCES "ContentRevision"(id),"actorId" text NOT NULL REFERENCES "User"(id),
 "fromStatus" "PublicationState" NOT NULL,"toStatus" "PublicationState" NOT NULL,reason text NOT NULL,"createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX ON "PublicationEvent"("revisionId","createdAt");

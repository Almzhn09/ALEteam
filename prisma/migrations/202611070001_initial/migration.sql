CREATE TYPE "Role" AS ENUM ('AUTHOR', 'MODERATOR');
CREATE TYPE "CommentStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN');
CREATE TABLE "User" (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false, image text,
  role "Role" NOT NULL DEFAULT 'AUTHOR',
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL
);
CREATE TABLE "Session" (
  id text PRIMARY KEY, "expiresAt" timestamp(3) NOT NULL, token text NOT NULL UNIQUE,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL,
  "ipAddress" text, "userAgent" text,
  "userId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE TABLE "Account" (
  id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamp(3), "refreshTokenExpiresAt" timestamp(3), scope text, password text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL,
  UNIQUE ("providerId", "accountId")
);
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE TABLE "Verification" (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamp(3) NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL
);
CREATE INDEX "Verification_identifier_idx" ON "Verification"(identifier);
CREATE TABLE "RateLimit" (id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, "lastRequest" bigint NOT NULL);
CREATE TABLE "ApiRateLimit" (key text PRIMARY KEY, count integer NOT NULL, "expiresAt" timestamp(3) NOT NULL);
CREATE INDEX "ApiRateLimit_expiresAt_idx" ON "ApiRateLimit"("expiresAt");
CREATE TABLE "Fund" (id text PRIMARY KEY, name text NOT NULL, description text NOT NULL);
CREATE TABLE "Document" (
  id text PRIMARY KEY, title text NOT NULL, description text NOT NULL, reference text NOT NULL UNIQUE,
  year integer NOT NULL CHECK (year BETWEEN 1 AND 2100), type text NOT NULL,
  "sourceUrl" text, rights text NOT NULL, "isDemo" boolean NOT NULL DEFAULT true,
  "isPublic" boolean NOT NULL DEFAULT false,
  "fundId" text NOT NULL REFERENCES "Fund"(id) ON UPDATE CASCADE,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "searchVector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(description, '')), 'B')
  ) STORED
);
CREATE INDEX "Document_searchVector_idx" ON "Document" USING GIN ("searchVector");
CREATE INDEX "Document_isPublic_year_id_idx" ON "Document"("isPublic", year, id);
CREATE INDEX "Document_fundId_idx" ON "Document"("fundId");
CREATE INDEX "Document_type_idx" ON "Document"(type);
CREATE TABLE "ArchiveFile" (
  id text PRIMARY KEY, "documentId" text NOT NULL REFERENCES "Document"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "storageKey" text NOT NULL UNIQUE, name text NOT NULL, "mimeType" text NOT NULL,
  size integer NOT NULL CHECK (size BETWEEN 0 AND 20971520),
  downloadable boolean NOT NULL DEFAULT false, "isPublic" boolean NOT NULL DEFAULT false
);
CREATE INDEX "ArchiveFile_documentId_idx" ON "ArchiveFile"("documentId");
CREATE TABLE "Comment" (
  id text PRIMARY KEY,
  "documentId" text NOT NULL REFERENCES "Document"(id) ON UPDATE CASCADE,
  "authorId" text NOT NULL REFERENCES "User"(id) ON UPDATE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status "CommentStatus" NOT NULL DEFAULT 'PENDING', reason text NOT NULL, "moderationVersion" text NOT NULL,
  "idempotencyKey" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL,
  UNIQUE ("authorId", "idempotencyKey")
);
CREATE INDEX "Comment_documentId_status_createdAt_id_idx" ON "Comment"("documentId", status, "createdAt", id);
CREATE INDEX "Comment_status_createdAt_id_idx" ON "Comment"(status, "createdAt", id);
CREATE TABLE "Report" (
  id text PRIMARY KEY,
  "commentId" text NOT NULL REFERENCES "Comment"(id) ON UPDATE CASCADE,
  "reporterId" text NOT NULL REFERENCES "User"(id) ON UPDATE CASCADE,
  reason text NOT NULL, "resolvedAt" timestamp(3), "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("commentId", "reporterId")
);
CREATE INDEX "Report_resolvedAt_createdAt_idx" ON "Report"("resolvedAt", "createdAt");
CREATE TABLE "ModerationDecision" (
  id text PRIMARY KEY,
  "commentId" text NOT NULL REFERENCES "Comment"(id) ON UPDATE CASCADE,
  "moderatorId" text NOT NULL REFERENCES "User"(id) ON UPDATE CASCADE,
  "fromStatus" "CommentStatus" NOT NULL, "toStatus" "CommentStatus" NOT NULL,
  reason text NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ModerationDecision_commentId_createdAt_idx" ON "ModerationDecision"("commentId", "createdAt");

CREATE TYPE "ContentKind" AS ENUM ('NEWS', 'COLLECTION');
CREATE TABLE "ContentItem" (
  id text PRIMARY KEY,
  kind "ContentKind" NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  "sourceUrl" text,
  "publishedAt" timestamp(3) NOT NULL,
  "documentIds" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "isDemo" boolean NOT NULL DEFAULT false,
  "isVisible" boolean NOT NULL DEFAULT true,
  "updatedById" text REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL
);
CREATE INDEX "ContentItem_kind_isVisible_publishedAt_id_idx" ON "ContentItem"(kind, "isVisible", "publishedAt", id);

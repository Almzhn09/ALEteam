ALTER TABLE "User" ADD COLUMN "notifyReplies" boolean NOT NULL DEFAULT true,
                   ADD COLUMN "notifyModeration" boolean NOT NULL DEFAULT true;
ALTER TABLE "Comment" ADD COLUMN "parentId" text REFERENCES "Comment"(id);
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
CREATE TABLE "Favorite" (
  "userId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "documentId" text NOT NULL REFERENCES "Document"(id) ON DELETE CASCADE,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "documentId")
);
CREATE INDEX "Favorite_userId_createdAt_documentId_idx" ON "Favorite"("userId", "createdAt", "documentId");
CREATE TYPE "NotificationKind" AS ENUM ('COMMENT_REPLY', 'MODERATION_DECISION');
CREATE TABLE "Notification" (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "eventKey" text NOT NULL,
  kind "NotificationKind" NOT NULL,
  "commentId" text NOT NULL REFERENCES "Comment"(id) ON DELETE CASCADE,
  status "CommentStatus",
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" timestamp(3),
  UNIQUE ("userId", "eventKey")
);
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification"("userId", "createdAt", id);

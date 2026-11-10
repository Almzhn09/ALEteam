CREATE INDEX "TopicSubscription_active_cursor_updatedAt_id_idx" ON "TopicSubscription"(active,cursor,"updatedAt",id);
CREATE INDEX "FileImportPreview_authorId_createdAt_idx" ON "FileImportPreview"("authorId","createdAt");

ALTER TABLE "project_notes" ADD COLUMN "pinnedAt" TIMESTAMP(3);

CREATE INDEX "project_notes_projectId_pinnedAt_idx"
ON "project_notes"("projectId", "pinnedAt" DESC);

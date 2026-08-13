CREATE TABLE "project_notes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "testSeedBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_notes_projectId_createdAt_idx"
ON "project_notes"("projectId", "createdAt" DESC);

CREATE INDEX "project_notes_testSeedBatchId_idx"
ON "project_notes"("testSeedBatchId");

ALTER TABLE "project_notes"
ADD CONSTRAINT "project_notes_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_notes"
ADD CONSTRAINT "project_notes_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_notes"
ADD CONSTRAINT "project_notes_testSeedBatchId_fkey"
FOREIGN KEY ("testSeedBatchId") REFERENCES "test_seed_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

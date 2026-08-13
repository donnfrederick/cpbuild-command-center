CREATE TABLE IF NOT EXISTS "inspection_answer_media" (
  "id" TEXT NOT NULL,
  "inspectionAnswerId" TEXT NOT NULL,
  "storageUrl" TEXT NOT NULL,
  "storageKey" TEXT,
  "mimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "localUrl" TEXT,
  "caption" TEXT,
  "imageAnnotation" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_answer_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inspection_answer_media_inspectionAnswerId_storageUrl_key"
  ON "inspection_answer_media"("inspectionAnswerId", "storageUrl");
CREATE INDEX IF NOT EXISTS "inspection_answer_media_inspectionAnswerId_idx"
  ON "inspection_answer_media"("inspectionAnswerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspection_answer_media_inspectionAnswerId_fkey'
  ) THEN
    ALTER TABLE "inspection_answer_media"
      ADD CONSTRAINT "inspection_answer_media_inspectionAnswerId_fkey"
      FOREIGN KEY ("inspectionAnswerId") REFERENCES "inspection_answers"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

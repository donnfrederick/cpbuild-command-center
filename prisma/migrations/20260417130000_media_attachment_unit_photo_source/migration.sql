-- AlterTable: add source classification fields to media_attachments for standalone unit album photos.
-- unitPhotoSourceType: "general" | "status_update" — NULL on legacy rows, treated as "general" at read time.
-- unitPhotoSourceLabel: human-readable label for status_update photos (e.g. "Framing · Completed").
ALTER TABLE "media_attachments" ADD COLUMN IF NOT EXISTS "unitPhotoSourceType" TEXT;
ALTER TABLE "media_attachments" ADD COLUMN IF NOT EXISTS "unitPhotoSourceLabel" TEXT;

-- CreateEnum
CREATE TYPE "capture_gps_status" AS ENUM ('GRANTED', 'DENIED', 'TIMEOUT', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "capture_app_shell" AS ENUM ('BROWSER_TAB', 'PWA_INSTALLED');

-- CreateEnum
CREATE TYPE "capture_method" AS ENUM ('NATIVE_CAMERA', 'WEBCAM', 'PHOTO_LIBRARY', 'FILE_DROP');

-- CreateEnum
CREATE TYPE "project_geocode_status" AS ENUM ('SUCCESS', 'FAILED', 'PENDING');

-- CreateTable
CREATE TABLE "project_site_geocodes" (
    "project_id" TEXT NOT NULL,
    "site_location_text" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geocoded_at" TIMESTAMP(3),
    "geocode_status" "project_geocode_status" NOT NULL DEFAULT 'PENDING',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_site_geocodes_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "field_media_upload_contexts" (
    "storage_key" TEXT NOT NULL,
    "capture_project_id" TEXT,
    "capture_recorded_at" TIMESTAMP(3) NOT NULL,
    "gps_status" "capture_gps_status" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "distance_from_project_meters" DOUBLE PRECISION,
    "project_site_address_at_capture" TEXT,
    "project_geocode_available" BOOLEAN NOT NULL DEFAULT false,
    "device_type" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "app_shell" "capture_app_shell" NOT NULL,
    "capture_method" "capture_method" NOT NULL,
    "user_agent" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_media_upload_contexts_pkey" PRIMARY KEY ("storage_key")
);

-- CreateTable
CREATE TABLE "media_capture_contexts" (
    "id" TEXT NOT NULL,
    "media_attachment_id" TEXT NOT NULL,
    "capture_project_id" TEXT,
    "capture_recorded_at" TIMESTAMP(3) NOT NULL,
    "gps_status" "capture_gps_status" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "distance_from_project_meters" DOUBLE PRECISION,
    "project_site_address_at_capture" TEXT,
    "project_geocode_available" BOOLEAN NOT NULL DEFAULT false,
    "device_type" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "app_shell" "capture_app_shell" NOT NULL,
    "capture_method" "capture_method" NOT NULL,
    "user_agent" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_capture_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_media_upload_contexts_capture_project_id_idx"
ON "field_media_upload_contexts"("capture_project_id");

-- CreateIndex
CREATE INDEX "field_media_upload_contexts_expires_at_idx"
ON "field_media_upload_contexts"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_capture_contexts_media_attachment_id_key"
ON "media_capture_contexts"("media_attachment_id");

-- CreateIndex
CREATE INDEX "media_capture_contexts_capture_project_id_idx"
ON "media_capture_contexts"("capture_project_id");

-- CreateIndex
CREATE INDEX "media_capture_contexts_gps_status_idx"
ON "media_capture_contexts"("gps_status");

-- CreateIndex
CREATE INDEX "media_capture_contexts_capture_recorded_at_idx"
ON "media_capture_contexts"("capture_recorded_at");

-- CreateIndex
CREATE INDEX "media_capture_contexts_distance_from_project_meters_idx"
ON "media_capture_contexts"("distance_from_project_meters");

-- CreateIndex
CREATE INDEX "media_capture_contexts_capture_project_id_capture_recorded_at_idx"
ON "media_capture_contexts"("capture_project_id", "capture_recorded_at");

-- AddForeignKey
ALTER TABLE "project_site_geocodes"
ADD CONSTRAINT "project_site_geocodes_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_media_upload_contexts"
ADD CONSTRAINT "field_media_upload_contexts_capture_project_id_fkey"
FOREIGN KEY ("capture_project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_capture_contexts"
ADD CONSTRAINT "media_capture_contexts_media_attachment_id_fkey"
FOREIGN KEY ("media_attachment_id") REFERENCES "media_attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_capture_contexts"
ADD CONSTRAINT "media_capture_contexts_capture_project_id_fkey"
FOREIGN KEY ("capture_project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

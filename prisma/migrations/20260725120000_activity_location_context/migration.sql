-- CreateEnum
CREATE TYPE "activity_location_source" AS ENUM ('ACTIVITY_CAPTURE', 'MEDIA_DERIVED', 'BACKFILL');

-- CreateTable
CREATE TABLE "activity_location_contexts" (
    "activity_log_id" TEXT NOT NULL,
    "gps_status" "capture_gps_status" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "distance_from_project_meters" DOUBLE PRECISION,
    "location_recorded_at" TIMESTAMP(3) NOT NULL,
    "source" "activity_location_source" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_location_contexts_pkey" PRIMARY KEY ("activity_log_id")
);

-- CreateIndex
CREATE INDEX "activity_location_contexts_gps_status_idx" ON "activity_location_contexts"("gps_status");

-- CreateIndex
CREATE INDEX "activity_location_contexts_source_idx" ON "activity_location_contexts"("source");

-- AddForeignKey
ALTER TABLE "activity_location_contexts" ADD CONSTRAINT "activity_location_contexts_activity_log_id_fkey" FOREIGN KEY ("activity_log_id") REFERENCES "activity_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Custom site locations — field-notes-only areas not tied to UPM install rows.

DO $$ BEGIN
  CREATE TYPE "custom_site_placement" AS ENUM ('standalone', 'building', 'building_level');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "project_custom_site_locations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "building" TEXT NOT NULL DEFAULT '',
    "level" TEXT NOT NULL DEFAULT '',
    "placement" "custom_site_placement" NOT NULL DEFAULT 'standalone',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_custom_site_locations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "project_custom_site_locations_project_id_idx"
    ON "project_custom_site_locations"("project_id");

CREATE UNIQUE INDEX IF NOT EXISTS "project_custom_site_locations_project_id_name_key"
    ON "project_custom_site_locations"("project_id", "name");

ALTER TABLE "project_custom_site_locations"
    ADD CONSTRAINT "project_custom_site_locations_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_custom_site_locations"
    ADD CONSTRAINT "project_custom_site_locations_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'CUSTOM_SITE_LOCATION_CREATED';
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'CUSTOM_SITE_LOCATION_DELETED';

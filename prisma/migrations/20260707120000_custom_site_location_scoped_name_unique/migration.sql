-- FT-0084: allow the same custom location name in different placement/building/level buckets.

DROP INDEX IF EXISTS "project_custom_site_locations_project_id_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "project_custom_site_locations_project_id_placement_building_level_name_key"
    ON "project_custom_site_locations"("project_id", "placement", "building", "level", "name");

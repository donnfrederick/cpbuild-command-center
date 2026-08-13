-- Observation type catalog; migrate project_observations off Postgres enum.

CREATE TABLE IF NOT EXISTS "observation_type_catalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "observation_type_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "observation_type_catalog_code_key" ON "observation_type_catalog"("code");

INSERT INTO "observation_type_catalog" ("id", "code", "display_name", "sort_order", "updated_at")
VALUES
  (gen_random_uuid()::text, 'QUALITY', 'Quality', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PROGRESS', 'Progress', 20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SAFETY', 'Safety', 30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'OTHER', 'Other', 40, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "project_observations" ADD COLUMN IF NOT EXISTS "observation_type_code" TEXT;

UPDATE "project_observations"
SET "observation_type_code" = "observationType"::text
WHERE "observation_type_code" IS NULL;

ALTER TABLE "project_observations" ALTER COLUMN "observation_type_code" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "project_observations_observation_type_code_idx"
  ON "project_observations"("observation_type_code");

ALTER TABLE "project_observations" DROP COLUMN IF EXISTS "observationType";

DROP TYPE IF EXISTS "observation_type";

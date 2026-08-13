-- Issue type + responsible party catalogs; migrate project_issues off Postgres enums.

-- Catalog tables
CREATE TABLE IF NOT EXISTS "issue_type_catalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "requires_visual" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "issue_type_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "issue_type_catalog_code_key" ON "issue_type_catalog"("code");

CREATE TABLE IF NOT EXISTS "responsible_party_catalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "responsible_party_catalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "responsible_party_catalog_code_key" ON "responsible_party_catalog"("code");

-- Seed catalog rows (idempotent)
INSERT INTO "issue_type_catalog" ("id", "code", "display_name", "sort_order", "requires_visual", "updated_at")
VALUES
  (gen_random_uuid()::text, 'SUBSTRATE_CONDITION', 'Substrate Condition', 10, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DAMAGED_MATERIALS', 'Damaged Materials', 20, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MISSING_MATERIALS', 'Missing Materials', 30, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'TRADE_DAMAGE_REPAIR', 'Trade Damage Repair', 40, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'OTHER', 'Other', 50, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MATERIAL_IN_THE_WAY', 'Material in the way', 60, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'OTHER_TRADES_OBSTRUCTION', 'Other trades stuff in the way', 70, false, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "responsible_party_catalog" ("id", "code", "display_name", "sort_order", "updated_at")
VALUES
  (gen_random_uuid()::text, 'CP_BUILD', 'CP Build', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ELECTRICIAN', 'Electrician', 20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PLUMBER', 'Plumber', 30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'CARPENTER', 'Carpenter', 40, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GENERAL_CONTRACTOR', 'General Contractor', 50, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FRAMING', 'Framing', 60, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DRYWALL', 'Drywall', 70, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FLOORING', 'Flooring', 80, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PAINTING', 'Painting', 90, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'HVAC', 'HVAC', 100, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FIRE_PROTECTION', 'Fire Protection', 110, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'LOW_VOLTAGE', 'Low Voltage', 120, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Add string code columns on project_issues
ALTER TABLE "project_issues" ADD COLUMN IF NOT EXISTS "issue_type_code" TEXT;
ALTER TABLE "project_issues" ADD COLUMN IF NOT EXISTS "responsible_party_code" TEXT;

UPDATE "project_issues"
SET
  "issue_type_code" = "issueType"::text,
  "responsible_party_code" = "responsibleParty"::text
WHERE "issue_type_code" IS NULL OR "responsible_party_code" IS NULL;

ALTER TABLE "project_issues" ALTER COLUMN "issue_type_code" SET NOT NULL;
ALTER TABLE "project_issues" ALTER COLUMN "responsible_party_code" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "project_issues_issue_type_code_idx" ON "project_issues"("issue_type_code");
CREATE INDEX IF NOT EXISTS "project_issues_responsible_party_code_idx" ON "project_issues"("responsible_party_code");

-- Join table for multi-party tags.
-- Local/dev DBs may still have the pre-catalog shape (issueId + party enum) from an earlier branch;
-- drop it so we can recreate with issue_id + party_code.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'issue_responsible_party_tags'
      AND column_name = 'issueId'
  ) THEN
    DROP TABLE "issue_responsible_party_tags";
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "issue_responsible_party_tags" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "party_code" TEXT NOT NULL,
    CONSTRAINT "issue_responsible_party_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "issue_responsible_party_tags_issue_id_party_code_key"
  ON "issue_responsible_party_tags"("issue_id", "party_code");
CREATE INDEX IF NOT EXISTS "issue_responsible_party_tags_issue_id_idx"
  ON "issue_responsible_party_tags"("issue_id");
CREATE INDEX IF NOT EXISTS "issue_responsible_party_tags_party_code_idx"
  ON "issue_responsible_party_tags"("party_code");

INSERT INTO "issue_responsible_party_tags" ("id", "issue_id", "party_code")
SELECT gen_random_uuid()::text, pi."id", pi."responsible_party_code"
FROM "project_issues" pi
WHERE NOT EXISTS (
  SELECT 1 FROM "issue_responsible_party_tags" t
  WHERE t."issue_id" = pi."id" AND t."party_code" = pi."responsible_party_code"
);

ALTER TABLE "issue_responsible_party_tags"
  ADD CONSTRAINT "issue_responsible_party_tags_issue_id_fkey"
  FOREIGN KEY ("issue_id") REFERENCES "project_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop legacy enum columns
ALTER TABLE "project_issues" DROP COLUMN IF EXISTS "issueType";
ALTER TABLE "project_issues" DROP COLUMN IF EXISTS "responsibleParty";

-- Drop unused enum types
DROP TYPE IF EXISTS "issue_type";
DROP TYPE IF EXISTS "responsible_party";

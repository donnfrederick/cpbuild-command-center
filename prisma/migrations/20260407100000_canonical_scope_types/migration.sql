-- Migration: canonical_scope_types
-- Creates the canonical_scope_types reference table with all 22 official CP Build scopes,
-- adds a nullable FK on scope_types, and backfills the 10 existing scope_types rows
-- to their correct canonical entries.

-- ── 1. Create canonical_scope_types table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "canonical_scope_types" (
  "id"           TEXT NOT NULL,
  "code"         TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "sort_order"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "canonical_scope_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "canonical_scope_types_code_key" ON "canonical_scope_types"("code");

-- ── 2. Seed the 22 official scopes (idempotent) ──────────────────────────────
INSERT INTO "canonical_scope_types" ("id", "code", "display_name", "sort_order") VALUES
  (gen_random_uuid()::text, 'BTH', 'Bath Accessories',              1),
  (gen_random_uuid()::text, 'CAB', 'Cabinets',                      2),
  (gen_random_uuid()::text, 'CHW', 'Cabinet Door/Drawer Hardware',  3),
  (gen_random_uuid()::text, 'CNF', 'Concrete Finishes',             4),
  (gen_random_uuid()::text, 'CPB', 'Carpet Broadloom',              5),
  (gen_random_uuid()::text, 'CPT', 'Carpet Tile',                   6),
  (gen_random_uuid()::text, 'DHW', 'Door Hardware',                 7),
  (gen_random_uuid()::text, 'DRS', 'Doors',                         8),
  (gen_random_uuid()::text, 'ENG', 'Entrance Grilles',              9),
  (gen_random_uuid()::text, 'HDW', 'Hardwood',                      10),
  (gen_random_uuid()::text, 'LVT', 'LVT Flooring',                  11),
  (gen_random_uuid()::text, 'MRR', 'Mirrors',                       12),
  (gen_random_uuid()::text, 'RAF', 'Resilient Athletic Flooring',   13),
  (gen_random_uuid()::text, 'RBF', 'Rubber Flooring',               14),
  (gen_random_uuid()::text, 'SHW', 'Showers',                       15),
  (gen_random_uuid()::text, 'SNK', 'Sinks',                         16),
  (gen_random_uuid()::text, 'THW', 'Countertop Hardware',           17),
  (gen_random_uuid()::text, 'TIL', 'Tile',                          18),
  (gen_random_uuid()::text, 'TOP', 'Countertops',                   19),
  (gen_random_uuid()::text, 'VCT', 'VCT Flooring',                  20),
  (gen_random_uuid()::text, 'VYL', 'Sheet Vinyl/Linoleum',          21),
  (gen_random_uuid()::text, 'WND', 'Window Coverings',              22)
ON CONFLICT ("code") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "sort_order"   = EXCLUDED."sort_order";

-- ── 3. Add canonical_scope_type_id FK column to scope_types ─────────────────
ALTER TABLE "scope_types"
  ADD COLUMN IF NOT EXISTS "canonical_scope_type_id" TEXT;

ALTER TABLE "scope_types"
  DROP CONSTRAINT IF EXISTS "scope_types_canonical_scope_type_id_fkey";

ALTER TABLE "scope_types"
  ADD CONSTRAINT "scope_types_canonical_scope_type_id_fkey"
  FOREIGN KEY ("canonical_scope_type_id")
  REFERENCES "canonical_scope_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "scope_types_canonical_scope_type_id_idx"
  ON "scope_types"("canonical_scope_type_id");

-- ── 4. Backfill existing scope_types rows to their canonical entries ─────────
-- 'Broadloom Carpet' → CPB
UPDATE "scope_types"
SET "canonical_scope_type_id" = (SELECT "id" FROM "canonical_scope_types" WHERE "code" = 'CPB')
WHERE "code" = 'Broadloom Carpet' AND "canonical_scope_type_id" IS NULL;

-- 'Cabinetry' → CAB
UPDATE "scope_types"
SET "canonical_scope_type_id" = (SELECT "id" FROM "canonical_scope_types" WHERE "code" = 'CAB')
WHERE "code" = 'Cabinetry' AND "canonical_scope_type_id" IS NULL;

-- 'CABIU' (in-unit cabinetry variant) → CAB
UPDATE "scope_types"
SET "canonical_scope_type_id" = (SELECT "id" FROM "canonical_scope_types" WHERE "code" = 'CAB')
WHERE "code" = 'CABIU' AND "canonical_scope_type_id" IS NULL;

-- 'Carpet Tile' → CPT
UPDATE "scope_types"
SET "canonical_scope_type_id" = (SELECT "id" FROM "canonical_scope_types" WHERE "code" = 'CPT')
WHERE "code" = 'Carpet Tile' AND "canonical_scope_type_id" IS NULL;

-- 'Ceramic Tile' → TIL
UPDATE "scope_types"
SET "canonical_scope_type_id" = (SELECT "id" FROM "canonical_scope_types" WHERE "code" = 'TIL')
WHERE "code" = 'Ceramic Tile' AND "canonical_scope_type_id" IS NULL;

-- 'Countertop' (singular variant) → TOP
UPDATE "scope_types"
SET "canonical_scope_type_id" = (SELECT "id" FROM "canonical_scope_types" WHERE "code" = 'TOP')
WHERE "code" = 'Countertop' AND "canonical_scope_type_id" IS NULL;

-- 'Countertops' → TOP
UPDATE "scope_types"
SET "canonical_scope_type_id" = (SELECT "id" FROM "canonical_scope_types" WHERE "code" = 'TOP')
WHERE "code" = 'Countertops' AND "canonical_scope_type_id" IS NULL;

-- 'LVT' → LVT
UPDATE "scope_types"
SET "canonical_scope_type_id" = (SELECT "id" FROM "canonical_scope_types" WHERE "code" = 'LVT')
WHERE "code" = 'LVT' AND "canonical_scope_type_id" IS NULL;

-- 'Tile' → TIL
UPDATE "scope_types"
SET "canonical_scope_type_id" = (SELECT "id" FROM "canonical_scope_types" WHERE "code" = 'TIL')
WHERE "code" = 'Tile' AND "canonical_scope_type_id" IS NULL;

-- 'TOPIU' (in-unit countertop variant) → TOP
UPDATE "scope_types"
SET "canonical_scope_type_id" = (SELECT "id" FROM "canonical_scope_types" WHERE "code" = 'TOP')
WHERE "code" = 'TOPIU' AND "canonical_scope_type_id" IS NULL;

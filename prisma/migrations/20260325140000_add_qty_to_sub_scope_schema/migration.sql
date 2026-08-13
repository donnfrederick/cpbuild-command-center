-- Migration: add_qty_to_sub_scope_schema
--
-- Adds qty (nullable Decimal) to both sub-scope tables:
--   project_sub_scopes          — stores the "manual" qty set at definition time
--                                  (null = even-split mode, calculated dynamically)
--   project_sub_scope_instances — stores the resolved qty per-unit
--                                  (even: parentRow.qty ÷ numSubScopes; manual: definition.qty)
--
-- Both columns are nullable: sub-scopes created before this migration, or without a
-- quantity (future use), will simply have qty = null.

-- AlterTable: project_sub_scopes — add manual-qty column
ALTER TABLE "project_sub_scopes"
    ADD COLUMN "qty" DECIMAL(18, 4);

-- AlterTable: project_sub_scope_instances — add resolved-qty column
ALTER TABLE "project_sub_scope_instances"
    ADD COLUMN "qty" DECIMAL(18, 4);

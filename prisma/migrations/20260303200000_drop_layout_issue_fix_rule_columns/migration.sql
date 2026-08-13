-- Drop orphaned columns from layout_issues.
-- fixRuleType and fixRuleName were part of a "Confirm Fixed" modal that was
-- simplified. They were never populated by any live code path and are safe to
-- remove. fixNote and fixedAt (still used) are intentionally retained.

ALTER TABLE "layout_issues" DROP COLUMN IF EXISTS "fixRuleType";
ALTER TABLE "layout_issues" DROP COLUMN IF EXISTS "fixRuleName";

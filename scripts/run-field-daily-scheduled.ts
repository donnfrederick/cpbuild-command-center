/**
 * Run the org-TZ midnight field daily report job for the prior calendar day.
 *
 * Usage:
 *   FIELD_DAILY_CRON_FORCE=1 npm run field-daily:scheduled
 *   FIELD_DAILY_CRON_FORCE=1 npm run field-daily:scheduled -- 2026-07-15
 */

import "dotenv/config";
import { runScheduledFieldDailyReports } from "../lib/field-daily-report/scheduled-generate.js";

async function main() {
  const dateArg = process.argv[2];
  const force = process.env.FIELD_DAILY_CRON_FORCE === "1" || Boolean(dateArg);

  const result = await runScheduledFieldDailyReports({
    reportDate: dateArg,
    force,
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("[field-daily:scheduled] failed:", error);
  process.exit(1);
});

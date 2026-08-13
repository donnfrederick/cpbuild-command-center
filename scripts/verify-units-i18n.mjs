#!/usr/bin/env node
/**
 * Fails if `units` namespace is missing bulk / post-bulk strings (easy to drop in a bad merge).
 * Run: node scripts/verify-units-i18n.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const REQUIRED_UNITS_KEYS = [
  "bulkActionsPlaceholder",
  "bulkActionsTitle",
  "bulkActionsSubtitle",
  "bulkActionUpdateStatus",
  "bulkActionApply",
  "bulkActionApplying",
  "bulkActionProgressPercent",
  "bulkActionCancelUpdate",
  "bulkActionStopping",
  "bulkActionStoppingButton",
  "bulkActionCancelled",
  "bulkActionCancelledPartial",
  "postBulkBannerSimple",
  "postBulkBannerWithScopes",
  "postBulkBannerTitle",
  "postBulkBannerUnits",
  "postBulkBannerScopes",
  "postBulkBannerChangedTo",
  "bulkActionActivityLogFailed",
  "bulkActionSuccessAll",
  "bulkActionSuccessPartial",
  "bulkActionError",
  "bulkActionErrorPartialDescription",
  "bulkActionUndo",
  "bulkActionUndoHint",
  "bulkActionUndoing",
  "bulkActionRevertOverlayHint",
  "bulkActionUndoSuccess",
  "bulkActionUndoFailed",
  "bulkFilterKeepChanges",
  "bulkFilterUndo",
];

function checkLocale(filename, label) {
  const raw = fs.readFileSync(path.join(root, "messages", filename), "utf8");
  const data = JSON.parse(raw);
  const units = data.units;
  if (!units || typeof units !== "object") {
    console.error(`${label}: missing or invalid "units" namespace`);
    process.exit(1);
  }
  const missing = REQUIRED_UNITS_KEYS.filter((k) => units[k] === undefined);
  if (missing.length > 0) {
    console.error(`${label}: missing ${missing.length} key(s) under units:`);
    for (const k of missing) console.error(`  - ${k}`);
    process.exit(1);
  }
}

checkLocale("en.json", "en");
checkLocale("es.json", "es");
console.log("OK — units bulk / post-bulk i18n keys present in en.json and es.json");

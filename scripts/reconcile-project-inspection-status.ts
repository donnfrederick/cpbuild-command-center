#!/usr/bin/env npx tsx
/**
 * One-off repair: clear phantom PASSED/FAILED on scope rows with no inspection records.
 *
 * Usage:
 *   npx tsx scripts/reconcile-project-inspection-status.ts <projectId>
 */
import "dotenv/config";
import { reconcileProjectInspectionStatuses } from "@/lib/inspections/reconcile-scope-inspection-status";

async function main(): Promise<void> {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: npx tsx scripts/reconcile-project-inspection-status.ts <projectId>");
    process.exit(1);
  }

  const result = await reconcileProjectInspectionStatuses(projectId);
  console.log(
    `Reconciled project ${projectId}: cleared inspectionStatus on ${result.clearedRows} scope row(s); ` +
      `removed ${result.deletedOrphanClears} orphan clear-inspection record(s).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

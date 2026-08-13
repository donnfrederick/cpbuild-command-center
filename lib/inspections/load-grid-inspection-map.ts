import type { PrismaClient } from "@prisma/client";
import {
  buildScopeGridInspectionMapFromSortedRows,
  type ScopeGridInspectionDerived,
} from "@/lib/inspections/scope-grid-inspection-display";
import { resolveGridSubmissionCategory } from "@/lib/inspections/resolve-grid-submission-category";

type LoaderClient = Pick<PrismaClient, "inspectionSubmission">;

/** Batch-load grid tile inspection display for many scope rows (newest submission wins). */
export async function loadGridInspectionMapForScopeRowIds(
  projectId: string,
  scopeRowIds: string[],
  client: LoaderClient,
): Promise<Map<string, ScopeGridInspectionDerived>> {
  if (scopeRowIds.length === 0) return new Map();

  const submissions = await client.inspectionSubmission.findMany({
    where: { projectId, scopeRowId: { in: scopeRowIds } },
    orderBy: { submittedAt: "desc" },
    select: {
      scopeRowId: true,
      outcome: true,
      source: true,
      templateSnapshot: true,
      form: { select: { category: true } },
    },
  });

  const rows = submissions
    .filter((s): s is typeof s & { scopeRowId: string } => s.scopeRowId != null)
    .map((s) => ({
      scopeRowId: s.scopeRowId,
      outcome: s.outcome === "FAIL" ? ("FAIL" as const) : ("PASS" as const),
      source: s.source,
      category: resolveGridSubmissionCategory(s.templateSnapshot, s.form?.category),
    }));

  return buildScopeGridInspectionMapFromSortedRows(rows);
}

export function applyGridInspectionToSerializedRow<
  T extends { id: string; gridInspectionStatus?: unknown; latestInspectionCategory?: unknown },
>(row: T, map: Map<string, ScopeGridInspectionDerived>): T {
  const derived = map.get(row.id);
  if (!derived) return row;
  return {
    ...row,
    gridInspectionStatus: derived.gridInspectionStatus,
    latestInspectionCategory: derived.latestInspectionCategory,
  };
}

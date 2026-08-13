/**
 * GET /api/projects/[id]/inspections-log
 *
 * Returns all InspectionSubmission rows for a project, enriched with
 * the originating ProjectRow's location (building, level, unit) and
 * scope-type name. This extra join data is what separates this endpoint
 * from the generic /api/inspection-submissions?projectId=X — that one
 * only returns raw submission fields.
 *
 * Response shape:
 *   { submissions: EnrichedSubmission[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { db } from "@/lib/db";
import { resolveInspectorId, resolveInspectorName } from "@/lib/inspections/inspector-display";

export interface EnrichedSubmission {
  id: string;
  formId: string | null;
  formName: string | null;
  formVersionId: string | null;
  formVersionNumber: number | null;
  projectId: string;
  unitId: string;
  scopeRowId: string | null;
  scopeTypeCode: string | null;
  submittedAt: string; // ISO
  inspectorId: string | null;
  inspectorName: string;
  outcome: "PASS" | "FAIL" | "COMPLETE";
  deficiencyCount: number;
  source: "FORM" | "BACKFILL";
  // ProjectRow location fields
  building: string | null;
  level: string | null;
  unit: string | null;
  scopeTypeName: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // 1. Fetch all submissions for the project (ordered newest-first)
  const submissions = await db.inspectionSubmission.findMany({
    where: { projectId },
    orderBy: { submittedAt: "desc" },
    include: {
      form: { select: { id: true, name: true } },
      formVersion: { select: { id: true, versionNumber: true } },
      clearInspection: {
        select: {
          inspectedById: true,
          inspectedBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (submissions.length === 0) {
    return NextResponse.json({ submissions: [] });
  }

  // 2. Collect unique ProjectRow IDs that we need location data for.
  //    scopeRowId (the specific scope card) takes priority for location display;
  //    fall back to unitId (the parent unit row).
  const rowIds = new Set<string>();
  for (const s of submissions) {
    if (s.scopeRowId) rowIds.add(s.scopeRowId);
    rowIds.add(s.unitId);
  }

  // 3. Fetch those rows in a single query
  const rows = await db.projectRow.findMany({
    where: { id: { in: Array.from(rowIds) } },
    select: {
      id: true,
      building: true,
      level: true,
      unit: true,
      scopeType: { select: { name: true } },
    },
  });

  const rowMap = new Map(rows.map((r) => [r.id, r]));

  // 4. Merge and return
  const enriched: EnrichedSubmission[] = submissions.map((s) => {
    // Prefer scope-row data (most specific); fall back to unit row
    const locationRow = (s.scopeRowId ? rowMap.get(s.scopeRowId) : null) ?? rowMap.get(s.unitId) ?? null;

    return {
      id: s.id,
      formId: s.formId,
      formName: s.form?.name ?? null,
      formVersionId: s.formVersionId,
      formVersionNumber: s.formVersion?.versionNumber ?? null,
      projectId: s.projectId,
      unitId: s.unitId,
      scopeRowId: s.scopeRowId,
      scopeTypeCode: s.scopeTypeCode,
      submittedAt: s.submittedAt.toISOString(),
      inspectorId: resolveInspectorId(s.clearInspection),
      inspectorName: resolveInspectorName(s.clearInspection),
      outcome: s.outcome as "PASS" | "FAIL" | "COMPLETE",
      deficiencyCount: s.deficiencyCount,
      source: s.source as "FORM" | "BACKFILL",
      building: locationRow?.building ?? null,
      level: locationRow?.level ?? null,
      unit: locationRow?.unit ?? null,
      scopeTypeName: locationRow?.scopeType?.name ?? null,
    };
  });

  return NextResponse.json({ submissions: enriched });
}

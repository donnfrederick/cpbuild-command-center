import { db } from "@/lib/db";
import { shuffleInPlace, pickOne } from "./random";
import { promoteRowForClearInspection, resolveTestSubcontractor } from "./promote-rows";
import {
  findClearFormsForScopeCode,
  scopeCodeFromScopeType,
  type PublishedClearForm,
} from "./resolve-published-clear-forms";

export interface ScopeRowCandidate {
  id: string;
  building: string;
  level: string;
  unit: string;
  scopeTypeCode: string | null;
}

export interface PickClearInspectionRowsResult {
  selected: ScopeRowCandidate[];
  skippedExistingHistory: number;
  skippedNoPublishedForm: number;
}

/**
 * Picks up to `count` parent scope rows with no existing ClearInspection or InspectionSubmission
 * and a matching published CLEAR_INSPECTION form for the row's scope type.
 * Auto-promotes selected rows to INSTALL+COMPLETE with the test subcontractor.
 */
export async function pickAndPromoteClearInspectionRows(
  projectId: string,
  count: number,
  rng: () => number,
  publishedForms: PublishedClearForm[]
): Promise<PickClearInspectionRowsResult> {
  if (count <= 0) {
    return { selected: [], skippedExistingHistory: 0, skippedNoPublishedForm: 0 };
  }

  const rows = await db.projectRow.findMany({
    where: { projectId, scopeTypeId: { not: null } },
    select: {
      id: true,
      building: true,
      level: true,
      unit: true,
      scopeType: {
        select: {
          code: true,
          canonicalScopeType: { select: { code: true } },
        },
      },
    },
  });

  if (rows.length === 0) {
    return { selected: [], skippedExistingHistory: 0, skippedNoPublishedForm: 0 };
  }

  const rowIds = rows.map((r) => r.id);

  const [clearRows, submissionRows] = await Promise.all([
    db.clearInspection.findMany({
      where: { rowId: { in: rowIds }, deletedAt: null },
      select: { rowId: true },
    }),
    db.inspectionSubmission.findMany({
      where: {
        OR: [{ scopeRowId: { in: rowIds } }, { unitId: { in: rowIds } }],
      },
      select: { scopeRowId: true, unitId: true },
    }),
  ]);

  const blocked = new Set<string>();
  for (const c of clearRows) blocked.add(c.rowId);
  for (const s of submissionRows) {
    if (s.scopeRowId) blocked.add(s.scopeRowId);
    blocked.add(s.unitId);
  }

  const candidates: ScopeRowCandidate[] = rows.map((r) => ({
    id: r.id,
    building: r.building,
    level: r.level,
    unit: r.unit,
    scopeTypeCode: scopeCodeFromScopeType(r.scopeType),
  }));

  const withoutHistory = candidates.filter((r) => !blocked.has(r.id));
  const skippedExistingHistory = candidates.length - withoutHistory.length;

  const withForm = withoutHistory.filter(
    (r) =>
      r.scopeTypeCode !== null &&
      findClearFormsForScopeCode(publishedForms, r.scopeTypeCode).length > 0
  );
  const skippedNoPublishedForm = withoutHistory.length - withForm.length;

  shuffleInPlace(withForm, rng);

  const selected = withForm.slice(0, count);
  if (selected.length === 0) {
    return { selected: [], skippedExistingHistory, skippedNoPublishedForm };
  }

  const subcontractor = await resolveTestSubcontractor();
  for (const row of selected) {
    await promoteRowForClearInspection(row.id, subcontractor);
  }

  return { selected, skippedExistingHistory, skippedNoPublishedForm };
}

export async function pickRandomScopeRows(
  projectId: string,
  count: number,
  rng: () => number
): Promise<ScopeRowCandidate[]> {
  if (count <= 0) return [];

  const rows = await db.projectRow.findMany({
    where: { projectId, scopeTypeId: { not: null } },
    select: {
      id: true,
      building: true,
      level: true,
      unit: true,
      scopeType: {
        select: {
          code: true,
          canonicalScopeType: { select: { code: true } },
        },
      },
    },
  });

  const candidates: ScopeRowCandidate[] = rows.map((r) => ({
    id: r.id,
    building: r.building,
    level: r.level,
    unit: r.unit,
    scopeTypeCode: scopeCodeFromScopeType(r.scopeType),
  }));

  shuffleInPlace(candidates, rng);
  return candidates.slice(0, count);
}

export function pickClearFormForRow(
  publishedForms: PublishedClearForm[],
  row: ScopeRowCandidate,
  rng: () => number
): PublishedClearForm | null {
  if (!row.scopeTypeCode) return null;
  const matches = findClearFormsForScopeCode(publishedForms, row.scopeTypeCode);
  if (matches.length === 0) return null;
  return pickOne(matches, rng);
}

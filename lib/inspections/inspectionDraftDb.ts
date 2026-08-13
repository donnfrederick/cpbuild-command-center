/**
 * IndexedDB store for in-progress inspection drafts (not yet submitted).
 */

import { getCpbInspectionDb, runCpbInspectionDbTask } from "@/lib/inspections/inspectionIndexedDb";
import type { InspectionDraft } from "@/lib/inspections/inspection-draft";

export async function getDraft(draftKey: string): Promise<InspectionDraft | undefined> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    return db.get("inspectionDrafts", draftKey);
  });
}

export async function putDraft(draft: InspectionDraft): Promise<void> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    await db.put("inspectionDrafts", draft);
  });
}

export async function deleteDraft(draftKey: string): Promise<void> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    await db.delete("inspectionDrafts", draftKey);
  });
}

export async function listDraftsForScope(scopeRowId: string): Promise<InspectionDraft[]> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    return db.getAllFromIndex("inspectionDrafts", "by_scope", scopeRowId);
  });
}

export async function listDraftsForUnit(unitId: string): Promise<InspectionDraft[]> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    return db.getAllFromIndex("inspectionDrafts", "by_unit", unitId);
  });
}

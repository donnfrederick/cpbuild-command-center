import "server-only";

import { db } from "@/lib/db";
import {
  CLEAR_INSPECTION_INSTALL_COMPLETE_ERROR,
  CLEAR_INSPECTION_NO_SUBCONTRACTOR_ERROR,
  isProjectRowInstallCompleteForClearInspection,
} from "@/lib/inspections/clear-inspection-scope-gate";

export async function assertScopeReadyForClearInspection(
  scopeRowId: string,
  client: typeof db = db,
): Promise<{ ok: true } | { ok: false; error: string; status: 422 }> {
  const row = await client.projectRow.findUnique({
    where: { id: scopeRowId },
    select: { scopeStage: true, scopeStatus: true, unifierSubId: true },
  });
  if (!row) {
    return { ok: false, error: "Scope not found.", status: 422 };
  }
  if (!row.unifierSubId) {
    return { ok: false, error: CLEAR_INSPECTION_NO_SUBCONTRACTOR_ERROR, status: 422 };
  }

  if (
    !isProjectRowInstallCompleteForClearInspection({
      scopeStage: row.scopeStage,
      scopeStatus: row.scopeStatus,
    })
  ) {
    return {
      ok: false,
      error: CLEAR_INSPECTION_INSTALL_COMPLETE_ERROR,
      status: 422,
    };
  }

  return { ok: true };
}

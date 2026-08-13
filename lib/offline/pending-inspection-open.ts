/**
 * Open a queued inspection in the edit overlay from the upload queue sheet.
 */

import type { ScopeRow } from "@/components/projects/UnitCards";
import type { PendingInspection } from "@/lib/inspections/inspectionOfflineDb";
import {
  isProjectLevelInspectionUnitId,
  parseUnitInspectionRef,
} from "@/lib/inspections/unit-inspection-ref";
import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";
import type { InspectionStatus } from "@/lib/scope-square-style";

export const OPEN_PENDING_INSPECTION_EVENT = "inspections:open-pending";

export interface OpenPendingInspectionDetail {
  localId: string;
}

export function requestOpenPendingInspection(localId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenPendingInspectionDetail>(OPEN_PENDING_INSPECTION_EVENT, {
      detail: { localId },
    }),
  );
}

export function subscribeOpenPendingInspection(
  handler: (localId: string) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  function onEvent(e: Event) {
    const detail = (e as CustomEvent<OpenPendingInspectionDetail>).detail;
    if (detail?.localId) handler(detail.localId);
  }

  window.addEventListener(OPEN_PENDING_INSPECTION_EVENT, onEvent);
  return () => window.removeEventListener(OPEN_PENDING_INSPECTION_EVENT, onEvent);
}

/** Minimal scope row for the fill overlay when only pending IDB data is available. */
export function minimalScopeFromPending(pending: PendingInspection): ScopeRow | undefined {
  if (!pending.scopeRowId || !pending.scopeTypeCode) return undefined;

  const emptyStatus = "NOT_STARTED" as ScopeStatus;
  const emptyStage = "INSTALL" as ScopeStage;
  const emptyInspection = null as InspectionStatus;

  return {
    id: pending.scopeRowId,
    scopeType: {
      id: pending.scopeRowId,
      code: pending.scopeTypeCode,
      name: pending.scopeTypeCode,
      canonicalScopeType: null,
    },
    description: "",
    qty: null,
    uom: null,
    percentComplete: null,
    installer: null,
    unifierSubId: null,
    shipPhase: "",
    buildPhase: "",
    area: "",
    scopeStage: emptyStage,
    scopeStatus: emptyStatus,
    inspectionStatus: emptyInspection,
    subScopeInstances: [],
    clearInspection: null,
  };
}

export function locationPartsFromPending(
  pending: PendingInspection,
): { building?: string; level?: string; unit?: string } | undefined {
  if (isProjectLevelInspectionUnitId(pending.unitId)) return undefined;
  const parsed = parseUnitInspectionRef(pending.unitId);
  if (!parsed) return undefined;
  return {
    building: parsed.building || undefined,
    level: parsed.level || undefined,
    unit: parsed.unit || undefined,
  };
}

import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";

export interface ClearInspectionScopeInput {
  scopeStage: ScopeStage | null;
  scopeStatus: ScopeStatus | null;
  subScopeInstances?: Array<{
    scopeStage: ScopeStage | null;
    scopeStatus: ScopeStatus | null;
  }>;
}

/** True when the parent scope row is Install Complete-Verified (INSTALL+COMPLETE). */
export function isProjectRowInstallCompleteForClearInspection(
  input: ClearInspectionScopeInput,
): boolean {
  return input.scopeStage === "INSTALL" && input.scopeStatus === "COMPLETE";
}

/** True when Clear Inspection UI must show the prep card (sub and/or install incomplete). */
export function scopeNeedsClearInspectionPrepGate(
  scope: { unifierSubId: string | null },
  isInstallComplete: boolean,
): boolean {
  return !scope.unifierSubId || !isInstallComplete;
}

export const CLEAR_INSPECTION_INSTALL_COMPLETE_ERROR =
  "Clear inspections can only be performed when the scope is Install · Complete.";

export const CLEAR_INSPECTION_NO_SUBCONTRACTOR_ERROR =
  "Assign a subcontractor to this scope before starting a clear inspection.";

export type ClearInspectionScopeLockReason = "install_complete" | "subcontractor";

export interface ClearInspectionScopeRowInput extends ClearInspectionScopeInput {
  unifierSubId: string | null;
}

/** Why a scope row is locked in the Clear Inspection scope picker, or null when selectable. */
export function getClearInspectionScopeLockReason(
  scope: ClearInspectionScopeRowInput,
): ClearInspectionScopeLockReason | null {
  if (!isProjectRowInstallCompleteForClearInspection(scope)) {
    return "install_complete";
  }
  if (!scope.unifierSubId) {
    return "subcontractor";
  }
  return null;
}

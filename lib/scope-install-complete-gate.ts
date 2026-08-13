/**
 * Client-safe install-complete transition gates (mirrors server FB-0027 rules).
 */

import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";
import { isScopeInstallComplete } from "@/lib/unit-scope-progress";

export function isTransitionToInstallCompleteVerifiedScope(
  prevStage: ScopeStage,
  prevStatus: ScopeStatus,
  nextStage: ScopeStage,
  nextStatus: ScopeStatus,
): boolean {
  if (nextStage !== "INSTALL" || nextStatus !== "COMPLETE") return false;
  return !(prevStage === "INSTALL" && prevStatus === "COMPLETE");
}

export function effectiveUnifierSubIdForPatch(
  currentSubId: string | null | undefined,
  patchSubId: string | null | undefined,
): string | null {
  if (patchSubId !== undefined) return patchSubId;
  return currentSubId ?? null;
}

/** True when the pending status pick should show subcontractor assignment in the photo prompt. */
export function statusPickRequiresSubcontractorAssignment(
  currentSubId: string | null | undefined,
  prevStage: ScopeStage,
  prevStatus: ScopeStatus,
  updates: Pick<{ scopeStage?: ScopeStage; scopeStatus?: ScopeStatus }, "scopeStage" | "scopeStatus">,
): boolean {
  if (currentSubId?.trim()) return false;
  const nextStage = updates.scopeStage !== undefined ? updates.scopeStage : prevStage;
  const nextStatus = updates.scopeStatus !== undefined ? updates.scopeStatus : prevStatus;
  return isTransitionToInstallCompleteVerifiedScope(
    prevStage,
    prevStatus,
    nextStage,
    nextStatus,
  );
}

export function isTransitionToInstallCompleteScope(
  prevStage: ScopeStage,
  prevStatus: ScopeStatus,
  nextStage: ScopeStage,
  nextStatus: ScopeStatus,
): boolean {
  if (!isScopeInstallComplete(nextStage, nextStatus)) return false;
  return !isScopeInstallComplete(prevStage, prevStatus);
}

export interface IssueForInstallCompleteGate {
  status: string;
  isBlockingWork: boolean;
  scopeTags: Array<{ row: { id: string } }>;
  subScopeTags?: Array<{ subScopeInstance?: { id: string } | null }>;
}

export function scopeRowHasOpenBlockingIssueForInstallComplete(
  issues: ReadonlyArray<IssueForInstallCompleteGate>,
  scopeRowId: string,
): boolean {
  return issues.some(
    (issue) =>
      issue.status === "OPEN" &&
      issue.isBlockingWork &&
      issue.scopeTags.some((tag) => tag.row.id === scopeRowId),
  );
}

export function subScopeInstanceHasOpenBlockingIssueForInstallComplete(
  issues: ReadonlyArray<IssueForInstallCompleteGate>,
  scopeRowId: string,
  instanceId: string,
): boolean {
  if (scopeRowHasOpenBlockingIssueForInstallComplete(issues, scopeRowId)) return true;
  return issues.some(
    (issue) =>
      issue.status === "OPEN" &&
      issue.isBlockingWork &&
      (issue.subScopeTags ?? []).some((tag) => tag.subScopeInstance?.id === instanceId),
  );
}

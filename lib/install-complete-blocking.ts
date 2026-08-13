import { IssueStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { INSTALL_COMPLETE_NO_SUBCONTRACTOR_CODE } from "@/lib/blocking-issue-code";

export { BLOCKING_ISSUE_OPEN_CODE, INSTALL_COMPLETE_NO_SUBCONTRACTOR_CODE } from "@/lib/blocking-issue-code";

export const INSTALL_COMPLETE_NO_SUBCONTRACTOR_ERROR =
  "Assign a subcontractor to this scope before marking Install Complete-Verified.";

/**
 * Returns true for any "done from the sub's perspective" state — both PENDING_VERIFICATION
 * (Install Complete-Unverified) and COMPLETE (Install Complete-Verified) block open issues from
 * being marked resolved and gate inspection transitions.
 */
export function isInstallComplete(
  stage: string | null | undefined,
  status: string | null | undefined
): boolean {
  return stage === "INSTALL" && (status === "COMPLETE" || status === "PENDING_VERIFICATION");
}

/** Strictly INSTALL+COMPLETE (verified) — used when we need to distinguish verified from SUB. */
export function isInstallCompleteVerified(
  stage: string | null | undefined,
  status: string | null | undefined
): boolean {
  return stage === "INSTALL" && status === "COMPLETE";
}

/** True when the next state is INSTALL+COMPLETE (verified) but the previous state was not verified complete. */
export function isTransitionToInstallCompleteVerified(
  prevStage: string | null | undefined,
  prevStatus: string | null | undefined,
  nextStage: string | null | undefined,
  nextStatus: string | null | undefined,
): boolean {
  if (!isInstallCompleteVerified(nextStage, nextStatus)) return false;
  return !isInstallCompleteVerified(prevStage, prevStatus);
}

/** True when the next state is INSTALL+COMPLETE or INSTALL+PENDING_VERIFICATION but the previous state was not. */
export function isTransitionToInstallComplete(
  prevStage: string | null | undefined,
  prevStatus: string | null | undefined,
  nextStage: string | null | undefined,
  nextStatus: string | null | undefined
): boolean {
  if (!isInstallComplete(nextStage, nextStatus)) return false;
  return !isInstallComplete(prevStage, prevStatus);
}

export async function projectRowHasOpenBlockingIssue(
  projectId: string,
  projectRowId: string
): Promise<boolean> {
  const n = await db.projectIssue.count({
    where: {
      projectId,
      status: IssueStatus.OPEN,
      isBlockingWork: true,
      scopeTags: { some: { projectRowId } },
    },
  });
  return n > 0;
}

export async function subScopeInstanceHasOpenBlockingIssue(
  projectId: string,
  instanceId: string
): Promise<boolean> {
  const inst = await db.projectSubScopeInstance.findUnique({
    where: { id: instanceId },
    select: { rowId: true },
  });
  if (!inst) return false;
  if (await projectRowHasOpenBlockingIssue(projectId, inst.rowId)) return true;
  const n = await db.projectIssue.count({
    where: {
      projectId,
      status: IssueStatus.OPEN,
      isBlockingWork: true,
      subScopeTags: { some: { subScopeInstanceId: instanceId } },
    },
  });
  return n > 0;
}

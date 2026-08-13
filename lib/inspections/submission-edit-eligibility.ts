import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";

/**
 * Whether the current user may edit a submitted inspection in place (PUT), rather
 * than starting a new retry attempt. Only the original submitter may edit the
 * most recent FORM attempt for that scope + form (all categories).
 */
export function canAuthorEditInspectionSubmission(input: {
  submission: InspectionSubmission;
  currentUserId: string | null | undefined;
  isMostRecentAttempt: boolean;
}): boolean {
  const { submission, currentUserId, isMostRecentAttempt } = input;

  if (!isMostRecentAttempt) return false;
  if (submission.source !== "FORM") return false;

  // Unsynced local queue — same device captured it; allow edit until sync settles.
  if (submission._pendingSync) return true;

  if (!currentUserId) return false;
  if (!submission.submittedById) return false;
  return submission.submittedById === currentUserId;
}

/** @deprecated Prefer {@link canAuthorEditInspectionSubmission}. */
export function canAuthorEditFieldVerificationSubmission(input: {
  submission: InspectionSubmission;
  currentUserId: string | null | undefined;
  isMostRecentAttempt: boolean;
}): boolean {
  return canAuthorEditInspectionSubmission(input);
}

/** True when `sub` is the newest FORM submission for its form on this scope/unit list. */
export function isMostRecentFormAttempt(
  submissions: InspectionSubmission[],
  sub: InspectionSubmission,
): boolean {
  if (!sub.formId) return false;
  const sorted = [...submissions]
    .filter((s) => s.source === "FORM" && s.formId === sub.formId)
    .sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );
  return sorted[0]?.id === sub.id;
}

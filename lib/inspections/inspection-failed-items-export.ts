import type { SectionResult } from "@/app/api/projects/[id]/inspections-report/route";

/** Shared sentinel HTML when a failed-only export record has no question body. */
export const INSPECTION_PDF_NO_FAILED_ITEMS_HTML =
  '<p class="muted">No failed items in this record.</p>';

/** True when the inspections report row has at least one failed pass/fail question. */
export function submissionHasFailedExportItems(submission: {
  sections: SectionResult[];
}): boolean {
  return submission.sections.some((sec) => sec.failingQuestions.length > 0);
}

/** True when a failed-only PDF body has no exportable question content. */
export function isEmptyFailedOnlyExportBody(bodyHtml: string): boolean {
  return bodyHtml.trim() === INSPECTION_PDF_NO_FAILED_ITEMS_HTML.trim();
}

export class FailedOnlyExportEmptyError extends Error {
  constructor() {
    super("No failed items to export.");
    this.name = "FailedOnlyExportEmptyError";
  }
}

export function filterSubmissionsForFailedOnlyExport<T extends { sections: SectionResult[] }>(
  submissions: readonly T[],
  shareOnlyFailedItems: boolean,
): T[] {
  if (!shareOnlyFailedItems) return [...submissions];
  return submissions.filter(submissionHasFailedExportItems);
}

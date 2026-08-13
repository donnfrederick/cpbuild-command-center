/**
 * Loads hydrated inspection submissions for offline snapshot bundles.
 * Shape matches GET /api/inspection-submissions response items.
 */

import { db } from "@/lib/db";
import { hydrateInspectionSubmissionView } from "@/lib/inspections/hydrate-inspection-submission-view";
import { enrichSubmissionsWithActivitySubmitters } from "@/lib/inspections/resolve-submission-submitter";

export async function serializeInspectionSubmissionsForSnapshot(
  projectIds: string[],
): Promise<unknown[]> {
  if (projectIds.length === 0) return [];

  const submissions = await db.inspectionSubmission.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: { submittedAt: "desc" },
    include: {
      form: {
        select: {
          id: true,
          name: true,
          category: true,
          level: true,
          purpose: true,
          scopeTypeCodes: true,
          description: true,
        },
      },
      formVersion: { select: { id: true, versionNumber: true } },
      clearInspection: {
        select: {
          inspectedById: true,
          inspectedBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  const hydratedSubmissions = await Promise.all(
    submissions.map(async (submission) => {
      const hydrated = await hydrateInspectionSubmissionView(submission);
      return {
        ...submission,
        submittedAt: submission.submittedAt.toISOString(),
        templateSnapshot: hydrated.templateSnapshot,
        payload: hydrated.payload,
      };
    }),
  );

  return enrichSubmissionsWithActivitySubmitters(db, hydratedSubmissions);
}

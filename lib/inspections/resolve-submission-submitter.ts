import type { PrismaClient } from "@prisma/client";
import { resolveInspectorName } from "@/lib/inspections/inspector-display";

type ClearInspectionInspector = {
  inspectedById: string | null;
  inspectedBy: { id: string; name: string | null } | null;
} | null;

export type SubmissionWithClearInspection = {
  id: string;
  clearInspection?: ClearInspectionInspector;
};

type ActivityReadClient = Pick<PrismaClient, "activityLog">;

/** Keep Prisma OR clauses bounded for large submission lists. */
const ACTIVITY_SUBMITTER_LOOKUP_BATCH = 50;

async function loadSubmittersFromActivityLogs(
  client: ActivityReadClient,
  submissionIds: string[],
): Promise<Map<string, { userId: string | null; userName: string | null }>> {
  const submitterBySubmissionId = new Map<
    string,
    { userId: string | null; userName: string | null }
  >();

  for (let offset = 0; offset < submissionIds.length; offset += ACTIVITY_SUBMITTER_LOOKUP_BATCH) {
    const chunk = submissionIds.slice(offset, offset + ACTIVITY_SUBMITTER_LOOKUP_BATCH);
    const logs = await client.activityLog.findMany({
      where: {
        eventType: "INSPECTION_SUBMITTED",
        OR: chunk.map((id) => ({
          metadata: { path: ["submissionId"], equals: id },
        })),
      },
      select: { userId: true, userName: true, metadata: true },
      orderBy: { createdAt: "desc" },
    });

    for (const log of logs) {
      const meta = log.metadata as { submissionId?: string };
      const submissionId = meta?.submissionId;
      if (!submissionId || submitterBySubmissionId.has(submissionId)) continue;
      submitterBySubmissionId.set(submissionId, {
        userId: log.userId,
        userName: log.userName,
      });
    }
  }

  return submitterBySubmissionId;
}

function syntheticClearInspection(input: {
  userId: string | null;
  userName: string | null;
}): NonNullable<ClearInspectionInspector> {
  const name = input.userName?.trim() || null;
  const id = input.userId ?? "";
  return {
    inspectedById: input.userId,
    inspectedBy: name
      ? { id, name }
      : input.userId
        ? { id: input.userId, name: null }
        : null,
  };
}

/** Attach session user as inspector when no clear_inspections row exists (project-level forms). */
export function attachSubmitterFromSession<T extends SubmissionWithClearInspection>(
  submission: T,
  user: { id: string | null; name: string | null | undefined },
): T {
  if (resolveInspectorName(submission.clearInspection, "")) {
    return submission;
  }
  // Preserve stored inspector id even when the user row was deleted (name missing).
  if (submission.clearInspection?.inspectedById) {
    return submission;
  }
  const name = user.name?.trim() || null;
  if (!user.id && !name) return submission;
  return {
    ...submission,
    clearInspection: syntheticClearInspection({
      userId: user.id,
      userName: name,
    }),
  };
}

/**
 * Batch-resolve submitter names from activity_logs for submissions that have
 * no clear_inspections.inspectedBy (e.g. project-level documentation forms).
 */
export async function enrichSubmissionsWithActivitySubmitters<
  T extends SubmissionWithClearInspection,
>(client: ActivityReadClient, submissions: T[]): Promise<T[]> {
  const missingIds = submissions
    .filter((s) => !resolveInspectorName(s.clearInspection, ""))
    .map((s) => s.id);
  if (missingIds.length === 0) return submissions;

  const submitterBySubmissionId = await loadSubmittersFromActivityLogs(client, missingIds);

  return submissions.map((submission) => {
    if (resolveInspectorName(submission.clearInspection, "")) return submission;
    const fromActivity = submitterBySubmissionId.get(submission.id);
    if (!fromActivity?.userName?.trim() && !fromActivity?.userId) return submission;
    return {
      ...submission,
      clearInspection: syntheticClearInspection({
        userId: fromActivity.userId,
        userName: fromActivity.userName,
      }),
    };
  });
}

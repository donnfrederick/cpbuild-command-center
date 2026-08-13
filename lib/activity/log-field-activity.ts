import type { ActivityMetadata } from "@/lib/activity-logger";
import {
  logActivity,
  resolveActivityActorName,
} from "@/lib/activity-logger";
import { readActivityLocationFromBody } from "@/lib/activity/activity-location-schema";
import { attachActivityLocationAfterLog } from "@/lib/activity/persist-activity-location";

interface LogFieldActivitySession {
  user: { id?: string | null; name?: string | null; email?: string | null };
}

/** Log activity and persist GPS context when the client sent activityLocation or media attachments. */
export async function logFieldActivity(
  projectId: string,
  session: LogFieldActivitySession,
  meta: ActivityMetadata,
  options?: {
    requestBody?: Record<string, unknown> | null;
    attachmentIds?: string[];
  },
): Promise<string | null> {
  const { actorId, userName } = await resolveActivityActorName(session);
  const activityLogId = await logActivity(projectId, actorId, userName, meta);
  const activityLocation = options?.requestBody
    ? readActivityLocationFromBody(options.requestBody)
    : null;
  await attachActivityLocationAfterLog(activityLogId, projectId, {
    activityLocation,
    attachmentIds: options?.attachmentIds,
  });
  return activityLogId;
}

/** Fire-and-forget wrapper for route handlers that already resolved actor elsewhere. */
export function voidLogFieldActivity(
  projectId: string,
  session: LogFieldActivitySession,
  meta: ActivityMetadata,
  options?: {
    requestBody?: Record<string, unknown> | null;
    attachmentIds?: string[];
  },
): void {
  void logFieldActivity(projectId, session, meta, options);
}

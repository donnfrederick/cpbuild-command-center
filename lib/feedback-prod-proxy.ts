import "server-only";

import { getEffectiveSession } from "@/lib/masquerade";
import { hasFeedbackInboxAccess } from "@/lib/feedback-access";
import { fetchProdInternalFeedback, isFeedbackProdMergeEnabled } from "@/lib/feedback-prod-client";
import type { FeedbackEnvironment } from "@/lib/feedback-environment";

/**
 * Whether the current session may request production feedback through the dev server proxy.
 */
export async function sessionMayProxyProdFeedback(): Promise<boolean> {
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) return false;
  return (
    hasFeedbackInboxAccess(effective.user.role, effective.user.specialPermissions) &&
    isFeedbackProdMergeEnabled()
  );
}

/**
 * @param internalPath path under `/api/internal/feedback`, e.g. `/cuid123` or `/cuid123/comments`
 */
export async function proxyProdFeedbackPath(
  internalPath: string,
  environment: FeedbackEnvironment | null,
  init?: RequestInit
): Promise<Response | null> {
  if (environment !== "production") return null;
  if (!(await sessionMayProxyProdFeedback())) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const p = internalPath.startsWith("/") ? internalPath : `/${internalPath}`;
  return fetchProdInternalFeedback(p, init);
}

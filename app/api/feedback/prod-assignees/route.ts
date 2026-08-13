import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasFeedbackInboxAccess } from "@/lib/feedback-access";
import { fetchProdInternalFeedback, isFeedbackProdMergeEnabled } from "@/lib/feedback-prod-client";

/**
 * GET /api/feedback/prod-assignees — inbox only; returns prod User rows eligible as feedback assignees
 * when the dev server is configured to merge production feedback (bridge + prod base URL).
 */
export async function GET() {
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasFeedbackInboxAccess(effective.user.role, effective.user.specialPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isFeedbackProdMergeEnabled()) {
    return NextResponse.json({ assignees: [] });
  }

  const res = await fetchProdInternalFeedback("/assignees", { method: "GET" });
  if (!res.ok) {
    return NextResponse.json({ assignees: [], prodUnreachable: true });
  }
  const data = (await res.json()) as { assignees: unknown[] };
  return NextResponse.json(data);
}

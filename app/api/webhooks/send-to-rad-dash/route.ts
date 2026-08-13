import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasFeedbackInboxAccess } from "@/lib/feedback-access";
import { isStrictProductionDeployment } from "@/lib/production-deployment";
import type { FieldTrackerWebhookPayload } from "@/lib/rad-dash-webhook";

const bodySchema = z.object({
  feedbackIds: z.array(z.string().min(1)).min(1).max(50),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getEffectiveSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  const specialPermissions = session.user.specialPermissions ?? [];
  if (!hasFeedbackInboxAccess(role, specialPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const webhookUrl = process.env.RAD_DASH_WEBHOOK_URL;
  const webhookSecret = process.env.RAD_DASH_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) {
    return NextResponse.json(
      { error: "Rad-Dash integration is not configured on this server." },
      { status: 503 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { feedbackIds } = parsed.data;

  const reports = await db.feedbackReport.findMany({
    where: { id: { in: feedbackIds } },
    include: { user: { select: { name: true, email: true } } },
  });

  if (reports.length === 0) {
    return NextResponse.json({ error: "No feedback found for the given IDs" }, { status: 404 });
  }

  const environment: "dev" | "prod" = isStrictProductionDeployment() ? "prod" : "dev";

  const payload: FieldTrackerWebhookPayload = {
    environment,
    feedbackItems: reports.map((r) => ({
      id: r.id,
      shortId: r.shortId,
      type: r.type,
      title: r.title,
      description: r.description,
      screenshot: r.screenshot ?? null,
      videoUrl: r.videoUrl ?? null,
      pageUrl: r.pageUrl ?? null,
      priority: r.priority ?? null,
      submittedBy: r.user.name ?? r.user.email,
      createdAt: r.createdAt.toISOString(),
    })),
  };

  let radDashRes: Response;
  try {
    radDashRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${webhookSecret}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err: unknown) {
    console.error("[webhooks/send-to-rad-dash] fetch error:", err);
    return NextResponse.json(
      { error: "Failed to reach Rad-Dash. Check RAD_DASH_WEBHOOK_URL." },
      { status: 502 }
    );
  }

  if (!radDashRes.ok) {
    const errBody = await radDashRes.text();
    console.error(
      `[webhooks/send-to-rad-dash] Rad-Dash returned ${radDashRes.status}: ${errBody}`
    );
    return NextResponse.json(
      { error: `Rad-Dash rejected the request (${radDashRes.status})` },
      { status: 502 }
    );
  }

  const result = (await radDashRes.json()) as {
    created: number;
    tickets: Array<{ id: string; shortId: number }>;
  };

  const now = new Date();

  // Store the rad-dash ticket ID on each report (matched by index) so that
  // the reverse status-change webhook can look up the report by radDashTicketId.
  for (let i = 0; i < (result.tickets ?? []).length; i++) {
    const ticket = result.tickets[i];
    const reportId = feedbackIds[i];
    if (!ticket || !reportId) continue;
    await db.feedbackReport.update({
      where: { id: reportId },
      data: { sentToRadDashAt: now, radDashTicketId: ticket.id },
    });
  }

  // Fall back to a plain timestamp update for any reports that weren't covered
  // (e.g. if rad-dash returned fewer tickets than expected).
  const coveredIds = new Set(feedbackIds.slice(0, (result.tickets ?? []).length));
  const uncoveredIds = feedbackIds.filter((id) => !coveredIds.has(id));
  if (uncoveredIds.length > 0) {
    await db.feedbackReport.updateMany({
      where: { id: { in: uncoveredIds } },
      data: { sentToRadDashAt: now },
    });
  }

  return NextResponse.json({ created: result.created });
}

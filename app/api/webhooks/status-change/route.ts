import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const payloadSchema = z.object({
  projectId: z.string().min(1),
  ticketId: z.string().min(1),
  status: z.enum(["IN_PROGRESS", "RESOLVED"]),
});

function verifySecret(req: NextRequest): boolean {
  const secret = process.env.RAD_DASH_WEBHOOK_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const [scheme, token] = auth.split(" ");
  return scheme === "Bearer" && token === secret;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { ticketId, status } = parsed.data;

  const report = await db.feedbackReport.findUnique({
    where: { radDashTicketId: ticketId },
    select: { id: true, status: true },
  });

  if (!report) {
    return NextResponse.json(
      { error: "No feedback report linked to this rad-dash ticket ID" },
      { status: 404 }
    );
  }

  if (report.status === status) {
    return NextResponse.json({ ok: true, changed: false });
  }

  await db.feedbackReport.update({
    where: { id: report.id },
    data: { status },
  });

  console.log(
    `[webhooks/status-change] FeedbackReport ${report.id} status → ${status} (rad-dash ticket ${ticketId})`
  );

  return NextResponse.json({ ok: true, changed: true });
}

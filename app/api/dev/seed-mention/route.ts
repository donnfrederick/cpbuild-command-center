import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// DEV ONLY — seeds a fake mention notification so you can preview the UX.
// Only accessible when DEV_BYPASS_AUTH=true (local dev). Never reachable in prod.
export async function POST() {
  if (
    process.env.DEV_BYPASS_AUTH !== "true" ||
    process.env.NODE_ENV === "production"
  ) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  // Pick the first real user in the DB as the recipient (the current dev session)
  const recipient = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!recipient) {
    return NextResponse.json({ error: "No users found in DB" }, { status: 400 });
  }

  // Pick a different user as the "actor" (who mentioned them), if one exists
  const actor = await db.user.findFirst({
    where: { id: { not: recipient.id } },
    orderBy: { createdAt: "asc" },
  });

  // Find a real project to link to (so the deep-link works)
  const project = await db.project.findFirst({ orderBy: { createdAt: "asc" } });

  // Find a real issue to deep-link to
  const issue = project
    ? await db.projectIssue.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } })
    : null;

  const [commentNotif, issueNotif] = await Promise.all([
    db.notification.create({
      data: {
        userId: recipient.id,
        type: "MENTIONED_IN_COMMENT",
        actorId: actor?.id ?? recipient.id,
        actorName: actor?.name ?? "Hannah Farr",
        projectId: project?.id ?? null,
        issueId: issue?.id ?? null,
        read: false,
      },
    }),
    db.notification.create({
      data: {
        userId: recipient.id,
        type: "MENTIONED_IN_ISSUE_NOTES",
        actorId: actor?.id ?? recipient.id,
        actorName: actor?.name ?? "Hannah Farr",
        projectId: project?.id ?? null,
        issueId: issue?.id ?? null,
        read: false,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    recipient: recipient.email,
    created: [commentNotif.id, issueNotif.id],
    tip: "Open the notification bell or account panel to see the test notifications.",
  });
}

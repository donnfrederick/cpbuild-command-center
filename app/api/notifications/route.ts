import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";

/** GET /api/notifications — list the current user's notifications, newest first */
export async function GET() {
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUserId = await resolveSessionToDbUserId(effective.user);
  if (!dbUserId) {
    return NextResponse.json([]);
  }

  const notifications = await db.notification.findMany({
    where: { userId: dbUserId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      feedback: {
        select: {
          id: true,
          type: true,
          title: true,
          status: true,
          tour: { select: { id: true } },
        },
      },
    },
  });

  // Return mention fields alongside the existing shape
  return NextResponse.json(
    notifications.map((n) => ({
      id: n.id,
      type: n.type,
      read: n.read,
      createdAt: n.createdAt,
      feedback: n.feedback,
      // Mention-specific fields (null for feedback notifications)
      actorName: n.actorName,
      projectId: n.projectId,
      issueId: n.issueId,
      observationId: n.observationId,
      mentionCommentId: n.mentionCommentId,
    }))
  );
}

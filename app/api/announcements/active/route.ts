import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { mapActiveAnnouncement } from "@/lib/announcements/map-announcement";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const userId = session.user.id;

  const rows = await db.appAnnouncement.findMany({
    where: {
      active: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  const dismissed = await db.appAnnouncementDismissal.findMany({
    where: { userId },
    select: { announcementId: true, campaignVersion: true },
  });
  const dismissedKeys = new Set(
    dismissed.map((d) => `${d.announcementId}:${d.campaignVersion}`),
  );

  const eligible = rows.filter(
    (row) => !dismissedKeys.has(`${row.id}:${row.campaignVersion}`),
  );

  return NextResponse.json({
    announcements: eligible.map(mapActiveAnnouncement),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const announcement = await db.appAnnouncement.findUnique({ where: { id } });
  if (!announcement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  if (!announcement.active || announcement.startsAt > now || announcement.endsAt < now) {
    return NextResponse.json({ error: "Announcement not active" }, { status: 400 });
  }

  await db.appAnnouncementDismissal.upsert({
    where: {
      announcementId_userId_campaignVersion: {
        announcementId: id,
        userId: session.user.id,
        campaignVersion: announcement.campaignVersion,
      },
    },
    create: {
      announcementId: id,
      userId: session.user.id,
      campaignVersion: announcement.campaignVersion,
    },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  adminGuardResponse,
  requireAnnouncementAdmin,
} from "@/lib/announcements/require-announcement-admin";
import { mapAdminAnnouncement } from "@/lib/announcements/map-announcement";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAnnouncementAdmin();
  if (guard.status) return adminGuardResponse(guard.status);

  const { id } = await context.params;
  const existing = await db.appAnnouncement.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = await db.appAnnouncement.update({
    where: { id },
    data: { campaignVersion: { increment: 1 } },
  });

  const dismissCount = await db.appAnnouncementDismissal.count({
    where: { announcementId: id },
  });

  return NextResponse.json({ announcement: mapAdminAnnouncement(row, dismissCount) });
}

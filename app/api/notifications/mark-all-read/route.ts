import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";

/** POST /api/notifications/mark-all-read — mark all of the current user's notifications as read */
export async function POST() {
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUserId = await resolveSessionToDbUserId(effective.user);
  if (!dbUserId) {
    return new NextResponse(null, { status: 204 });
  }

  await db.notification.updateMany({
    where: { userId: dbUserId, read: false },
    data: { read: true },
  });

  return new NextResponse(null, { status: 204 });
}

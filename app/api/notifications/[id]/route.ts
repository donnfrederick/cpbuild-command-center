import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";

/** PATCH /api/notifications/[id] — mark a single notification as read (owner only) */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const effective = await getEffectiveSession();
  if (!effective?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUserId = await resolveSessionToDbUserId(effective.user);
  if (!dbUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const notification = await db.notification.findUnique({ where: { id } });
  if (!notification) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (notification.userId !== dbUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await db.notification.update({
    where: { id },
    data: { read: true },
  });

  return NextResponse.json(updated);
}

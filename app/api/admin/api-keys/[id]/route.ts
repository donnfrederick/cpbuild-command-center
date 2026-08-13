/**
 * DELETE /api/admin/api-keys/{id} — Revoke an API key (ADMIN only)
 *
 * Sets revokedAt to now. Does not delete the row — keeps the audit trail.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";

async function requireAdmin() {
  const session = await getSession();
  if (!session?.user) return null;
  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES)) return null;
  return session;
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const key = await db.apiKey.findUnique({ where: { id }, select: { id: true, revokedAt: true } });
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (key.revokedAt) return NextResponse.json({ error: "Key is already revoked" }, { status: 409 });

  const revoked = await db.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
    select: { id: true, name: true, keyPrefix: true, revokedAt: true },
  });

  return NextResponse.json({ ...revoked, status: "revoked" });
}

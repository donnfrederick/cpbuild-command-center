/**
 * GET /api/bi/v1/team
 *
 * Returns all active team members with name, email, and role.
 * Sensitive fields (passwordHash, failedLoginAttempts, lockedUntil, etc.) are excluded.
 * Requires scope: bi:team
 *
 * Response: flat JSON array — each row maps directly to a PBI table row.
 */

import { validateBiKey, requireScope, biResponseHeaders } from "@/lib/bi-auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const keyCtx = await validateBiKey(request);
  if (!keyCtx) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: biResponseHeaders() });
  }
  if (!requireScope(keyCtx, "bi:team")) {
    return new Response(JSON.stringify({ error: "Forbidden", requiredScope: "bi:team" }), { status: 403, headers: biResponseHeaders() });
  }

  const members = await db.user.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      role: { select: { code: true, name: true } },
    },
  });

  const flat = members.map((u) => ({
    userId: u.id,
    name: u.name ?? null,
    email: u.email,
    roleCode: u.role.code,
    roleName: u.role.name,
    status: u.status,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt,
  }));

  return new Response(JSON.stringify(flat), { status: 200, headers: biResponseHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: biResponseHeaders() });
}

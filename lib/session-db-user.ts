import { db } from "@/lib/db";

/**
 * Maps a session user to a real `User.id` for queries that key off the user row
 * (notifications, etc.).
 *
 * Dev bypass uses synthetic `id: "dev-user"` with no DB row — the same resolution
 * as feedback/issue comment author fallback: email match if present, else first user.
 * Team @mentions always use real ids, so notifications are stored under real `userId`;
 * without this, `/api/notifications` queried `dev-user` and returned nothing locally.
 */
export async function resolveSessionToDbUserId(user: {
  id: string;
  email?: string | null;
}): Promise<string | null> {
  if (user.id !== "dev-user") {
    const row = await db.user.findUnique({ where: { id: user.id }, select: { id: true } });
    if (row) return row.id;
  }
  if (user.email) {
    const byEmail = await db.user.findUnique({ where: { email: user.email }, select: { id: true } });
    if (byEmail) return byEmail.id;
  }
  const adminFirst = await db.user.findFirst({
    where: { role: { code: "ADMIN" } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (adminFirst) return adminFirst.id;
  const anyUser = await db.user.findFirst({ select: { id: true } });
  return anyUser?.id ?? null;
}

/**
 * PATCH /api/users/me
 * Updates the current user's display name.
 * Auth: any authenticated user (own record only).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import type { ApiError } from "@/types";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
});

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ApiError>({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      { error: "Validation error", details: parsed.error.flatten().fieldErrors as Record<string, string[]> },
      { status: 400 }
    );
  }

  // Try by id first — reliable for all real auth sessions where the JWT id
  // is the actual DB primary key. Dev bypass sessions use the synthetic id
  // "dev-user" which won't match, so those fall through to the email lookup.
  let user: { id: string } | null = null;
  if (session.user.id && session.user.id !== "dev-user") {
    user = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
  }
  // Email fallback — covers dev bypass sessions that have a persona cookie
  // pointing at a real DB user.
  if (!user && session.user.email) {
    user = await db.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  }
  if (!user) {
    // In dev bypass mode the synthetic "dev-user" identity has no DB record.
    // Return a mock success so local development isn't broken; the change
    // won't persist to the database but the UI won't show an error.
    if (
      process.env.DEV_BYPASS_AUTH === "true" &&
      process.env.NODE_ENV !== "production"
    ) {
      return NextResponse.json({ name: parsed.data.name.trim() });
    }
    return NextResponse.json<ApiError>({ error: "User not found" }, { status: 404 });
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name.trim() },
    select: { name: true },
  });

  return NextResponse.json(updated);
}

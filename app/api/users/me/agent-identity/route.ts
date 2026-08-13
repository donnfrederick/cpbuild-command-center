/**
 * GET  /api/users/me/agent-identity
 * PATCH /api/users/me/agent-identity
 * Auth: any authenticated user (own record only).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import type { ApiError } from "@/types";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  agentName:     z.string().max(40).default(""),
  agentCallsign: z.string().max(3).default(""),
  agentMission:  z.string().max(280).default(""),
});

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user.role, PERMISSIONS.ACCESS_DEVTOOLS)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  let user: { agentName: string | null; agentCallsign: string | null; agentMission: string | null } | null = null;
  if (session.user.id && session.user.id !== "dev-user") {
    user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { agentName: true, agentCallsign: true, agentMission: true },
    });
  }
  if (!user && session.user.email) {
    user = await db.user.findUnique({
      where: { email: session.user.email },
      select: { agentName: true, agentCallsign: true, agentMission: true },
    });
  }

  return NextResponse.json(
    user ?? { agentName: null, agentCallsign: null, agentMission: null }
  );
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user.role, PERMISSIONS.ACCESS_DEVTOOLS)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
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

  const { agentName, agentCallsign, agentMission } = parsed.data;
  const normalizedCallsign = agentCallsign.toUpperCase().trim().slice(0, 3);

  let user: { id: string } | null = null;
  if (session.user.id && session.user.id !== "dev-user") {
    user = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
  }
  if (!user && session.user.email) {
    user = await db.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  }
  if (!user) {
    if (process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production") {
      return NextResponse.json({ agentName: agentName || null, agentCallsign: normalizedCallsign || null, agentMission: agentMission || null });
    }
    return NextResponse.json<ApiError>({ error: "User not found" }, { status: 404 });
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      agentName:     agentName     || null,
      agentCallsign: normalizedCallsign || null,
      agentMission:  agentMission  || null,
    },
    select: { agentName: true, agentCallsign: true, agentMission: true },
  });

  return NextResponse.json(updated);
}

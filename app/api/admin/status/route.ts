import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

export interface AdminStatusResponse {
  environment: string;
  gitSha: string;
  gitBranch: string;
  nodeVersion: string;
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * GET /api/admin/status — admin-only deployment info endpoint.
 *
 * Returns Railway-injected build metadata (git SHA, branch, environment)
 * and server uptime. Used by the /admin/status production health page.
 * Never call this from public code — access requires MANAGE_ROLES.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fullSha = process.env.RAILWAY_GIT_COMMIT_SHA ?? "";

  const body: AdminStatusResponse = {
    environment:
      process.env.RAILWAY_ENVIRONMENT_NAME ??
      process.env.NODE_ENV ??
      "local",
    gitSha: fullSha.slice(0, 7) || "unknown",
    gitBranch: process.env.RAILWAY_GIT_BRANCH ?? "unknown",
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body);
}

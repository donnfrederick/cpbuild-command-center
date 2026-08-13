import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Health check endpoint used by Railway health checks and smoke tests.
// Verifies DB connectivity so Railway won't promote a container with unapplied
// migrations or a broken DB connection — it will keep the old container serving
// until this endpoint returns 200.
// Never exposes secrets — only version, uptime, and db status.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        reason: "db_unreachable",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? "unknown",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "unknown",
  });
}

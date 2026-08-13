import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import type { DailyBriefingReport } from "@/lib/ai/types";

// ── Auth guard ────────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!hasPermission(session.user.role, PERMISSIONS.VIEW_MORNING_BRIEFING)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

// ── Summary extractor ─────────────────────────────────────────────────────────

function extractSummary(report: DailyBriefingReport) {
  const roi = report.roiAnalysis;
  return {
    roiSummary: roi?.summary ?? "",
    totalEstimatedValue: roi?.totalEstimatedValue ?? "",
    optimizationCount: Array.isArray(report.optimizationsRecognized)
      ? report.optimizationsRecognized.length
      : 0,
    issueCount: Array.isArray(report.issuesAndChallenges)
      ? report.issuesAndChallenges.length
      : 0,
    shippedCount: Array.isArray(report.yesterdaysWork?.shipped)
      ? report.yesterdaysWork.shipped.length
      : 0,
  };
}

// ── GET /api/daily-briefing/history ──────────────────────────────────────────
// Returns all stored briefings, newest first, with extracted summary fields.
// Full report detail is NOT included — fetch it via GET /api/daily-briefing?date=.

export async function GET() {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  const rows = await db.dailyBriefing.findMany({
    orderBy: { dateFor: "desc" },
    select: {
      id: true,
      dateFor: true,
      generatedAt: true,
      report: true,
    },
  });

  const items = rows.map((row) => {
    const report = row.report as unknown as DailyBriefingReport;
    return {
      id: row.id,
      dateFor: row.dateFor.toISOString().slice(0, 10),
      generatedAt: row.generatedAt.toISOString(),
      ...extractSummary(report),
    };
  });

  return NextResponse.json({ items });
}

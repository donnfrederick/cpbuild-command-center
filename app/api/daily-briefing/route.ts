import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { fetchYesterdayActivity } from "@/lib/github-activity";
import { generateDailyBriefingReport, isAIEnabled } from "@/lib/ai/gemini";
import type { DailyBriefingContext, DailyBriefingReport, DBActivityStats } from "@/lib/ai/types";

// ── Auth guard helper ─────────────────────────────────────────────────────────

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

/** Returns the date string (YYYY-MM-DD) for yesterday in UTC. */
function yesterdayDateString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Parses a YYYY-MM-DD string into a Date at midnight UTC. */
function parseDateUTC(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

// ── GET /api/daily-briefing ───────────────────────────────────────────────────
// Returns the cached briefing for yesterday (default) or a specific date via
// ?date=YYYY-MM-DD query param.

export async function GET(request: Request) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");

  // Validate ?date= param — must be YYYY-MM-DD if provided
  const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (dateParam && !VALID_DATE.test(dateParam)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
  }

  const dateStr = dateParam ?? yesterdayDateString();
  const dateFor = parseDateUTC(dateStr);

  const row = await db.dailyBriefing.findUnique({ where: { dateFor } });

  if (!row) {
    return NextResponse.json({ briefing: null, dateFor: dateStr });
  }

  return NextResponse.json({
    briefing: row.report as unknown as DailyBriefingReport,
    id: row.id,
    dateFor: dateStr,
    generatedAt: row.generatedAt.toISOString(),
  });
}

// ── POST /api/daily-briefing ──────────────────────────────────────────────────
// Generates (or regenerates) a briefing and upserts to DB.
// Defaults to yesterday (UTC). Accepts optional JSON body { date: "YYYY-MM-DD" }
// to generate/backfill a specific past date.

export async function POST(request: Request) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;
  const { session } = guard;

  if (!isAIEnabled()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured. Add it to your Railway environment variables." },
      { status: 503 }
    );
  }

  // Parse optional date from request body
  const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;
  let dateStr = yesterdayDateString();
  try {
    const body = await request.json().catch(() => ({})) as { date?: unknown };
    if (body.date && typeof body.date === "string") {
      if (!VALID_DATE.test(body.date)) {
        return NextResponse.json(
          { error: "Invalid date format. Use YYYY-MM-DD." },
          { status: 400 }
        );
      }
      const parsed = parseDateUTC(body.date);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Invalid date. Use a real calendar date in YYYY-MM-DD format." },
          { status: 400 }
        );
      }
      dateStr = body.date;
    }
  } catch {
    // Non-JSON body is fine — fall back to yesterday
  }

  const dateFor = parseDateUTC(dateStr);
  const yesterday = dateFor;

  // ── Gather context in parallel ──────────────────────────────────────────
  const [{ mergedPRs, recentCommits, openPRs = [] }, dbStats] = await Promise.all([
    fetchYesterdayActivity(yesterday),
    fetchDBStats(yesterday),
  ]);

  const ctx: DailyBriefingContext = {
    dateFor: dateStr,
    mergedPRs,
    recentCommits,
    openPRs,
    dbStats,
  };

  // ── Run Gemini pipeline ─────────────────────────────────────────────────
  let report: DailyBriefingReport;
  try {
    report = await generateDailyBriefingReport(ctx);
  } catch (err) {
    console.error("[daily-briefing] Gemini generation failed:", err);
    return NextResponse.json(
      { error: "AI generation failed. Check GEMINI_API_KEY and try again." },
      { status: 502 }
    );
  }

  // ── Upsert to DB ────────────────────────────────────────────────────────
  // Prisma's Json type requires a plain JSON-serializable value.
  // We round-trip through JSON to shed the typed wrapper.
  const reportJson = JSON.parse(JSON.stringify(report)) as Parameters<
    typeof db.dailyBriefing.upsert
  >[0]["create"]["report"];

  const row = await db.dailyBriefing.upsert({
    where: { dateFor },
    create: {
      dateFor,
      generatedBy: session.user.id,
      report: reportJson,
    },
    update: {
      generatedAt: new Date(),
      generatedBy: session.user.id,
      report: reportJson,
    },
  });

  return NextResponse.json({
    briefing: report,
    id: row.id,
    dateFor: dateStr,
    generatedAt: row.generatedAt.toISOString(),
  });
}

// ── DB stats helper ───────────────────────────────────────────────────────────

async function fetchDBStats(since: Date): Promise<DBActivityStats> {
  const until = new Date(since.getTime() + 24 * 60 * 60 * 1000);

  const [projectsCreated, projectsUpdated, rowsUpdated, totalActive, blockedRows] =
    await db.$transaction([
      db.project.count({ where: { createdAt: { gte: since, lt: until }, deletedAt: null } }),
      db.project.count({
        where: {
          updatedAt: { gte: since, lt: until },
          createdAt: { lt: since },
          deletedAt: null,
        },
      }),
      db.projectRow.count({ where: { updatedAt: { gte: since, lt: until } } }),
      db.project.count({ where: { deletedAt: null } }),
      db.projectRow.count({ where: { scopeStatus: "BLOCKED" } }),
    ]);

  return {
    projectsCreated,
    projectsUpdated,
    rowsUpdated,
    totalActiveProjects: totalActive,
    blockedRowCount: blockedRows,
  };
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { generateBriefingSynthesis, isAIEnabled } from "@/lib/ai/gemini";
import type { DailyBriefingReport, BriefingSynthesisReport } from "@/lib/ai/types";

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

// ── Window helpers ────────────────────────────────────────────────────────────

const WINDOW_ALLOWLIST = ["30", "90", "all"] as const;
type WindowParam = (typeof WINDOW_ALLOWLIST)[number];

function parseWindow(raw: string | null): WindowParam | null {
  if (!raw) return "30";
  if ((WINDOW_ALLOWLIST as readonly string[]).includes(raw)) return raw as WindowParam;
  return null;
}

function windowToInt(w: WindowParam): number | null {
  if (w === "all") return null;
  return parseInt(w, 10);
}

// ── GET /api/daily-briefing/analysis ─────────────────────────────────────────
// Returns the most recent cached synthesis for the given window.
// Query param: ?window=30 | 90 | all (default: 30)

export async function GET(request: Request) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const window = parseWindow(url.searchParams.get("window"));
  if (!window) {
    return NextResponse.json(
      { error: "Invalid window. Use 30, 90, or all." },
      { status: 400 }
    );
  }

  const windowDays = windowToInt(window);

  const row = await db.briefingSynthesis.findFirst({
    where: { windowDays },
    orderBy: { generatedAt: "desc" },
  });

  if (!row) {
    return NextResponse.json({ synthesis: null, window });
  }

  return NextResponse.json({
    synthesis: row.report as unknown as BriefingSynthesisReport,
    window,
    generatedAt: row.generatedAt.toISOString(),
  });
}

// ── POST /api/daily-briefing/analysis ────────────────────────────────────────
// Generates (or regenerates) the synthesis for the given window.
// Body: { window: "30" | "90" | "all" }

const postSchema = z.object({
  window: z.enum(["30", "90", "all"]).default("30"),
});

export async function POST(request: Request) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;
  const { session } = guard;

  if (!isAIEnabled()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { window } = parsed.data;
  const windowDays = windowToInt(window as WindowParam);

  // Fetch briefings in the window
  const since = windowDays
    ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    : undefined;

  const briefingRows = await db.dailyBriefing.findMany({
    where: since ? { dateFor: { gte: since } } : undefined,
    orderBy: { dateFor: "desc" },
    select: { id: true, dateFor: true, report: true },
  });

  if (briefingRows.length === 0) {
    return NextResponse.json(
      { error: "No briefings found for this window. Generate at least one briefing first." },
      { status: 422 }
    );
  }

  // Fetch recent challenge feedback to give Gemini correction context
  const recentFeedback = await db.briefingFeedback.findMany({
    where: {
      feedbackType: "CHALLENGE",
      createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      section: true,
      challengeReason: true,
      userNote: true,
      createdAt: true,
    },
  });

  let report: BriefingSynthesisReport;
  try {
    report = await generateBriefingSynthesis({
      briefings: briefingRows.map((r) => ({
        dateFor: r.dateFor.toISOString().slice(0, 10),
        report: r.report as unknown as DailyBriefingReport,
      })),
      windowLabel:
        window === "all"
          ? `All time (${briefingRows.length} briefings)`
          : `Last ${window} days (${briefingRows.length} briefings)`,
      recentFeedback: recentFeedback.map((f) => ({
        section: f.section,
        challengeReason: f.challengeReason ?? undefined,
        userNote: f.userNote ?? undefined,
        date: f.createdAt.toISOString().slice(0, 10),
      })),
    });
  } catch (err) {
    console.error("[briefing-analysis] Gemini synthesis failed:", err);
    return NextResponse.json(
      { error: "AI synthesis failed. Check GEMINI_API_KEY and try again." },
      { status: 502 }
    );
  }

  const reportJson = JSON.parse(JSON.stringify(report)) as Parameters<
    typeof db.briefingSynthesis.create
  >[0]["data"]["report"];

  await db.briefingSynthesis.create({
    data: {
      windowDays,
      generatedBy: session.user.id,
      report: reportJson,
    },
  });

  return NextResponse.json({
    synthesis: report,
    window,
    generatedAt: new Date().toISOString(),
  });
}

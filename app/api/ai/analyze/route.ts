import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { enrichProjectById, enrichProjectList } from "@/lib/project-unifier-merge";
import { logApi, apiTimer } from "@/lib/api-logger";
import {
  isAIEnabled,
  analyzeProjectUnits,
  generateBriefing,
  analyzePortfolio,
  freeformPrompt,
} from "@/lib/ai/gemini";
import { isDevToolsAllowed } from "@/lib/devtools-env";
import type { AIUnitCard, AIUnitScopeRow } from "@/lib/ai/types";

// ── Auth helper (matches all other API routes) ────────────────────────────────

async function getSession() {
  const isBypass =
    process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";
  if (isBypass) return { user: { id: "dev-user", role: "ADMIN" } };
  const { auth } = await import("@/lib/auth");
  return auth();
}

// ── Rate limiting (in-memory, per project, 30s cooldown) ─────────────────────

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 30_000;

function checkRateLimit(key: string): boolean {
  const last = rateLimitMap.get(key);
  if (last && Date.now() - last < RATE_LIMIT_MS) return false;
  rateLimitMap.set(key, Date.now());
  return true;
}

// ── Request schema ────────────────────────────────────────────────────────────

const AnalyzeSchema = z.object({
  type: z.enum(["units", "briefing", "portfolio", "devtools"]),
  projectId: z.string().optional(),
  prompt: z.string().max(50_000).optional(),
});

// ── Unit grouping (mirrors UnitCards.tsx groupIntoCards) ─────────────────────

interface RawUnitRow {
  building: string;
  level: string;
  unit: string;
  unitType: string;
  description: string;
  scopeType: { name: string } | null;
  scopeStage: string | null;
  scopeStatus: string | null;
  percentComplete: number | null;
  installer: { name: string } | null;
  shipPhase: string;
  buildPhase: string;
}

function groupIntoAICards(rows: RawUnitRow[]): AIUnitCard[] {
  const map = new Map<string, AIUnitCard>();
  for (const row of rows) {
    const key = `${row.building}|${row.level}|${row.unit}`;
    if (!map.has(key)) {
      map.set(key, {
        building: row.building,
        level: row.level,
        unit: row.unit,
        unitType: row.unitType,
        scopes: [],
      });
    }
    const scope: AIUnitScopeRow = {
      description: row.description,
      scopeType: row.scopeType?.name ?? null,
      scopeStage: (row.scopeStage as AIUnitScopeRow["scopeStage"]) ?? null,
      scopeStatus: (row.scopeStatus as AIUnitScopeRow["scopeStatus"]) ?? null,
      percentComplete: row.percentComplete,
      installer: row.installer?.name ?? null,
      shipPhase: row.shipPhase,
      buildPhase: row.buildPhase,
    };
    map.get(key)!.scopes.push(scope);
  }
  return Array.from(map.values());
}

// ── POST /api/ai/analyze ──────────────────────────────────────────────────────

export async function POST(req: Request) {
  const elapsed = apiTimer();

  if (!isAIEnabled()) {
    logApi("POST", "/api/ai/analyze", 503, "AI disabled — GEMINI_API_KEY not set", elapsed(), null);
    return NextResponse.json({ error: "AI_DISABLED" }, { status: 503 });
  }

  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/ai/analyze", 401, "Unauthorized", elapsed(), null);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = AnalyzeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { type, projectId } = parsed.data;

  // Rate limit key: per user + per type + per project
  const rateLimitKey = `${session.user.id}:${type}:${projectId ?? "all"}`;
  if (!checkRateLimit(rateLimitKey)) {
    logApi("POST", "/api/ai/analyze", 429, "Rate limited", elapsed(), null);
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  try {
    // ── DevTools freeform (dev environments only) ─────────────────────────────
    if (type === "devtools") {
      if (!isDevToolsAllowed()) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!parsed.data.prompt) {
        return NextResponse.json({ error: "prompt required" }, { status: 400 });
      }
      const response = await freeformPrompt(parsed.data.prompt);
      logApi("POST", "/api/ai/analyze", 200, "DevTools freeform response", elapsed(), null);
      return NextResponse.json({ response });
    }

    // ── Portfolio analysis ────────────────────────────────────────────────────
    if (type === "portfolio") {
      const rows = await db.project.findMany({
        where: { deletedAt: null },
        include: {
          projectRows: {
            select: {
              building: true,
              level: true,
              unit: true,
              scopeStatus: true,
            },
          },
        },
      });

      const enriched = await enrichProjectList(rows);

      const portfolioData = rows
        .map((row, i) => {
          const p = enriched[i]!;
          if (p.lifecycleStatus !== "Active" && p.lifecycleStatus !== "Planning") return null;
          const unitKeys = new Set(row.projectRows.map((r) => `${r.building}|${r.level}|${r.unit}`));
          const blockedCount = row.projectRows.filter((r) => r.scopeStatus === "BLOCKED").length;
          const completedCount = row.projectRows.filter((r) => r.scopeStatus === "COMPLETE").length;
          return {
            projectName: p.projectName,
            siteLocation: p.siteLocation,
            status: p.status,
            unitCount: unitKeys.size,
            blockedCount,
            completedCount,
            totalScopes: row.projectRows.length,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);

      const portfolio = await analyzePortfolio(portfolioData);
      logApi("POST", "/api/ai/analyze", 200, `Portfolio analysis — ${portfolioData.length} projects`, elapsed(), null);
      return NextResponse.json({ portfolio });
    }

    // ── Project-scoped analysis (units or briefing) ───────────────────────────
    if (!projectId) {
      return NextResponse.json({ error: "projectId required for this type" }, { status: 400 });
    }

    const project = await enrichProjectById(projectId);

    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rawRows = await db.projectRow.findMany({
      where: { projectId },
      orderBy: { rowIndex: "asc" },
      select: {
        building: true,
        level: true,
        unit: true,
        unitType: true,
        description: true,
        scopeType: { select: { name: true } },
        scopeStage: true,
        scopeStatus: true,
        percentComplete: true,
        installer: { select: { name: true } },
        shipPhase: true,
        buildPhase: true,
      },
    });

    if (rawRows.length === 0) {
      return NextResponse.json({ error: "No unit data found for this project" }, { status: 422 });
    }

    const units = groupIntoAICards(
      rawRows.map((r) => ({
        ...r,
        percentComplete: r.percentComplete != null ? Number(r.percentComplete) : null,
        scopeStage: r.scopeStage ?? null,
        scopeStatus: r.scopeStatus ?? null,
      }))
    );

    const projectSummary = {
      projectName: project.projectName,
      siteLocation: project.siteLocation,
      status: project.status,
      installManagerName: project.installManagerName,
      projectManagerName: project.projectManagerName,
    } as const;

    if (type === "briefing") {
      const briefing = await generateBriefing(units, projectSummary);
      logApi("POST", "/api/ai/analyze", 200, `Briefing generated — ${units.length} units`, elapsed(), null);
      return NextResponse.json({ briefing });
    }

    // type === "units"
    const insights = await analyzeProjectUnits(units, projectSummary);
    logApi("POST", "/api/ai/analyze", 200, `Units analyzed — ${units.length} units`, elapsed(), null);
    return NextResponse.json({ insights });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Detect Gemini quota exhaustion (429) and surface as a distinct error code
    if (message.includes("429") || message.toLowerCase().includes("quota")) {
      logApi("POST", "/api/ai/analyze", 429, "Gemini quota exceeded", elapsed(), null);
      return NextResponse.json({ error: "QUOTA_EXCEEDED" }, { status: 429 });
    }
    logApi("POST", "/api/ai/analyze", 500, `AI error: ${message}`, elapsed(), null);
    return NextResponse.json({ error: "AI_ERROR", detail: message }, { status: 500 });
  }
}

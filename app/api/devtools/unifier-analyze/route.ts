/**
 * POST /api/devtools/unifier-analyze
 *
 * Dev-only route that sends a Unifier table's schema + sample rows to Gemini
 * and returns a structured integration analysis (UnifierTableAnalysis).
 *
 * Hard-blocked in production unless DEVTOOLS_ENABLED=true + ADMIN session.
 */

import { NextRequest, NextResponse } from "next/server";
import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";
import { analyzeUnifierTable, isAIEnabled } from "@/lib/ai/gemini";
import type { ApiError } from "@/types";
import type { UnifierTableInput } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isDevToolsAllowed()) {
    return NextResponse.json<ApiError>(
      { error: DEVTOOLS_BLOCKED_MESSAGE },
      { status: 403 }
    );
  }

  if (process.env.NODE_ENV === "production") {
    const authError = await requireDevToolsAdmin();
    if (authError) return authError;
  }

  if (!isAIEnabled()) {
    return NextResponse.json<ApiError>(
      { error: "AI analysis requires GEMINI_API_KEY to be set." },
      { status: 503 }
    );
  }

  let body: { tableDef?: UnifierTableInput; sampleRows?: Record<string, unknown>[] };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json<ApiError>({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { tableDef, sampleRows } = body;

  if (!tableDef?.tableName || !tableDef?.columns) {
    return NextResponse.json<ApiError>(
      { error: "Missing required body fields: tableDef.tableName, tableDef.columns" },
      { status: 400 }
    );
  }

  try {
    const analysis = await analyzeUnifierTable(tableDef, sampleRows ?? []);
    return NextResponse.json(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json<ApiError>({ error: message }, { status: 500 });
  }
}

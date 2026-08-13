/**
 * GET /api/devtools/unifier-explore
 *
 * Dev-only route that queries any allowlisted Unifier PDS table and returns
 * a sample of rows. Powers the DevTools Unifier Explorer panel.
 *
 * Query params:
 *   table      (required) — Unifier table name, must be in the allowlist
 *   limit      (optional) — max rows to return, default 50, max 200
 *   projectId  (optional) — filter rows by PROJECT_ID (client-side filtering
 *                           since PDS has no server-side filter support)
 *
 * Hard-blocked in production.
 */

import { NextRequest, NextResponse } from "next/server";
import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";
import { fetchAllRows } from "@/lib/unifier/client";
import {
  getTableDef,
  ALLOWLISTED_TABLE_NAMES,
} from "@/lib/unifier/schema-definition";
import type { ApiError } from "@/types";

function isMockMode(): boolean {
  if (process.env.UNIFIER_MOCK !== "true") return false;
  if (process.env.NODE_ENV !== "production") return true;
  const devLike = ["dev", "development", "staging"];
  const check = (v: string | undefined) => v && devLike.includes(v.toLowerCase());
  return check(process.env.APP_ENV) === true || check(process.env.RAILWAY_ENVIRONMENT_NAME) === true;
}

export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(req: NextRequest) {
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

  const { searchParams } = req.nextUrl;
  const tableName = searchParams.get("table");
  const limitParam = searchParams.get("limit");
  const projectId = searchParams.get("projectId") ?? null;

  if (!tableName) {
    return NextResponse.json<ApiError>(
      { error: "Missing required query param: table" },
      { status: 400 }
    );
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );

  const tableDef = getTableDef(tableName);
  // For documented tables we request only the known columns.
  // For undocumented-but-discovered tables we pass [] and let the Unifier
  // API decide what to return (typically all columns).
  const columns = tableDef?.columns.map((c) => c.code) ?? [];

  // When mock mode is active, return an empty result rather than hitting
  // the real Unifier API (which would trip the circuit breaker with a 401).
  if (isMockMode()) {
    return NextResponse.json({
      tableName,
      columns,
      rows: [],
      total: 0,
      returned: 0,
      limit,
      projectIdFilter: projectId,
      mockMode: true,
    });
  }

  try {
    // Fetch only as many rows as needed to satisfy the limit after filtering.
    // When projectId is set we can't know the exact hit-rate, so we fetch
    // up to 10× the limit as a reasonable cap; without filtering the limit
    // itself is sufficient.
    const fetchCap = projectId ? Math.min(limit * 10, MAX_LIMIT * 10) : limit;
    const allRows = await fetchAllRows<Record<string, unknown>>(
      tableName,
      columns,
      null,
      fetchCap
    );

    // Client-side filtering by PROJECT_ID when requested
    const filtered = projectId
      ? allRows.filter((r) => {
          const pid = r["PROJECT_ID"] ?? r["PROJECTID"] ?? r["PID"];
          return pid != null && String(pid) === projectId;
        })
      : allRows;

    const rows = filtered.slice(0, limit);

    return NextResponse.json({
      tableName,
      columns,
      rows,
      total: filtered.length,
      returned: rows.length,
      limit,
      projectIdFilter: projectId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json<ApiError>(
      { error: message },
      { status: 502 }
    );
  }
}

/**
 * GET /api/devtools/unifier-metadata
 *
 * Fetches PDS metadata to discover available tables and columns.
 * Query params:
 *   - tables: (optional) if present, returns list of all tables
 *   - columns=<tableName>: (optional) returns columns for the specified table
 *
 * Example: /api/devtools/unifier-metadata?tables=1
 * Example: /api/devtools/unifier-metadata?columns=UNIFIER_US_XPRJ
 *
 * Hard-blocked in production.
 */

import { NextResponse } from "next/server";
import { getKeyVaultSecret } from "@/lib/azure-keyvault";
import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";

export const dynamic = "force-dynamic";

async function getAuthHeader(): Promise<string | null> {
  const username = process.env.UNIFIER_USERNAME ?? "Coadmin";
  let password: string | null | undefined;
  try {
    password = await getKeyVaultSecret("unifier-password");
  } catch {
    password = process.env.UNIFIER_PASSWORD;
  }
  if (!password || password.includes("REPLACE")) return null;
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export async function GET(request: Request) {
  if (!isDevToolsAllowed()) {
    return NextResponse.json(
      { error: DEVTOOLS_BLOCKED_MESSAGE },
      { status: 403 }
    );
  }

  const authError = await requireDevToolsAdmin();
  if (authError) return authError;

  const baseUrl = process.env.UNIFIER_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    return NextResponse.json({ error: "UNIFIER_BASE_URL is not set" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const fetchTables = searchParams.has("tables");
  const tableName = searchParams.get("columns");

  const authHeader = await getAuthHeader();
  if (!authHeader) {
    return NextResponse.json({ error: "Unifier credentials not configured" }, { status: 500 });
  }

  const result: Record<string, unknown> = {};

  if (fetchTables) {
    const url = `${baseUrl}/pds/rest-service/dataservice/metadata/tables?configCode=ds_unifier`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: authHeader, Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        result.tablesError = { status: res.status, body: await res.text().then((t) => t.slice(0, 500)) };
      } else {
        const data = await res.json();
        result.tables = Array.isArray(data) ? data : data;
        if (Array.isArray(result.tables)) {
          result.tableCount = (result.tables as unknown[]).length;
          result.tableNames = (result.tables as { physicalTableName?: string; displayTableName?: string }[])
            .map((t) => t.physicalTableName ?? t.displayTableName)
            .filter(Boolean)
            .sort();
        }
      }
    } catch (err) {
      result.tablesError = err instanceof Error ? err.message : String(err);
    }
  }

  if (tableName) {
    const url = `${baseUrl}/pds/rest-service/dataservice/metadata/columns/${encodeURIComponent(tableName)}?configCode=ds_unifier`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: authHeader, Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        result.columnsError = { status: res.status, body: await res.text().then((t) => t.slice(0, 500)) };
      } else {
        const data = await res.json();
        result.columns = Array.isArray(data) ? data : data;
      }
    } catch (err) {
      result.columnsError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!fetchTables && !tableName) {
    return NextResponse.json({
      usage: "Add ?tables=1 to list all tables, or ?columns=TABLE_NAME to get columns for a table",
      exampleTables: "?tables=1",
      exampleColumns: "?columns=UNIFIER_US_XPRJ",
    });
  }

  return NextResponse.json(result);
}

/**
 * GET /api/devtools/unifier-schema
 *
 * Returns all known Unifier PDS tables merged with live table discovery from
 * the Unifier metadata API. Tables in our static schema definition get full
 * column metadata; tables only discovered live are returned as stubs so the
 * Explorer can display and query them even before we've documented their columns.
 *
 * No blocking on discovery failure — if the live call times out or errors,
 * we fall back to the static list only.
 *
 * Hard-blocked in production.
 */

import { NextResponse } from "next/server";
import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";
import { UNIFIER_SCHEMA, ALLOWLISTED_TABLE_NAMES, type UnifierTableDef } from "@/lib/unifier/schema-definition";
import { getConfig } from "@/lib/unifier/client";

export const dynamic = "force-dynamic";

/** Attempt to fetch all table names from the live Unifier metadata API. */
async function discoverLiveTables(): Promise<string[]> {
  try {
    const { baseUrl, authHeader } = await getConfig();
    const url = `${baseUrl}/pds/rest-service/dataservice/metadata/tables?configCode=ds_unifier`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) return [];
    const data = await res.json() as unknown;
    if (!Array.isArray(data)) return [];
    return (data as { physicalTableName?: string; displayTableName?: string }[])
      .map((t) => t.physicalTableName ?? t.displayTableName ?? "")
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function GET() {
  if (!isDevToolsAllowed()) {
    return NextResponse.json(
      { error: DEVTOOLS_BLOCKED_MESSAGE },
      { status: 403 }
    );
  }

  if (process.env.NODE_ENV === "production") {
    const authError = await requireDevToolsAdmin();
    if (authError) return authError;
  }

  // Discover all tables the live API exposes — non-blocking, falls back to []
  const liveTableNames = await discoverLiveTables();

  // Build stubs for any live table not already in our static schema
  const undocumentedStubs: (UnifierTableDef & { discovered: true })[] = liveTableNames
    .filter((name) => !ALLOWLISTED_TABLE_NAMES.has(name))
    .map((name) => ({
      tableName: name,
      displayName: name,
      description: "Discovered from Unifier API — columns not yet documented.",
      columns: [],
      discovered: true,
    }));

  const tables = [
    ...UNIFIER_SCHEMA,
    ...undocumentedStubs,
  ];

  return NextResponse.json({
    tables,
    count: tables.length,
    documentedCount: UNIFIER_SCHEMA.length,
    discoveredCount: undocumentedStubs.length,
  });
}

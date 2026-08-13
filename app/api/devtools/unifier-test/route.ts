/**
 * GET /api/devtools/unifier-test
 *
 * Dev-only route that tests the Unifier PDS API connection and returns a
 * full diagnostic report — what URL was called, what status came back,
 * and the raw response body (so you can see Unifier's actual error message).
 *
 * Hard-blocked in production.
 */

import { NextResponse } from "next/server";
import { getKeyVaultSecret } from "@/lib/azure-keyvault";
import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!isDevToolsAllowed()) {
      return NextResponse.json(
        { error: DEVTOOLS_BLOCKED_MESSAGE },
        { status: 403 }
      );
    }

    // Skip auth for local dev so curl works; auth required in deployed dev
    if (process.env.NODE_ENV === "production") {
      const authError = await requireDevToolsAdmin();
      if (authError) return authError;
    }

  const baseUrl = process.env.UNIFIER_BASE_URL;
  const username = process.env.UNIFIER_USERNAME ?? "Coadmin";
  const mockMode = process.env.UNIFIER_MOCK === "true";

  if (!baseUrl) {
    return NextResponse.json({ ok: false, error: "UNIFIER_BASE_URL is not set" });
  }

  // When mock is enabled, skip API test — mock data is used, no credentials needed
  if (mockMode) {
    return NextResponse.json({
      ok: true,
      mockMode: true,
      config: { baseUrl, username, passwordSource: "mock (not used)", passwordMasked: "(n/a)", fullUrl: "" },
      result: { httpStatus: null, errorMessage: "Mock mode — API not tested", responseBody: "" },
    });
  }

  // Resolve password (Key Vault → env var)
  let password: string | null | undefined;
  let passwordSource = "not found";
  try {
    password = await getKeyVaultSecret("unifier-password");
    if (password) passwordSource = "Azure Key Vault";
  } catch (kvErr) {
    passwordSource = `Key Vault error: ${kvErr instanceof Error ? kvErr.message : String(kvErr)}`;
  }
  if (!password) {
    password = process.env.UNIFIER_PASSWORD;
    if (password) passwordSource = "UNIFIER_PASSWORD env var";
  }

  const hasPassword = !!password && !password.includes("REPLACE");
  const passwordMasked = password
    ? `${password.slice(0, 2)}${"*".repeat(Math.max(0, password.length - 4))}${password.slice(-2)}`
    : "(not set)";

  const url = `${baseUrl.replace(/\/$/, "")}/pds/rest-service/dataservice/runquery?configCode=ds_unifier`;

  // Minimal test query — just fetch the first row of UNIFIER_US_XPRJ
  const testBody = {
    name: "Connection Test",
    pageSize: "1",
    mode: "SYNC",
    tables: [{ tableName: "UNIFIER_US_XPRJ", columns: ["PID"], orderByColumns: null }],
  };

  let httpStatus: number | null = null;
  let responseBody = "";
  let connectOk = false;
  let errorMessage = "";

  if (!hasPassword) {
    errorMessage = "No valid password configured. Check UNIFIER_PASSWORD in .env.";
  } else {
    const credentials = Buffer.from(`${username}:${password}`).toString("base64");
    const authHeader = `Basic ${credentials}`;

    try {
      const t0 = Date.now();
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: authHeader, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(testBody),
        cache: "no-store",
      });
      const elapsed = Date.now() - t0;
      httpStatus = res.status;
      responseBody = (await res.text()).slice(0, 1000); // first 1 000 chars of body
      connectOk = res.ok;
      if (!res.ok) {
        errorMessage = `HTTP ${res.status} ${res.statusText}. See responseBody for Unifier's message.`;
      } else {
        errorMessage = `Connected in ${elapsed}ms`;
      }
    } catch (fetchErr) {
      errorMessage = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    }
  }

  return NextResponse.json({
    ok: connectOk,
    mockMode,
    config: {
      baseUrl,
      username,
      passwordSource,
      passwordMasked,
      fullUrl: url,
    },
    result: {
      httpStatus,
      errorMessage,
      responseBody,
    },
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json(
      { error: "Internal Server Error", detail: message, stack: process.env.NODE_ENV === "development" ? stack : undefined },
      { status: 500 }
    );
  }
}

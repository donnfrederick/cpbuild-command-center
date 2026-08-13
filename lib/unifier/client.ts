/**
 * Oracle Primavera Unifier PDS (Project Data Store) API client.
 *
 * Mirrors the Python implementation provided by the BI team:
 *   - Basic Auth (base64-encoded username:password)
 *   - POST requests with JSON body
 *   - Pagination loop: continues fetching until nextTableName === "-1"
 *
 * Credentials are resolved in priority order:
 *   1. Azure Key Vault  (when AZURE_KEYVAULT_URL is set)   ← production
 *   2. UNIFIER_PASSWORD env var                             ← local dev fallback
 *
 * Key Vault secret name: "unifier-password"  (matches BI team's Python reference)
 * Key Vault endpoint:    https://CPBBI-vault1.vault.azure.net/
 */

import { getKeyVaultSecret } from "@/lib/azure-keyvault";
import { isUnifierMockAllowed } from "./mock-mode";
import type {
  PdsQueryBody,
  PdsResponse,
  PdsResponseData,
} from "./types";

// ─── Circuit breaker ──────────────────────────────────────────────────────────
//
// Opens on the first 401/403 from Unifier and suspends all calls for
// UNIFIER_AUTH_SUSPEND_MINUTES (default: 5 min) to prevent hammering the API
// after a credential failure.
//
// Reset via POST /api/devtools/unifier-reset (dev only) or wait for the window.

/** Custom error thrown on Unifier 401/403 — distinct from generic network errors. */
export class UnifierAuthError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, detail?: string) {
    super(
      `Unifier authentication failed (${statusCode})${detail ? ` — ${detail}` : ""}. ` +
      `Circuit breaker is now open. POST /api/devtools/unifier-reset to reset.`
    );
    this.name = "UnifierAuthError";
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, UnifierAuthError.prototype);
  }
}

interface CircuitBreakerState {
  failureCount: number;
  isSuspended: boolean;
  resumesAt: string | null;
  suspendedAt: string | null;
}

let cbFailureCount = 0;
let cbSuspendedUntil: Date | null = null;

function getSuspensionMs(): number {
  const minutes = Number(process.env.UNIFIER_AUTH_SUSPEND_MINUTES ?? "5");
  return (isNaN(minutes) ? 5 : minutes) * 60 * 1000;
}

export function getCircuitBreakerState(): CircuitBreakerState {
  const now = new Date();
  const isSuspended = cbSuspendedUntil !== null && cbSuspendedUntil > now;
  return {
    failureCount: cbFailureCount,
    isSuspended,
    resumesAt: isSuspended ? cbSuspendedUntil!.toISOString() : null,
    suspendedAt: cbSuspendedUntil !== null ? cbSuspendedUntil.toISOString() : null,
  };
}

export function resetCircuitBreaker(): void {
  cbFailureCount = 0;
  cbSuspendedUntil = null;
  resetConfigCache();
}

function openCircuitBreaker(statusCode: number, detail?: string): never {
  cbFailureCount += 1;
  cbSuspendedUntil = new Date(Date.now() + getSuspensionMs());
  console.warn(
    `[unifier] Circuit breaker OPEN (${statusCode}) — suspended until ${cbSuspendedUntil.toISOString()}`
  );
  throw new UnifierAuthError(statusCode, detail);
}

function checkCircuitBreaker(): void {
  if (cbSuspendedUntil === null) return;
  const now = new Date();
  if (cbSuspendedUntil > now) {
    // Still suspended — throw a UnifierAuthError to preserve the type contract
    throw new UnifierAuthError(
      401,
      `calls suspended until ${cbSuspendedUntil.toISOString()}. Use POST /api/devtools/unifier-reset to reset.`
    );
  }
  // Auto-reset after suspension window expires
  cbSuspendedUntil = null;
  cbFailureCount = 0;
}

// ─── Config ───────────────────────────────────────────────────────────────────

// Cached after first successful resolution so Key Vault is only called once.
// Call resetConfigCache() to force re-resolution (e.g. after .env change in dev).
let configCache: { baseUrl: string; authHeader: string } | null = null;

export function resetConfigCache(): void {
  configCache = null;
}

/** Exported so other server-side routes can reuse the resolved credentials. */
export async function getConfig(): Promise<{ baseUrl: string; authHeader: string }> {
  if (configCache) return configCache;

  const baseUrl = process.env.UNIFIER_BASE_URL;
  const username = process.env.UNIFIER_USERNAME ?? "Coadmin";

  if (!baseUrl) {
    throw new Error(
      "Missing UNIFIER_BASE_URL. Set it in your environment or .env file."
    );
  }

  // Try Key Vault first; fall back to UNIFIER_PASSWORD env var.
  const password =
    (await getKeyVaultSecret("unifier-password")) ??
    process.env.UNIFIER_PASSWORD;

  if (!password) {
    throw new Error(
      "Missing Unifier password. Set AZURE_KEYVAULT_URL (for Key Vault) or UNIFIER_PASSWORD (local fallback)."
    );
  }

  const credentials = Buffer.from(`${username}:${password}`).toString("base64");
  configCache = {
    baseUrl: baseUrl.replace(/\/$/, ""),
    authHeader: `Basic ${credentials}`,
  };
  return configCache;
}

const QUERY_ENDPOINT_PATH =
  "/pds/rest-service/dataservice/runquery?configCode=ds_unifier";

// ─── Low-level request ────────────────────────────────────────────────────────

async function postQuery(
  authHeader: string,
  url: string,
  body: PdsQueryBody
): Promise<PdsResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    // Disable Next.js fetch caching — we manage our own TTL cache in service.ts
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = "";
    try {
      const text = await response.text();
      if (text) detail = text.slice(0, 300);
    } catch { /* ignore */ }
    // Auth failures open the circuit breaker (throws UnifierAuthError)
    if (response.status === 401 || response.status === 403) {
      openCircuitBreaker(response.status, detail);
    }
    throw new Error(
      `Unifier PDS API error: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`
    );
  }

  return response.json() as Promise<PdsResponse>;
}

// ─── Paginated table fetch ────────────────────────────────────────────────────

/**
 * Fetch rows from a single Unifier PDS table, handling pagination automatically.
 * Returns a flat array of raw row objects.
 *
 * The pagination logic matches the BI team's Python implementation:
 *   - If `data.pagination[0].nextTableName === "-1"`, no more pages.
 *   - Otherwise, include `nextTableName` and `nextKey` in the next request body.
 *
 * @param maxRows - Stop pagination early once this many rows have been collected.
 *   Useful to avoid full-table scans when only a bounded preview is needed.
 *   Defaults to `Infinity` (fetch all rows, original behaviour).
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  tableName: string,
  columns: string[],
  orderByColumns?: string[] | null,
  maxRows: number = Infinity
): Promise<T[]> {
  if (isUnifierMockAllowed()) {
    return [];
  }
  checkCircuitBreaker();
  const { baseUrl, authHeader } = await getConfig();
  const url = `${baseUrl}${QUERY_ENDPOINT_PATH}`;

  const rows: T[] = [];
  let morePages = true;
  let nextKey: string | undefined;
  let nextTableNameParam: string | undefined;

  while (morePages && rows.length < maxRows) {
    const body: PdsQueryBody = {
      name: "Query Data",
      pageSize: "10000",
      mode: "SYNC",
      tables: [
        {
          tableName,
          columns,
          orderByColumns: orderByColumns ?? null,
        },
      ],
      ...(nextTableNameParam !== undefined && { nextTableName: nextTableNameParam }),
      ...(nextKey !== undefined && { nextKey }),
    };

    const result = await postQuery(authHeader, url, body);
    const data: PdsResponseData = result.data;

    const pageRows = data[tableName] as T[] | undefined;
    if (Array.isArray(pageRows)) {
      rows.push(...pageRows);
    }

    const pagination = data.pagination?.[0];
    if (!pagination || pagination.nextTableName === "-1") {
      morePages = false;
    } else {
      nextTableNameParam = pagination.nextTableName;
      nextKey = pagination.nextKey;
    }
  }

  // Successful fetch — reset failure counter
  cbFailureCount = 0;

  return rows;
}

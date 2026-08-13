/**
 * Unit tests for the Unifier auth circuit breaker.
 *
 * vi.mock() is hoisted before static imports by Vitest, so the azure-keyvault
 * mock is in place when client.ts is loaded. We use static imports (not dynamic
 * import()) so Vitest's mock registry is applied deterministically.
 *
 * All tests share the same module instance (shared `breaker` object).
 * resetCircuitBreaker() in beforeEach resets that shared state between tests.
 *
 * Covers:
 *  - UnifierAuthError is thrown (and distinct from generic errors)
 *  - Circuit breaker opens after the first 401
 *  - Suspended requests fail fast (no fetch call)
 *  - resetCircuitBreaker() clears the suspension
 *  - Successful fetch resets failure counter
 *  - UNIFIER_AUTH_SUSPEND_MINUTES env var is respected
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchAllRows,
  resetCircuitBreaker,
  getCircuitBreakerState,
  UnifierAuthError,
  resetConfigCache,
} from "@/lib/unifier/client";

// Hoisted before the static imports above — azure-keyvault is mocked when
// client.ts is loaded, so getKeyVaultSecret never calls the real Azure SDK.
vi.mock("@/lib/azure-keyvault", () => ({
  getKeyVaultSecret: vi.fn().mockResolvedValue(null),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOkResponse(rows: unknown[] = []) {
  return new Response(
    JSON.stringify({
      data: {
        TEST_TABLE: rows,
        pagination: [{ nextTableName: "-1", nextKey: "" }],
      },
      message: [],
      status: 0,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function makeAuthErrorResponse(status: 401 | 403) {
  return new Response("Unauthorized", { status, statusText: "Unauthorized" });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Unifier auth circuit breaker", () => {
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    resetCircuitBreaker();
    resetConfigCache();
    process.env.UNIFIER_BASE_URL = "https://unifier.test";
    process.env.UNIFIER_USERNAME = "Coadmin";
    process.env.UNIFIER_PASSWORD = "test-password";
    process.env.AZURE_KEYVAULT_URL = "";
    delete process.env.UNIFIER_AUTH_SUSPEND_MINUTES;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
    vi.unstubAllGlobals();
  });

  it("throws UnifierAuthError (not generic Error) on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeAuthErrorResponse(401)));
    await expect(fetchAllRows("TEST_TABLE", ["ID"])).rejects.toThrow(UnifierAuthError);
  });

  it("throws UnifierAuthError on 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeAuthErrorResponse(403)));
    await expect(fetchAllRows("TEST_TABLE", ["ID"])).rejects.toThrow(UnifierAuthError);
  });

  it("suspends subsequent calls after first 401 without calling fetch again", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeAuthErrorResponse(401));
    vi.stubGlobal("fetch", mockFetch);

    // First call triggers 401 and opens the breaker
    await expect(fetchAllRows("TEST_TABLE", ["ID"])).rejects.toThrow(UnifierAuthError);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call should fail immediately (circuit breaker open) — no new fetch
    await expect(fetchAllRows("TEST_TABLE", ["ID"])).rejects.toThrow(UnifierAuthError);
    expect(mockFetch).toHaveBeenCalledTimes(1); // still only 1
  });

  it("getCircuitBreakerState reflects isSuspended=true after auth failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeAuthErrorResponse(401)));

    await expect(fetchAllRows("TEST_TABLE", ["ID"])).rejects.toThrow(UnifierAuthError);

    const state = getCircuitBreakerState();
    expect(state.isSuspended).toBe(true);
    expect(state.failureCount).toBe(1);
    expect(state.resumesAt).not.toBeNull();
  });

  it("resetCircuitBreaker clears suspension so next call can proceed", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(makeAuthErrorResponse(401))
      .mockResolvedValueOnce(makeOkResponse([{ ID: "1" }]));
    vi.stubGlobal("fetch", mockFetch);

    // Open the breaker
    await expect(fetchAllRows("TEST_TABLE", ["ID"])).rejects.toThrow(UnifierAuthError);
    expect(getCircuitBreakerState().isSuspended).toBe(true);

    // Reset it
    resetCircuitBreaker();
    expect(getCircuitBreakerState().isSuspended).toBe(false);
    expect(getCircuitBreakerState().failureCount).toBe(0);

    // Next call should succeed
    const rows = await fetchAllRows("TEST_TABLE", ["ID"]);
    expect(rows).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("successful fetch resets the failure counter", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeOkResponse([{ ID: "A" }])));

    await fetchAllRows("TEST_TABLE", ["ID"]);

    const state = getCircuitBreakerState();
    expect(state.failureCount).toBe(0);
    expect(state.isSuspended).toBe(false);
  });

  it("respects UNIFIER_AUTH_SUSPEND_MINUTES env var for suspension duration", async () => {
    process.env.UNIFIER_AUTH_SUSPEND_MINUTES = "30";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeAuthErrorResponse(401)));

    await expect(fetchAllRows("TEST_TABLE", ["ID"])).rejects.toThrow(UnifierAuthError);

    const state = getCircuitBreakerState();
    expect(state.isSuspended).toBe(true);
    // resumesAt should be ~30 min from now (within a 5s tolerance)
    const resumeMs = new Date(state.resumesAt!).getTime();
    const expectedMs = Date.now() + 30 * 60 * 1000;
    expect(Math.abs(resumeMs - expectedMs)).toBeLessThan(5000);
  });

  it("UnifierAuthError has the right name and statusCode property", () => {
    const err = new UnifierAuthError(401, "test detail");
    expect(err.name).toBe("UnifierAuthError");
    expect(err.statusCode).toBe(401);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof UnifierAuthError).toBe(true);
  });
});

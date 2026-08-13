import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the Unifier PDS client pagination logic.
 * We mock global.fetch to avoid real network calls.
 */

// Set up env vars before importing the module
vi.stubEnv("UNIFIER_BASE_URL", "https://us2.unifier.oraclecloud.com/cpbuild");
vi.stubEnv("UNIFIER_USERNAME", "testuser");
vi.stubEnv("UNIFIER_PASSWORD", "testpass");

const { fetchAllRows, resetCircuitBreaker, UnifierAuthError } = await import("@/lib/unifier/client");

function makePage(
  tableName: string,
  rows: Record<string, string>[],
  nextTableName: string,
  nextKey: string
) {
  return {
    data: {
      [tableName]: rows,
      pagination: [{ nextTableName, nextKey }],
    },
    message: [],
    status: 200,
  };
}

describe("fetchAllRows()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset circuit breaker state so tests don't bleed into each other
    resetCircuitBreaker();
  });

  it("returns all rows from a single page response", async () => {
    const rows = [{ PID: "1", UE_PRJ_PROJNAMESSN: "Project A" }];
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => makePage("UNIFIER_US_XPRJ", rows, "-1", ""),
    } as Response);

    const result = await fetchAllRows("UNIFIER_US_XPRJ", ["PID", "UE_PRJ_PROJNAMESSN"]);
    expect(result).toEqual(rows);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("follows pagination across multiple pages", async () => {
    const page1Rows = [{ PID: "1" }];
    const page2Rows = [{ PID: "2" }];

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makePage("UNIFIER_US_XPRJ", page1Rows, "UNIFIER_US_XPRJ", "KEY_001"),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makePage("UNIFIER_US_XPRJ", page2Rows, "-1", ""),
      } as Response);

    const result = await fetchAllRows("UNIFIER_US_XPRJ", ["PID"]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ PID: "1" });
    expect(result[1]).toEqual({ PID: "2" });
    expect(fetch).toHaveBeenCalledTimes(2);

    // Second call must include nextTableName and nextKey
    const secondCallBody = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body as string
    ) as { nextTableName: string; nextKey: string };
    expect(secondCallBody.nextTableName).toBe("UNIFIER_US_XPRJ");
    expect(secondCallBody.nextKey).toBe("KEY_001");
  });

  it("returns empty array when table has no rows", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => makePage("UNIFIER_US_XPRJ", [], "-1", ""),
    } as Response);

    const result = await fetchAllRows("UNIFIER_US_XPRJ", ["PID"]);
    expect(result).toEqual([]);
  });

  it("throws UnifierAuthError when the API returns 401", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "",
    } as Response);

    await expect(fetchAllRows("UNIFIER_US_XPRJ", ["PID"])).rejects.toThrow(UnifierAuthError);
  });

  it("throws generic Error when the API returns a non-auth error (e.g. 500)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "server error",
    } as Response);

    await expect(fetchAllRows("UNIFIER_US_XPRJ", ["PID"])).rejects.toThrow(
      "Unifier PDS API error: 500"
    );
  });

  it("sends Basic Auth header with base64-encoded credentials", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => makePage("UNIFIER_US_XPRJ", [], "-1", ""),
    } as Response);

    await fetchAllRows("UNIFIER_US_XPRJ", ["PID"]);

    const headers = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
      .headers as Record<string, string>;
    const expected = `Basic ${Buffer.from("testuser:testpass").toString("base64")}`;
    expect(headers["Authorization"]).toBe(expected);
  });
});

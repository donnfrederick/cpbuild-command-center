import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetConfigCache, fetchAllRows, resetCircuitBreaker, UnifierAuthError } from "@/lib/unifier/client";

vi.mock("@/lib/azure-keyvault", () => ({
  getKeyVaultSecret: vi.fn(),
}));

const { getKeyVaultSecret } = await import("@/lib/azure-keyvault");

const originalEnv = process.env;

describe("resetConfigCache", () => {
  it("clears config cache", () => {
    expect(() => resetConfigCache()).not.toThrow();
  });
});

describe("getConfig / fetchAllRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetConfigCache();
    resetCircuitBreaker();
    process.env = { ...originalEnv };
    process.env.UNIFIER_BASE_URL = "https://unifier.example.com";
    process.env.UNIFIER_USERNAME = "testuser";
    process.env.UNIFIER_PASSWORD = "testpass";
    delete process.env.AZURE_KEYVAULT_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty rows without calling Unifier when UNIFIER_MOCK=true", async () => {
    process.env.UNIFIER_MOCK = "true";
    process.env.NODE_ENV = "development";
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const rows = await fetchAllRows("UNIFIER_UXSUB", ["ID"]);

    expect(rows).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("throws when UNIFIER_BASE_URL is missing", async () => {
    delete process.env.UNIFIER_BASE_URL;
    process.env.UNIFIER_PASSWORD = "p";
    resetConfigCache();
    vi.resetModules();

    const { fetchAllRows: fetchFn } = await import("@/lib/unifier/client");

    await expect(
      fetchFn("SOME_TABLE", ["COL1"])
    ).rejects.toThrow("Missing UNIFIER_BASE_URL");
  });

  it("throws when password is missing (no Key Vault, no env)", async () => {
    vi.mocked(getKeyVaultSecret).mockResolvedValue(null);
    delete process.env.UNIFIER_PASSWORD;
    resetConfigCache();
    vi.resetModules();

    const { fetchAllRows: fetchFn } = await import("@/lib/unifier/client");

    await expect(
      fetchFn("SOME_TABLE", ["COL1"])
    ).rejects.toThrow("Missing Unifier password");
  });

  it("uses UNIFIER_PASSWORD when Key Vault returns null", async () => {
    vi.mocked(getKeyVaultSecret).mockResolvedValue(null);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            SOME_TABLE: [{ id: "1" }],
            pagination: [{ nextTableName: "-1", nextKey: "" }],
          },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const rows = await fetchAllRows("SOME_TABLE", ["COL1"]);

    expect(rows).toEqual([{ id: "1" }]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      })
    );

    vi.unstubAllGlobals();
  });

  it("uses Key Vault password when available", async () => {
    vi.mocked(getKeyVaultSecret).mockResolvedValue("vault-secret");
    process.env.AZURE_KEYVAULT_URL = "https://vault.azure.net";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            TBL: [{ x: 1 }],
            pagination: [{ nextTableName: "-1", nextKey: "" }],
          },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const rows = await fetchAllRows("TBL", ["X"]);

    expect(rows).toEqual([{ x: 1 }]);
    expect(getKeyVaultSecret).toHaveBeenCalledWith("unifier-password");

    vi.unstubAllGlobals();
  });

  it("handles pagination - fetches multiple pages", async () => {
    vi.mocked(getKeyVaultSecret).mockResolvedValue(null);
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                PAGED: [{ page: 1 }],
                pagination: [
                  { nextTableName: "PAGED", nextKey: "key2" },
                ],
              },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              PAGED: [{ page: 2 }],
              pagination: [{ nextTableName: "-1", nextKey: "" }],
            },
          }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const rows = await fetchAllRows("PAGED", ["COL"]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ page: 1 });
    expect(rows[1]).toEqual({ page: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it("handles empty table array in response", async () => {
    vi.mocked(getKeyVaultSecret).mockResolvedValue(null);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            EMPTY_TABLE: undefined,
            pagination: [{ nextTableName: "-1", nextKey: "" }],
          },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const rows = await fetchAllRows("EMPTY_TABLE", ["COL"]);

    expect(rows).toEqual([]);

    vi.unstubAllGlobals();
  });

  it("throws UnifierAuthError on 401 and throws generic error on 500", async () => {
    vi.mocked(getKeyVaultSecret).mockResolvedValue(null);
    const mockFetch401 = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve("Invalid credentials"),
    });
    vi.stubGlobal("fetch", mockFetch401);

    await expect(fetchAllRows("TBL", ["COL"])).rejects.toThrow(UnifierAuthError);
    vi.unstubAllGlobals();

    // Reset so the next assertion isn't blocked by the circuit breaker
    resetCircuitBreaker();

    const mockFetch500 = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: () => Promise.resolve("oops"),
    });
    vi.stubGlobal("fetch", mockFetch500);

    await expect(fetchAllRows("TBL", ["COL"])).rejects.toThrow(/Unifier PDS API error: 500/);
    vi.unstubAllGlobals();
  });

  it("handles API error when response.text() throws (still surfaces status code)", async () => {
    vi.mocked(getKeyVaultSecret).mockResolvedValue(null);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: () => Promise.reject(new Error("body read failed")),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      fetchAllRows("TBL", ["COL"])
    ).rejects.toThrow(/Unifier PDS API error: 500/);

    vi.unstubAllGlobals();
  });

  it("strips trailing slash from baseUrl", async () => {
    process.env.UNIFIER_BASE_URL = "https://unifier.example.com/";
    vi.mocked(getKeyVaultSecret).mockResolvedValue(null);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            T: [],
            pagination: [{ nextTableName: "-1", nextKey: "" }],
          },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchAllRows("T", ["C"]);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.not.stringContaining("//pds"),
      expect.any(Object)
    );

    vi.unstubAllGlobals();
  });

  it("uses default username Coadmin when UNIFIER_USERNAME not set", async () => {
    delete process.env.UNIFIER_USERNAME;
    vi.mocked(getKeyVaultSecret).mockResolvedValue(null);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { T: [], pagination: [{ nextTableName: "-1", nextKey: "" }] },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await fetchAllRows("T", ["C"]);

    const authHeader = mockFetch.mock.calls[0][1].headers.Authorization;
    const decoded = Buffer.from(authHeader.replace("Basic ", ""), "base64").toString();
    expect(decoded).toMatch(/^Coadmin:/);

    vi.unstubAllGlobals();
  });
});

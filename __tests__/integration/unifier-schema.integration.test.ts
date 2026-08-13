import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/devtools-env", () => ({
  isDevToolsAllowed: vi.fn(),
  DEVTOOLS_BLOCKED_MESSAGE: "Not available in production.",
}));

vi.mock("@/lib/devtools-auth", () => ({
  requireDevToolsAdmin: vi.fn(),
}));

describe("GET /api/devtools/unifier-schema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when DevTools are blocked", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    vi.mocked(isDevToolsAllowed).mockReturnValue(false);

    const { GET } = await import("@/app/api/devtools/unifier-schema/route");
    const res = await GET();

    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Not available in production.");
  });

  it("returns schema JSON with tables array when allowed", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);

    const { GET } = await import("@/app/api/devtools/unifier-schema/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json() as { tables: unknown[]; count: number };
    expect(Array.isArray(body.tables)).toBe(true);
    expect(body.count).toBe(body.tables.length);
    expect(body.count).toBeGreaterThanOrEqual(25);
  });

  it("returns table definitions with expected shape", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);

    const { GET } = await import("@/app/api/devtools/unifier-schema/route");
    const res = await GET();
    const body = await res.json() as { tables: Array<{ tableName: string; displayName: string; columns: Array<{ code: string; label: string }> }> };

    for (const t of body.tables) {
      expect(t.tableName).toBeTruthy();
      expect(t.displayName).toBeTruthy();
      expect(Array.isArray(t.columns)).toBe(true);
    }
  });
});

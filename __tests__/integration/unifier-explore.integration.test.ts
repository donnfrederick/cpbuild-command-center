import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/devtools-env", () => ({
  isDevToolsAllowed: vi.fn(),
  DEVTOOLS_BLOCKED_MESSAGE: "Not available in production.",
}));

vi.mock("@/lib/devtools-auth", () => ({
  requireDevToolsAdmin: vi.fn(),
}));

vi.mock("@/lib/unifier/client", () => ({
  fetchAllRows: vi.fn(),
}));

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/devtools/unifier-explore");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

const MOCK_ROWS = [
  { ID: "1", CP_SUB_SUBCONTRACTNAME_TB50: "Acme Flooring", PROJECT_ID: "P001" },
  { ID: "2", CP_SUB_SUBCONTRACTNAME_TB50: "Beta Carpets", PROJECT_ID: "P002" },
];

describe("GET /api/devtools/unifier-explore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("environment guard", () => {
    it("returns 403 when DevTools are blocked", async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      vi.mocked(isDevToolsAllowed).mockReturnValue(false);

      const { GET } = await import("@/app/api/devtools/unifier-explore/route");
      const res = await GET(makeRequest({ table: "UNIFIER_UXSUB" }));

      expect(res.status).toBe(403);
    });
  });

  describe("input validation", () => {
    beforeEach(async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      vi.mocked(isDevToolsAllowed).mockReturnValue(true);
      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      vi.mocked(requireDevToolsAdmin).mockResolvedValue(null);
    });

    it("returns 400 when table param is missing", async () => {
      const { GET } = await import("@/app/api/devtools/unifier-explore/route");
      const res = await GET(makeRequest());
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("table");
    });

    it("passes unknown tables through to Unifier and surfaces the API error as 502", async () => {
      // The allowlist check was removed to support dynamically discovered tables.
      // Unknown tables are now forwarded to the Unifier PDS API which rejects them,
      // causing fetchAllRows to throw and the route to return 502.
      const { fetchAllRows } = await import("@/lib/unifier/client");
      vi.mocked(fetchAllRows).mockRejectedValue(new Error("Unifier PDS API error: 400 Bad Request"));

      const { GET } = await import("@/app/api/devtools/unifier-explore/route");
      const res = await GET(makeRequest({ table: "ARBITRARY_TABLE" }));
      expect(res.status).toBe(502);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("Unifier PDS API error");
    });
  });

  describe("happy path", () => {
    beforeEach(async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      vi.mocked(isDevToolsAllowed).mockReturnValue(true);
      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      vi.mocked(requireDevToolsAdmin).mockResolvedValue(null);
    });

    it("returns rows for an allowlisted table", async () => {
      const { fetchAllRows } = await import("@/lib/unifier/client");
      vi.mocked(fetchAllRows).mockResolvedValue(MOCK_ROWS as never);

      const { GET } = await import("@/app/api/devtools/unifier-explore/route");
      const res = await GET(makeRequest({ table: "UNIFIER_UXSUB", limit: "10" }));

      expect(res.status).toBe(200);
      const body = await res.json() as { tableName: string; rows: unknown[]; total: number };
      expect(body.tableName).toBe("UNIFIER_UXSUB");
      expect(Array.isArray(body.rows)).toBe(true);
      expect(body.total).toBe(2);
    });

    it("filters rows by projectId when provided", async () => {
      const { fetchAllRows } = await import("@/lib/unifier/client");
      vi.mocked(fetchAllRows).mockResolvedValue(MOCK_ROWS as never);

      const { GET } = await import("@/app/api/devtools/unifier-explore/route");
      const res = await GET(makeRequest({ table: "UNIFIER_UXSUB", projectId: "P001" }));

      expect(res.status).toBe(200);
      const body = await res.json() as { rows: unknown[]; total: number; projectIdFilter: string };
      expect(body.total).toBe(1);
      expect(body.projectIdFilter).toBe("P001");
    });

    it("respects the limit param (max 200)", async () => {
      const manyRows = Array.from({ length: 300 }, (_, i) => ({ ID: String(i) }));
      const { fetchAllRows } = await import("@/lib/unifier/client");
      vi.mocked(fetchAllRows).mockResolvedValue(manyRows as never);

      const { GET } = await import("@/app/api/devtools/unifier-explore/route");
      const res = await GET(makeRequest({ table: "UNIFIER_UXSUB", limit: "500" }));

      expect(res.status).toBe(200);
      const body = await res.json() as { returned: number; limit: number };
      expect(body.limit).toBe(200); // capped at MAX_LIMIT
    });
  });

  describe("Unifier API error", () => {
    beforeEach(async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      vi.mocked(isDevToolsAllowed).mockReturnValue(true);
      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      vi.mocked(requireDevToolsAdmin).mockResolvedValue(null);
    });

    it("returns 502 when Unifier API throws", async () => {
      const { fetchAllRows } = await import("@/lib/unifier/client");
      vi.mocked(fetchAllRows).mockRejectedValue(new Error("Unifier connection refused"));

      const { GET } = await import("@/app/api/devtools/unifier-explore/route");
      const res = await GET(makeRequest({ table: "UNIFIER_UXSUB" }));

      expect(res.status).toBe(502);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("Unifier connection refused");
    });
  });
});

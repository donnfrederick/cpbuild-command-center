import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/devtools-env", () => ({
  isDevToolsAllowed: vi.fn(),
  isRawSqlAllowed: vi.fn().mockReturnValue(true),
  DEVTOOLS_BLOCKED_MESSAGE: "Not available in production.",
}));

vi.mock("@/lib/devtools-auth", () => ({
  requireDevToolsAdmin: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $queryRawUnsafe: vi.fn(),
  },
}));

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/devtools/data");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

describe("GET /api/devtools/data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("environment guard", () => {
    it("returns 403 when DevTools are not allowed", async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      vi.mocked(isDevToolsAllowed).mockReturnValue(false);

      const { GET } = await import("@/app/api/devtools/data/route");
      const res = await GET(makeRequest());

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Not available in production.");
    });
  });

  describe("auth guard", () => {
    beforeEach(async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    });

    it("returns 401 when not authenticated", async () => {
      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      vi.mocked(requireDevToolsAdmin).mockResolvedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never
      );

      const { GET } = await import("@/app/api/devtools/data/route");
      const res = await GET(makeRequest());
      expect(res.status).toBe(401);
    });

    it("returns 403 when authenticated as non-admin", async () => {
      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      vi.mocked(requireDevToolsAdmin).mockResolvedValue(
        new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as never
      );

      const { GET } = await import("@/app/api/devtools/data/route");
      const res = await GET(makeRequest());
      expect(res.status).toBe(403);
    });
  });

  describe("with DevTools allowed and admin authenticated", () => {
    beforeEach(async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      vi.mocked(isDevToolsAllowed).mockReturnValue(true);
      vi.mocked(requireDevToolsAdmin).mockResolvedValue(null);
    });

    describe("table list (no table param)", () => {
      it("returns all Prisma model tables with counts sorted alphabetically", async () => {
        const { db } = await import("@/lib/db");
        // Each table queries COUNT — return 0 for all
        vi.mocked(db.$queryRawUnsafe).mockResolvedValue([{ count: "0" }]);

        const { GET } = await import("@/app/api/devtools/data/route");
        const res = await GET(makeRequest());

        expect(res.status).toBe(200);
        const body = await res.json() as { tables: Array<{ name: string; count: number }> };
        expect(body.tables).toHaveLength(84);
        const names = body.tables.map((t) => t.name);
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
        // Core auth & users
        expect(names).toContain("Account");
        expect(names).toContain("User");
        expect(names).toContain("Role");
        expect(names).toContain("Permission");
        expect(names).toContain("RolePermission");
        expect(names).toContain("UserSpecialPermission");
        expect(names).toContain("Invite");
        expect(names).toContain("PasswordResetToken");
        expect(names).toContain("Session");
        expect(names).toContain("VerificationToken");
        expect(names).toContain("MasqueradeLog");
        // Projects & units (including sub-scopes)
        expect(names).toContain("Project");
        expect(names).toContain("ProjectRow");
        expect(names).toContain("ProjectSubScope");
        expect(names).toContain("ProjectSubScopeInstance");
        // Lookup tables
        expect(names).toContain("CanonicalScopeType");
        expect(names).toContain("ScopeType");
        expect(names).toContain("LocationType");
        expect(names).toContain("CostType");
        expect(names).toContain("InstallTeam");
        expect(names).toContain("UomType");
        // Feature tables
        expect(names).toContain("OfflinePreference");
        expect(names).toContain("UserProjectFavorite");
        expect(names).toContain("DesignTokenSnapshot");
        expect(names).toContain("LayoutIssue");
        expect(names).toContain("FeedbackReport");
        expect(names).toContain("FeedbackComment");
        expect(names).toContain("FeedbackDuplicate");
        expect(names).toContain("FeedbackMention");
        expect(names).toContain("FeedbackTour");
        expect(names).toContain("FieldDailyReport");
        expect(names).toContain("FieldDailyReportSectionNote");
        expect(names).toContain("FieldDailyReportSectionNoteReply");
        expect(names).toContain("FieldDailyReportProject");
        expect(names).toContain("Notification");
        expect(names).toContain("ApiKey");
        // Release & tour system
        expect(names).toContain("Release");
        expect(names).toContain("ReleaseVerification");
        expect(names).toContain("ReleaseTour");
        expect(names).toContain("ReleaseTourStep");
        expect(names).toContain("EnvironmentVisit");
        // Morning Briefing
        expect(names).toContain("DailyBriefing");
        expect(names).toContain("BriefingSynthesis");
        expect(names).toContain("BriefingFeedback");
        expect(names).toContain("BriefingRule");
        expect(names).toContain("BacklogItem");
        // Issues & Observations
        expect(names).toContain("ProjectIssue");
        expect(names).toContain("ProjectNote");
        expect(names).toContain("IssueComment");
        expect(names).toContain("IssueScopeTag");
        expect(names).toContain("IssueResponsiblePartyTag");
        expect(names).toContain("ProjectObservation");
        expect(names).toContain("ObservationComment");
        expect(names).toContain("ObservationScopeTag");
        expect(names).toContain("IssueTypeCatalog");
        expect(names).toContain("ObservationTypeCatalog");
        expect(names).toContain("ResponsiblePartyCatalog");
        expect(names).toContain("MediaAttachment");
        expect(names).toContain("ContentTranslation");
        // Forms & inspections
        expect(names).toContain("Form");
        expect(names).toContain("FormVersion");
        expect(names).toContain("InspectionAnswer");
        expect(names).toContain("InspectionAnswerMedia");
        expect(names).toContain("InspectionDeficiency");
        expect(names).toContain("InspectionDeficiencyMedia");
        expect(names).toContain("InspectionFormQuestion");
        expect(names).toContain("InspectionFormSection");
        expect(names).toContain("InspectionFormVersionQuestion");
        expect(names).toContain("InspectionFormVersionSection");
        expect(names).toContain("InspectionSubmission");
      });
    });

    describe("table data", () => {
      it("returns 400 for a table not in the whitelist", async () => {
        const { GET } = await import("@/app/api/devtools/data/route");
        const res = await GET(makeRequest({ table: "some_malicious_table" }));
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toBe("Invalid table name");
      });

      it("returns 200 with rows and columns for a valid table", async () => {
        const { db } = await import("@/lib/db");
        vi.mocked(db.$queryRawUnsafe)
          .mockResolvedValueOnce([
            { id: "r1", unifierPid: "uni-site-a", deletedAt: null, installManagerName: null, installManagerId: null, projectManagerId: null },
          ])
          .mockResolvedValueOnce([{ count: "1" }]);

        const { GET } = await import("@/app/api/devtools/data/route");
        const res = await GET(makeRequest({ table: "Project" }));

        expect(res.status).toBe(200);
        const body = await res.json() as {
          table: string;
          columns: string[];
          rows: Record<string, unknown>[];
          total: number;
          page: number;
          limit: number;
        };
        expect(body.table).toBe("Project");
        expect(body.total).toBe(1);
        expect(body.rows).toHaveLength(1);
        expect(body.rows[0].unifierPid).toBe("uni-site-a");
        expect(body.columns).toContain("unifierPid");
      });

      it("excludes passwordHash from User rows", async () => {
        const { db } = await import("@/lib/db");
        vi.mocked(db.$queryRawUnsafe)
          .mockResolvedValueOnce([
            { id: "u1", email: "a@b.com", passwordHash: "secret", name: "Alice" },
          ])
          .mockResolvedValueOnce([{ count: "1" }]);

        const { GET } = await import("@/app/api/devtools/data/route");
        const res = await GET(makeRequest({ table: "User" }));
        const body = await res.json() as { rows: Record<string, unknown>[] };

        expect(body.rows[0]).not.toHaveProperty("passwordHash");
        expect(body.rows[0]).toHaveProperty("email");
      });

      it("excludes screenshot from LayoutIssue rows", async () => {
        const { db } = await import("@/lib/db");
        vi.mocked(db.$queryRawUnsafe)
          .mockResolvedValueOnce([
            { id: "li1", description: "nav clips", device: "mobile", platform: "ios", route: "/en", status: "OPEN", screenshot: "data:image/png;base64,AAAA" },
          ])
          .mockResolvedValueOnce([{ count: "1" }]);

        const { GET } = await import("@/app/api/devtools/data/route");
        const res = await GET(makeRequest({ table: "LayoutIssue" }));
        const body = await res.json() as { rows: Record<string, unknown>[] };

        expect(body.rows[0]).not.toHaveProperty("screenshot");
        expect(body.rows[0]).toHaveProperty("description");
      });

      it("excludes screenshot from FeedbackReport rows", async () => {
        const { db } = await import("@/lib/db");
        vi.mocked(db.$queryRawUnsafe)
          .mockResolvedValueOnce([
            { id: "fr1", title: "Bug", description: "it crashes", userId: "u1", type: "BUG", status: "OPEN", screenshot: "data:image/png;base64,BBBB" },
          ])
          .mockResolvedValueOnce([{ count: "1" }]);

        const { GET } = await import("@/app/api/devtools/data/route");
        const res = await GET(makeRequest({ table: "FeedbackReport" }));
        const body = await res.json() as { rows: Record<string, unknown>[] };

        expect(body.rows[0]).not.toHaveProperty("screenshot");
        expect(body.rows[0]).toHaveProperty("title");
      });

      it("serializes Date values to ISO strings", async () => {
        const { db } = await import("@/lib/db");
        const now = new Date("2026-03-04T00:00:00Z");
        vi.mocked(db.$queryRawUnsafe)
          .mockResolvedValueOnce([{ id: "r1", createdAt: now, email: "t@t.com" }])
          .mockResolvedValueOnce([{ count: "1" }]);

        const { GET } = await import("@/app/api/devtools/data/route");
        const res = await GET(makeRequest({ table: "User" }));
        const body = await res.json() as { rows: Record<string, unknown>[] };

        expect(body.rows[0].createdAt).toBe("2026-03-04T00:00:00.000Z");
      });

      it("applies pagination (page + limit) correctly", async () => {
        const { db } = await import("@/lib/db");
        vi.mocked(db.$queryRawUnsafe)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ count: "42" }]);

        const { GET } = await import("@/app/api/devtools/data/route");
        const res = await GET(makeRequest({ table: "Project", page: "3", limit: "10" }));
        const body = await res.json() as { page: number; limit: number; total: number };

        expect(body.page).toBe(3);
        expect(body.limit).toBe(10);
        expect(body.total).toBe(42);
      });

      it("returns 200 with rows for ProjectSubScope table", async () => {
        const { db } = await import("@/lib/db");
        vi.mocked(db.$queryRawUnsafe)
          .mockResolvedValueOnce([
            { id: "ss1", projectId: "p1", scopeTypeId: "st1", unitType: "1BR", name: "Kitchen Cabinetry", distributionMode: "even", qty: null, createdById: "u1", createdAt: new Date("2026-03-25T00:00:00Z") },
          ])
          .mockResolvedValueOnce([{ count: "1" }]);

        const { GET } = await import("@/app/api/devtools/data/route");
        const res = await GET(makeRequest({ table: "ProjectSubScope" }));

        expect(res.status).toBe(200);
        const body = await res.json() as { table: string; rows: Record<string, unknown>[]; total: number };
        expect(body.table).toBe("ProjectSubScope");
        expect(body.total).toBe(1);
        expect(body.rows[0].name).toBe("Kitchen Cabinetry");
        expect(body.rows[0].projectId).toBe("p1");
      });

      it("returns 200 with rows for ProjectSubScopeInstance table", async () => {
        const { db } = await import("@/lib/db");
        vi.mocked(db.$queryRawUnsafe)
          .mockResolvedValueOnce([
            { id: "ssi1", subScopeId: "ss1", rowId: "row1", qty: "7.5", scopeStage: "INSTALL", scopeStatus: "IN_PROGRESS", inspectionStatus: null },
          ])
          .mockResolvedValueOnce([{ count: "1" }]);

        const { GET } = await import("@/app/api/devtools/data/route");
        const res = await GET(makeRequest({ table: "ProjectSubScopeInstance" }));

        expect(res.status).toBe(200);
        const body = await res.json() as { table: string; rows: Record<string, unknown>[]; total: number };
        expect(body.table).toBe("ProjectSubScopeInstance");
        expect(body.total).toBe(1);
        expect(body.rows[0].subScopeId).toBe("ss1");
        expect(body.rows[0].rowId).toBe("row1");
        expect(body.rows[0].scopeStatus).toBe("IN_PROGRESS");
      });

      it("excludes tokenHash from PasswordResetToken rows", async () => {
        const { db } = await import("@/lib/db");
        vi.mocked(db.$queryRawUnsafe)
          .mockResolvedValueOnce([{ id: "prt1", userId: "u1", tokenHash: "hashed-secret", createdAt: new Date() }])
          .mockResolvedValueOnce([{ count: "1" }]);

        const { GET } = await import("@/app/api/devtools/data/route");
        const res = await GET(makeRequest({ table: "PasswordResetToken" }));
        const body = await res.json() as { rows: Record<string, unknown>[] };

        expect(body.rows[0]).not.toHaveProperty("tokenHash");
        expect(body.rows[0]).toHaveProperty("userId");
      });

      it("returns 500 when db query throws", async () => {
        const { db } = await import("@/lib/db");
        vi.mocked(db.$queryRawUnsafe).mockRejectedValue(new Error("db error"));

        const { GET } = await import("@/app/api/devtools/data/route");
        const res = await GET(makeRequest({ table: "Project" }));
        expect(res.status).toBe(500);
        const body = await res.json() as { error: string };
        expect(body.error).toContain("db error");
      });
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/devtools-env", () => ({
  isDevToolsAllowed: vi.fn(),
  DEVTOOLS_BLOCKED_MESSAGE: "Not available in production.",
}));

vi.mock("@/lib/devtools-auth", () => ({
  requireDevToolsAdmin: vi.fn(),
}));

// Mock child_process so tests never run real git commands
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

describe("GET /api/devtools/git-diff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("environment guard", () => {
    it("returns 403 when DevTools are not allowed", async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      vi.mocked(isDevToolsAllowed).mockReturnValue(false);

      const { GET } = await import("@/app/api/devtools/git-diff/route");
      const res = await GET();

      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
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

      const { GET } = await import("@/app/api/devtools/git-diff/route");
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns 403 when authenticated as MEMBER", async () => {
      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      vi.mocked(requireDevToolsAdmin).mockResolvedValue(
        new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as never
      );

      const { GET } = await import("@/app/api/devtools/git-diff/route");
      const res = await GET();
      expect(res.status).toBe(403);
    });
  });

  describe("happy path (ADMIN)", () => {
    beforeEach(async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      vi.mocked(isDevToolsAllowed).mockReturnValue(true);
      vi.mocked(requireDevToolsAdmin).mockResolvedValue(null);
    });

    it("returns branch name and diff", async () => {
      const { execSync } = await import("child_process");
      vi.mocked(execSync)
        .mockReturnValueOnce("feat/pr-workflow-panel\n" as never) // branch
        .mockReturnValueOnce("diff --git a/foo.ts b/foo.ts\n+export const x = 1;" as never); // diff

      const { GET } = await import("@/app/api/devtools/git-diff/route");
      const res = await GET();

      expect(res.status).toBe(200);
      const body = await res.json() as { branch: string; diff: string; isEmpty: boolean };
      expect(body.branch).toBe("feat/pr-workflow-panel");
      expect(body.diff).toContain("export const x = 1");
      expect(body.isEmpty).toBe(false);
    });

    it("returns isEmpty: true when diff is empty", async () => {
      const { execSync } = await import("child_process");
      vi.mocked(execSync)
        .mockReturnValueOnce("main\n" as never)
        .mockReturnValueOnce("" as never);

      const { GET } = await import("@/app/api/devtools/git-diff/route");
      const res = await GET();

      expect(res.status).toBe(200);
      const body = await res.json() as { isEmpty: boolean };
      expect(body.isEmpty).toBe(true);
    });

    it("returns isEmpty: true when git diff throws (e.g. remote not fetched)", async () => {
      const { execSync } = await import("child_process");
      vi.mocked(execSync)
        .mockReturnValueOnce("feat/something\n" as never)
        .mockImplementationOnce(() => { throw new Error("fatal: no such branch"); });

      const { GET } = await import("@/app/api/devtools/git-diff/route");
      const res = await GET();

      expect(res.status).toBe(200);
      const body = await res.json() as { isEmpty: boolean; branch: string };
      expect(body.isEmpty).toBe(true);
      expect(body.branch).toBe("feat/something");
    });

    it("returns 500 when git rev-parse fails", async () => {
      const { execSync } = await import("child_process");
      vi.mocked(execSync).mockImplementationOnce(() => { throw new Error("not a git repo"); });

      const { GET } = await import("@/app/api/devtools/git-diff/route");
      const res = await GET();

      expect(res.status).toBe(500);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("not a git repo");
    });
  });
});

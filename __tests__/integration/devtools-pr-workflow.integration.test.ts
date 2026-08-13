import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/devtools-env", () => ({
  isDevToolsAllowed: vi.fn(),
  DEVTOOLS_BLOCKED_MESSAGE: "Not available in production.",
}));

vi.mock("@/lib/devtools-auth", () => ({
  requireDevToolsAdmin: vi.fn(),
}));

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/devtools/pr-workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/devtools/pr-workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("environment guard", () => {
    it("returns 403 when DevTools are not allowed", async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      vi.mocked(isDevToolsAllowed).mockReturnValue(false);

      const { POST } = await import("@/app/api/devtools/pr-workflow/route");
      const res = await POST(makeRequest({ title: "My PR", branch: "feat/x" }));

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

      const { POST } = await import("@/app/api/devtools/pr-workflow/route");
      const res = await POST(makeRequest({ title: "My PR", branch: "feat/x" }));
      expect(res.status).toBe(401);
    });

    it("returns 403 when authenticated as non-admin", async () => {
      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      vi.mocked(requireDevToolsAdmin).mockResolvedValue(
        new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as never
      );

      const { POST } = await import("@/app/api/devtools/pr-workflow/route");
      const res = await POST(makeRequest({ title: "My PR", branch: "feat/x" }));
      expect(res.status).toBe(403);
    });
  });

  describe("input validation", () => {
    beforeEach(async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      vi.mocked(isDevToolsAllowed).mockReturnValue(true);
      vi.mocked(requireDevToolsAdmin).mockResolvedValue(null);
    });

    it("returns 400 when title is missing", async () => {
      const { POST } = await import("@/app/api/devtools/pr-workflow/route");
      const res = await POST(makeRequest({ branch: "feat/x" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when branch is missing", async () => {
      const { POST } = await import("@/app/api/devtools/pr-workflow/route");
      const res = await POST(makeRequest({ title: "My PR" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new NextRequest("http://localhost/api/devtools/pr-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });
      const { POST } = await import("@/app/api/devtools/pr-workflow/route");
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GITHUB_TOKEN absent → fallback URL", () => {
    beforeEach(async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      vi.mocked(isDevToolsAllowed).mockReturnValue(true);
      vi.mocked(requireDevToolsAdmin).mockResolvedValue(null);
      delete process.env.GITHUB_TOKEN;
    });

    it("returns fallbackUrl when GITHUB_TOKEN is not set", async () => {
      const { POST } = await import("@/app/api/devtools/pr-workflow/route");
      const res = await POST(makeRequest({
        title: "Add feature",
        body: "## Summary\nDoes stuff",
        labels: ["backend"],
        branch: "feat/my-feature",
      }));

      expect(res.status).toBe(200);
      const data = await res.json() as { fallbackUrl: string };
      expect(data.fallbackUrl).toContain("github.com");
      expect(data.fallbackUrl).toContain("feat%2Fmy-feature");
      expect(data.fallbackUrl).toContain("Add%20feature");
      expect(data.fallbackUrl).not.toHaveProperty("prNumber");
    });

    it("fallbackUrl targets the correct repo and base branch", async () => {
      const { POST } = await import("@/app/api/devtools/pr-workflow/route");
      const res = await POST(makeRequest({
        title: "Fix bug",
        branch: "fix/the-bug",
      }));

      const data = await res.json() as { fallbackUrl: string };
      expect(data.fallbackUrl).toContain("cp-build-dev-ops/command-center-reboot");
      expect(data.fallbackUrl).toContain("compare/dev...");
      expect(data.fallbackUrl).toContain("quick_pull=1");
    });
  });

  describe("GITHUB_TOKEN present → GitHub API", () => {
    beforeEach(async () => {
      const { isDevToolsAllowed } = await import("@/lib/devtools-env");
      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      vi.mocked(isDevToolsAllowed).mockReturnValue(true);
      vi.mocked(requireDevToolsAdmin).mockResolvedValue(null);
      process.env.GITHUB_TOKEN = "ghp_test_token";
    });

    afterEach(() => {
      delete process.env.GITHUB_TOKEN;
    });

    it("returns prNumber and prUrl on success", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => ({
        ok: true,
        json: async () => ({ number: 42, html_url: "https://github.com/cp-build-dev-ops/command-center-reboot/pull/42" }),
      })));

      const { POST } = await import("@/app/api/devtools/pr-workflow/route");
      const res = await POST(makeRequest({
        title: "My PR",
        body: "Does something",
        branch: "feat/my-pr",
      }));

      expect(res.status).toBe(200);
      const data = await res.json() as { prNumber: number; prUrl: string };
      expect(data.prNumber).toBe(42);
      expect(data.prUrl).toContain("/pull/42");
    });

    it("returns 422 when GitHub API rejects the request", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => ({
        ok: false,
        status: 422,
        json: async () => ({ message: "Validation Failed" }),
      })));

      const { POST } = await import("@/app/api/devtools/pr-workflow/route");
      const res = await POST(makeRequest({
        title: "Bad PR",
        branch: "feat/bad",
      }));

      expect(res.status).toBe(422);
      const body = await res.json() as { error: string };
      expect(body.error).toBe("Validation Failed");
    });

    it("returns 500 when fetch itself throws", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network failure"); }));

      const { POST } = await import("@/app/api/devtools/pr-workflow/route");
      const res = await POST(makeRequest({ title: "PR", branch: "feat/x" }));
      expect(res.status).toBe(500);
      const body = await res.json() as { error: string };
      expect(body.error).toContain("network failure");
    });
  });
});

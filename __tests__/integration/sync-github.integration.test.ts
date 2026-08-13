/**
 * Integration tests for POST /api/devtools/releases/sync-github
 *
 * Covers:
 * - Happy path: imports new PRs, skips existing ones
 * - No GITHUB_TOKEN: returns 503
 * - Auth failure: returns 401
 * - Empty GitHub response: returns 0/0/0
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
// vi.hoisted ensures these refs are available inside vi.mock factories,
// which are hoisted above all imports by the Vitest transformer.

const { mockCreate, mockFindMany, mockFetch } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindMany: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("@/lib/devtools-env", () => ({
  isDevToolsAllowed: vi.fn(() => true),
  DEVTOOLS_BLOCKED_MESSAGE: "DevTools blocked",
}));

vi.mock("@/lib/devtools-auth", () => ({
  requireDevToolsAdminWithSession: vi.fn(async () => ({
    guard: null,
    session: { user: { id: "admin-1", role: "ADMIN" } },
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    release: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.stubGlobal("fetch", mockFetch);

import { POST } from "@/app/api/devtools/releases/sync-github/route";

function makePR(n: number, merged = true) {
  return {
    number: n,
    title: `PR ${n} title`,
    body: "## Summary\n- Change A\n- Change B",
    head: { ref: `feat/feature-${n}` },
    merged_at: merged ? "2026-03-01T12:00:00Z" : null,
    html_url: `https://github.com/cp-build-dev-ops/command-center-reboot/pull/${n}`,
    user: { login: "cp-build-dev" },
  };
}

function githubResponse(prs: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => prs,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/devtools/releases/sync-github", () => {
  beforeEach(async () => {
    // Reset flushes queued mockResolvedValueOnce calls; re-establish defaults after.
    vi.resetAllMocks();
    process.env.GITHUB_TOKEN = "test-token";
    mockFindMany.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: "new-id" });

    // Re-establish the devtools-auth default (resetAllMocks cleared it)
    const { requireDevToolsAdminWithSession } = await import("@/lib/devtools-auth");
    vi.mocked(requireDevToolsAdminWithSession).mockResolvedValue({
      guard: null,
      session: { user: { id: "admin-1", role: "ADMIN" } } as never,
    });

    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
  });

  it("returns 503 when GITHUB_TOKEN is not set", async () => {
    delete process.env.GITHUB_TOKEN;
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("GITHUB_TOKEN");
  });

  it("returns 401 when session is not admin", async () => {
    const { requireDevToolsAdminWithSession } = await import("@/lib/devtools-auth");
    vi.mocked(requireDevToolsAdminWithSession).mockResolvedValueOnce({
      guard: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
      session: null as never,
    });
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("imports new PRs and skips existing ones", async () => {
    // Page 1: 2 PRs, page 2: empty (stops pagination)
    mockFetch
      .mockResolvedValueOnce(githubResponse([makePR(10), makePR(11)]))
      .mockResolvedValueOnce(githubResponse([]));

    // PR #10 already in DB
    mockFindMany.mockResolvedValue([{ prNumber: 10 }]);

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imported).toBe(1);   // PR #11 imported
    expect(body.skipped).toBe(1);    // PR #10 skipped
    expect(body.total).toBe(2);
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate.mock.calls[0][0].data.prNumber).toBe(11);
  });

  it("skips unmerged (closed) PRs", async () => {
    mockFetch
      .mockResolvedValueOnce(githubResponse([makePR(20, false), makePR(21, true)]))
      .mockResolvedValueOnce(githubResponse([]));

    const res = await POST();
    const body = await res.json();
    expect(body.imported).toBe(1);   // only merged PR #21
    expect(body.total).toBe(1);
  });

  it("returns 0/0/0 when GitHub returns no PRs", async () => {
    mockFetch
      .mockResolvedValueOnce(githubResponse([]))
      .mockResolvedValueOnce(githubResponse([]));

    const res = await POST();
    const body = await res.json();
    expect(body).toEqual({ imported: 0, skipped: 0, total: 0 });
  });

  it("returns 502 when GitHub API fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized" });
    const res = await POST();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("GitHub API error");
  });

  it("extracts changes from PR body Summary section", async () => {
    mockFetch
      .mockResolvedValueOnce(
        githubResponse([
          {
            number: 30,
            title: "Add feature X",
            body: "## Summary\n- Added the X widget\n- Fixed layout bug\n## Test plan\n- [ ] Done",
            head: { ref: "feat/feature-x" },
            merged_at: "2026-03-05T10:00:00Z",
            html_url: "https://github.com/test/pr/30",
            user: { login: "dev" },
          },
        ])
      )
      .mockResolvedValueOnce(githubResponse([]));

    const res = await POST();
    expect(res.status).toBe(200);
    const createCall = mockCreate.mock.calls[0][0];
    const changes = createCall.data.changes as { description: string }[];
    expect(changes).toHaveLength(2);
    expect(changes[0].description).toBe("Added the X widget");
    expect(changes[1].description).toBe("Fixed layout bug");
  });

  it("falls back to PR title as single change when body has no Summary bullets", async () => {
    mockFetch
      .mockResolvedValueOnce(
        githubResponse([{ ...makePR(40), body: "Just a brief description with no bullets" }])
      )
      .mockResolvedValueOnce(githubResponse([]));

    const res = await POST();
    expect(res.status).toBe(200);
    const createCall = mockCreate.mock.calls[0][0];
    const changes = createCall.data.changes as { description: string }[];
    expect(changes).toHaveLength(1);
    expect(changes[0].description).toBe("PR 40 title");
  });
});

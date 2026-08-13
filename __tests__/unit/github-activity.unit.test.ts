import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Module under test ──────────────────────────────────────────────────────────
// Dynamic import so we can control GITHUB_TOKEN per test.
// Do NOT top-level import — token is read at call time, not module load time.

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a GitHub Search API issue item (the shape returned by /search/issues).
 *
 * The `pull_request` sub-object in Search API results contains URLs but
 * `merged_at` is not always present. Our implementation falls back to
 * `item.closed_at`, which is always available for merged PRs. Fixtures
 * match this real-world shape.
 */
function makePR(mergedAt: string, overrides: Record<string, unknown> = {}) {
  return {
    number: 1,
    title: "feat: add morning briefing",
    html_url: "https://github.com/cp-build-dev-ops/command-center-reboot/pull/1",
    // pull_request contains only URL fields in real Search API responses
    pull_request: {
      url: "https://api.github.com/repos/cp-build-dev-ops/command-center-reboot/pulls/1",
      html_url: "https://github.com/cp-build-dev-ops/command-center-reboot/pull/1",
      diff_url: "https://github.com/cp-build-dev-ops/command-center-reboot/pull/1.diff",
      patch_url: "https://github.com/cp-build-dev-ops/command-center-reboot/pull/1.patch",
    },
    // closed_at is the reliable source for merge time; merged PRs are also closed
    closed_at: mergedAt,
    user: { login: "cp-build-dev" },
    body: "Description of PR",
    ...overrides,
  };
}

/** Wraps items in the Search API envelope: { total_count, items }. */
function makeSearchResponse(items: ReturnType<typeof makePR>[]) {
  return { total_count: items.length, incomplete_results: false, items };
}

function makeCommit(date: string, overrides: Record<string, unknown> = {}) {
  return {
    sha: "abc1234def567",
    commit: {
      message: "feat: implement daily briefing\n\nLonger body here",
      author: { name: "Phil", date },
    },
    author: { login: "cp-build-dev" },
    html_url: "https://github.com/cp-build-dev-ops/command-center-reboot/commit/abc1234",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("lib/github-activity", () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore token and fetch
    if (originalToken !== undefined) {
      process.env.GITHUB_TOKEN = originalToken;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
    globalThis.fetch = originalFetch;
  });

  describe("fetchMergedPRs", () => {
    it("returns empty array when GITHUB_TOKEN is not set", async () => {
      delete process.env.GITHUB_TOKEN;
      const { fetchMergedPRs } = await import("@/lib/github-activity");
      const result = await fetchMergedPRs(new Date("2026-03-04T00:00:00.000Z"));
      expect(result).toEqual([]);
    });

    it("returns empty array and warns when fetch fails", async () => {
      process.env.GITHUB_TOKEN = "test-token";
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const { fetchMergedPRs } = await import("@/lib/github-activity");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await fetchMergedPRs(new Date("2026-03-04T00:00:00.000Z"));
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    });

    it("returns empty array and warns when API returns non-200", async () => {
      process.env.GITHUB_TOKEN = "test-token";
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });

      const { fetchMergedPRs } = await import("@/lib/github-activity");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await fetchMergedPRs(new Date("2026-03-04T00:00:00.000Z"));
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    });

    it("uses the GitHub Search API with merged:YYYY-MM-DD in the query URL", async () => {
      process.env.GITHUB_TOKEN = "test-token";
      const capturedUrls: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrls.push(url);
        return { ok: true, json: async () => makeSearchResponse([]) };
      });

      const { fetchMergedPRs } = await import("@/lib/github-activity");
      await fetchMergedPRs(new Date("2026-03-04T00:00:00.000Z"));

      expect(capturedUrls[0]).toContain("/search/issues");
      expect(capturedUrls[0]).toContain("merged%3A2026-03-04");
    });

    it("maps Search API item shape (closed_at fallback) to MergedPR", async () => {
      process.env.GITHUB_TOKEN = "test-token";

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          makeSearchResponse([makePR("2026-03-04T14:30:00Z", { number: 7 })]),
      });

      const { fetchMergedPRs } = await import("@/lib/github-activity");
      const result = await fetchMergedPRs(new Date("2026-03-04T00:00:00.000Z"));

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(7);
      expect(result[0].title).toBe("feat: add morning briefing");
      expect(result[0].author).toBe("cp-build-dev");
      // mergedAt derives from closed_at (pull_request.merged_at not present in real Search API)
      expect(result[0].mergedAt).toBe("2026-03-04T14:30:00Z");
    });

    it("falls back to pull_request.merged_at if closed_at is absent", async () => {
      process.env.GITHUB_TOKEN = "test-token";

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          makeSearchResponse([{
            number: 8,
            title: "feat: test",
            html_url: "https://github.com/test",
            pull_request: { merged_at: "2026-03-04T12:00:00Z" },
            closed_at: null,
            user: { login: "tester" },
            body: "",
          }]),
      });

      const { fetchMergedPRs } = await import("@/lib/github-activity");
      const result = await fetchMergedPRs(new Date("2026-03-04T00:00:00.000Z"));

      expect(result[0].mergedAt).toBe("2026-03-04T12:00:00Z");
    });

    it("returns empty array when items is missing from search response", async () => {
      process.env.GITHUB_TOKEN = "test-token";

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ total_count: 0 }), // no `items` key
      });

      const { fetchMergedPRs } = await import("@/lib/github-activity");
      const result = await fetchMergedPRs(new Date("2026-03-04T00:00:00.000Z"));
      expect(result).toEqual([]);
    });

    it("truncates PR body to 1000 characters", async () => {
      process.env.GITHUB_TOKEN = "test-token";
      const longBody = "x".repeat(2000);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          makeSearchResponse([makePR("2026-03-04T10:00:00Z", { body: longBody })]),
      });

      const { fetchMergedPRs } = await import("@/lib/github-activity");
      const result = await fetchMergedPRs(new Date("2026-03-04T00:00:00.000Z"));

      expect(result[0].body.length).toBe(1000);
    });
  });

  describe("fetchRecentCommits", () => {
    it("returns empty array when GITHUB_TOKEN is not set", async () => {
      delete process.env.GITHUB_TOKEN;
      const { fetchRecentCommits } = await import("@/lib/github-activity");
      const result = await fetchRecentCommits(new Date("2026-03-04T00:00:00.000Z"));
      expect(result).toEqual([]);
    });

    it("returns empty array and warns when API returns non-200", async () => {
      process.env.GITHUB_TOKEN = "test-token";
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const { fetchRecentCommits } = await import("@/lib/github-activity");
      const result = await fetchRecentCommits(new Date("2026-03-04T00:00:00.000Z"));
      expect(result).toEqual([]);
    });

    it("returns empty array and warns when fetch throws", async () => {
      process.env.GITHUB_TOKEN = "test-token";
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { fetchRecentCommits } = await import("@/lib/github-activity");
      const result = await fetchRecentCommits(new Date("2026-03-04T00:00:00.000Z"));
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    });

    it("maps commit data to RecentCommit shape", async () => {
      process.env.GITHUB_TOKEN = "test-token";
      const commit = makeCommit("2026-03-04T10:00:00Z");

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [commit],
      });

      const { fetchRecentCommits } = await import("@/lib/github-activity");
      const result = await fetchRecentCommits(new Date("2026-03-04T00:00:00.000Z"));

      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe("abc1234");   // truncated to 7 chars
      expect(result[0].author).toBe("Phil");
      expect(result[0].message).toBe("feat: implement daily briefing\n\nLonger body here");
    });

    it("falls back to login when commit author name is absent", async () => {
      process.env.GITHUB_TOKEN = "test-token";

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            sha: "abc1234",
            commit: { message: "fix: patch", author: { name: null, date: "2026-03-04T10:00:00Z" } },
            author: { login: "philamour" },
            html_url: "https://github.com/...",
          },
        ],
      });

      const { fetchRecentCommits } = await import("@/lib/github-activity");
      const result = await fetchRecentCommits(new Date("2026-03-04T00:00:00.000Z"));

      expect(result[0].author).toBe("philamour");
    });
  });

  describe("fetchOpenPRs", () => {
    it("maps GitHub API response to OpenPR shape", async () => {
      process.env.GITHUB_TOKEN = "test-token";

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            number: 42,
            title: "feat: open PR",
            html_url: "https://github.com/cp-build-dev-ops/command-center-reboot/pull/42",
            draft: true,
            user: { login: "dev-user" },
            created_at: "2026-03-04T08:00:00Z",
            labels: [{ name: "backend" }, { name: "feature" }],
          },
        ],
      });

      const { fetchOpenPRs } = await import("@/lib/github-activity");
      const result = await fetchOpenPRs();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        number: 42,
        title: "feat: open PR",
        draft: true,
        author: "dev-user",
        createdAt: "2026-03-04T08:00:00Z",
        labels: ["backend", "feature"],
      });
    });

    it("returns empty array when GITHUB_TOKEN is absent", async () => {
      delete process.env.GITHUB_TOKEN;

      const { fetchOpenPRs } = await import("@/lib/github-activity");
      const result = await fetchOpenPRs();

      expect(result).toEqual([]);
    });

    it("returns empty array when fetch fails", async () => {
      process.env.GITHUB_TOKEN = "test-token";
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network"));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const { fetchOpenPRs } = await import("@/lib/github-activity");
      const result = await fetchOpenPRs();

      expect(result).toEqual([]);
    });

    it("returns empty array when API returns non-ok response", async () => {
      process.env.GITHUB_TOKEN = "test-token";
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const { fetchOpenPRs } = await import("@/lib/github-activity");
      const result = await fetchOpenPRs();

      expect(result).toEqual([]);
    });
  });

  describe("fetchYesterdayActivity", () => {
    it("returns merged PRs, commits, and open PRs (happy path)", async () => {
      process.env.GITHUB_TOKEN = "test-token";

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        // Open PRs list (/pulls?state=open)
        if ((url as string).includes("state=open")) {
          return { ok: true, json: async () => [makePR("2026-03-04T10:00:00Z")] };
        }
        // Merged PRs now use Search API (/search/issues); fixture uses closed_at
        if ((url as string).includes("/search/issues")) {
          return {
            ok: true,
            json: async () => makeSearchResponse([makePR("2026-03-04T10:00:00Z")]),
          };
        }
        // Commits (/commits)
        return { ok: true, json: async () => [makeCommit("2026-03-04T10:00:00Z")] };
      });

      const { fetchYesterdayActivity } = await import("@/lib/github-activity");
      const result = await fetchYesterdayActivity(new Date("2026-03-04T00:00:00.000Z"));

      expect(callCount).toBe(3);
      expect(result.mergedPRs).toHaveLength(1);
      expect(result.recentCommits).toHaveLength(1);
      expect(result.openPRs).toHaveLength(1);
    });

    it("always resolves even if all fetches fail", async () => {
      process.env.GITHUB_TOKEN = "test-token";
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network"));
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const { fetchYesterdayActivity } = await import("@/lib/github-activity");
      const result = await fetchYesterdayActivity(new Date("2026-03-04T00:00:00.000Z"));

      expect(result.mergedPRs).toEqual([]);
      expect(result.recentCommits).toEqual([]);
      expect(result.openPRs).toEqual([]);
    });
  });
});

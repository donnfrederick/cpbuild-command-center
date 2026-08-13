import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

// ── Import handler after mocks ─────────────────────────────────────────────────

const { GET } = await import("@/app/api/admin/status/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession() {
  return {
    user: { id: "admin-1", email: "admin@cpbuild.com", name: "Admin", role: "ADMIN" },
  };
}

function memberSession() {
  return {
    user: { id: "member-1", email: "member@cpbuild.com", name: "Member", role: "MEMBER" },
  };
}

function makeRequest() {
  return new Request("http://localhost/api/admin/status", { method: "GET" });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/admin/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when authenticated as non-admin (MEMBER)", async () => {
    mockAuth.mockResolvedValue(memberSession());

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when authenticated as non-admin (MEMBER with TEAM_LEAD role)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "lead-1", email: "lead@cpbuild.com", name: "Lead", role: "TEAM_LEAD" },
    });

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(403);
  });

  it("returns 200 with status payload for admin", async () => {
    mockAuth.mockResolvedValue(adminSession());

    const res = await GET(makeRequest() as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      environment: expect.any(String),
      gitSha: expect.any(String),
      gitBranch: expect.any(String),
      nodeVersion: expect.any(String),
      uptimeSeconds: expect.any(Number),
      timestamp: expect.any(String),
    });
  });

  it("returns uptimeSeconds as a non-negative number", async () => {
    mockAuth.mockResolvedValue(adminSession());

    const res = await GET(makeRequest() as never);
    const body = await res.json();

    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("returns a valid ISO timestamp", async () => {
    mockAuth.mockResolvedValue(adminSession());

    const res = await GET(makeRequest() as never);
    const body = await res.json();

    expect(() => new Date(body.timestamp)).not.toThrow();
    expect(isNaN(new Date(body.timestamp).getTime())).toBe(false);
  });

  it("returns 'unknown' for gitSha when RAILWAY_GIT_COMMIT_SHA is not set", async () => {
    mockAuth.mockResolvedValue(adminSession());

    const originalSha = process.env.RAILWAY_GIT_COMMIT_SHA;
    delete process.env.RAILWAY_GIT_COMMIT_SHA;

    try {
      const res = await GET(makeRequest() as never);
      const body = await res.json();
      expect(body.gitSha).toBe("unknown");
    } finally {
      if (originalSha !== undefined) {
        process.env.RAILWAY_GIT_COMMIT_SHA = originalSha;
      } else {
        delete process.env.RAILWAY_GIT_COMMIT_SHA;
      }
    }
  });

  it("truncates gitSha to 7 characters when RAILWAY_GIT_COMMIT_SHA is set", async () => {
    mockAuth.mockResolvedValue(adminSession());

    const originalSha = process.env.RAILWAY_GIT_COMMIT_SHA;
    process.env.RAILWAY_GIT_COMMIT_SHA = "abcdef1234567890";

    try {
      const res = await GET(makeRequest() as never);
      const body = await res.json();
      expect(body.gitSha).toBe("abcdef1");
      expect(body.gitSha.length).toBe(7);
    } finally {
      if (originalSha !== undefined) {
        process.env.RAILWAY_GIT_COMMIT_SHA = originalSha;
      } else {
        delete process.env.RAILWAY_GIT_COMMIT_SHA;
      }
    }
  });

  it("falls back to NODE_ENV for environment when RAILWAY_ENVIRONMENT_NAME is not set", async () => {
    mockAuth.mockResolvedValue(adminSession());

    const originalRailwayEnv = process.env.RAILWAY_ENVIRONMENT_NAME;
    delete process.env.RAILWAY_ENVIRONMENT_NAME;

    try {
      const res = await GET(makeRequest() as never);
      const body = await res.json();

      // Should return NODE_ENV (typically "test" in vitest) or "local"
      expect(typeof body.environment).toBe("string");
      expect(body.environment.length).toBeGreaterThan(0);
    } finally {
      if (originalRailwayEnv !== undefined) {
        process.env.RAILWAY_ENVIRONMENT_NAME = originalRailwayEnv;
      } else {
        delete process.env.RAILWAY_ENVIRONMENT_NAME;
      }
    }
  });
});

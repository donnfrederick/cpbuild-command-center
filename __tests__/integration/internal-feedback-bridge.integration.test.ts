import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    feedbackReport: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
  },
}));

describe("GET /api/internal/feedback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 without Authorization header", async () => {
    process.env.FEEDBACK_BRIDGE_SECRET = "s3cret";
    const { GET } = await import("@/app/api/internal/feedback/route");
    const res = await GET(new Request("http://localhost/api/internal/feedback"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when Bearer token does not match", async () => {
    process.env.FEEDBACK_BRIDGE_SECRET = "s3cret";
    const { GET } = await import("@/app/api/internal/feedback/route");
    const res = await GET(
      new Request("http://localhost/api/internal/feedback", {
        headers: { Authorization: "Bearer wrong" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 with reports when authorized", async () => {
    process.env.FEEDBACK_BRIDGE_SECRET = "s3cret";
    const { db } = await import("@/lib/db");
    vi.mocked(db.feedbackReport.findMany).mockResolvedValueOnce([] as never);

    const { GET } = await import("@/app/api/internal/feedback/route");
    const res = await GET(
      new Request("http://localhost/api/internal/feedback", {
        headers: { Authorization: "Bearer s3cret" },
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

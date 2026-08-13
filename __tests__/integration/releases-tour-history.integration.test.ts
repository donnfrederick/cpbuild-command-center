/**
 * GET /api/releases/tour-history — isolated from automation/release-tour tests
 * so a single `vi.mock("@/lib/db")` factory is not overwritten mid-file.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    release: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

const HISTORY_RELEASE = {
  id: "release-1",
  title: "March 5 Release",
  prNumber: 88,
  branch: "feat/tour",
  environment: "production",
  mergedAt: new Date(),
  changes: [],
  tour: {
    id: "tour-1",
    steps: [{ order: 0, pageUrl: "/en/projects", title: "Projects" }],
  },
};

describe("GET /api/releases/tour-history", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/releases/tour-history/route");
    const res = await GET(new NextRequest("http://localhost/api/releases/tour-history"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with paginated releases when authenticated", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);
    vi.mocked(db.release.count).mockResolvedValueOnce(1 as never);
    vi.mocked(db.release.findMany).mockResolvedValueOnce([HISTORY_RELEASE] as never);

    const { GET } = await import("@/app/api/releases/tour-history/route");
    const res = await GET(new NextRequest("http://localhost/api/releases/tour-history"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("release-1");
    expect(body.total).toBe(1);
    expect(body.nextCursor).toBeNull();
  });

  it("returns nextCursor when more items exist beyond the limit", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);
    vi.mocked(db.release.count).mockResolvedValueOnce(15 as never);

    const items = Array.from({ length: 11 }, (_, i) => ({
      ...HISTORY_RELEASE,
      id: `release-${i}`,
    }));
    vi.mocked(db.release.findMany).mockResolvedValueOnce(items as never);

    const { GET } = await import("@/app/api/releases/tour-history/route");
    const res = await GET(new NextRequest("http://localhost/api/releases/tour-history?limit=10"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(10);
    expect(body.nextCursor).toBe("release-9");
  });

  it("returns empty list when no releases have tours", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);
    vi.mocked(db.release.count).mockResolvedValueOnce(0 as never);
    vi.mocked(db.release.findMany).mockResolvedValueOnce([] as never);

    const { GET } = await import("@/app/api/releases/tour-history/route");
    const res = await GET(new NextRequest("http://localhost/api/releases/tour-history"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(0);
    expect(body.total).toBe(0);
    expect(body.nextCursor).toBeNull();
  });
});

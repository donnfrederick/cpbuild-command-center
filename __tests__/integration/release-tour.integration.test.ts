import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    release: { findUnique: vi.fn(), findFirst: vi.fn() },
    releaseTour: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    releaseTourStep: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const STEP = {
  id: "step-1",
  tourId: "tour-1",
  order: 0,
  pageUrl: "/en/projects",
  elementSelector: "#projects-table",
  title: "Projects Page",
  description: "View and manage all your projects here.",
  voiceText: "View and manage all your projects here.",
};

const TOUR = {
  id: "tour-1",
  releaseId: "release-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  steps: [STEP],
};

const RELEASE = {
  id: "release-1",
  title: "March 5 — Audit fixes and release tour",
  prNumber: 999,
  branch: "feat/release-tour",
  environment: "all",
  mergedAt: new Date(),
  changes: [],
  createdAt: new Date(),
  tour: TOUR,
};

// ─── GET /api/releases/[id]/tour ──────────────────────────────────────────────

describe("GET /api/releases/[id]/tour", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/releases/[id]/tour/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when release does not exist", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.release.findUnique).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/releases/[id]/tour/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 404 when release exists but has no tour", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.release.findUnique).mockResolvedValueOnce({
      ...RELEASE,
      tour: null,
    } as never);

    const { GET } = await import("@/app/api/releases/[id]/tour/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no tour/i);
  });

  it("returns 200 with tour steps when release and tour exist", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);
    vi.mocked(db.release.findUnique).mockResolvedValueOnce(RELEASE as never);

    const { GET } = await import("@/app/api/releases/[id]/tour/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("tour-1");
    expect(body.steps).toHaveLength(1);
    expect(body.steps[0].pageUrl).toBe("/en/projects");
  });
});

// ─── PUT /api/releases/[id]/tour ──────────────────────────────────────────────

describe("PUT /api/releases/[id]/tour", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  const validBody = {
    steps: [
      {
        order: 0,
        pageUrl: "/en/projects",
        elementSelector: "#table",
        title: "Projects",
        description: "Manage projects here.",
        voiceText: "Manage projects here.",
      },
    ],
  };

  function makePutRequest(body: unknown) {
    return new Request("http://localhost/api/releases/release-1/tour", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { PUT } = await import("@/app/api/releases/[id]/tour/route");
    const res = await PUT(makePutRequest(validBody), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when role lacks MANAGE_ROLES permission", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const { PUT } = await import("@/app/api/releases/[id]/tour/route");
    const res = await PUT(makePutRequest(validBody), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 422 when steps array is empty", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);

    const { PUT } = await import("@/app/api/releases/[id]/tour/route");
    const res = await PUT(makePutRequest({ steps: [] }), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 when release does not exist", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.release.findUnique).mockResolvedValueOnce(null as never);

    const { PUT } = await import("@/app/api/releases/[id]/tour/route");
    const res = await PUT(makePutRequest(validBody), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 201 when creating a new tour", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.release.findUnique).mockResolvedValueOnce({ id: "release-1" } as never);
    vi.mocked(db.releaseTour.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(db.releaseTour.create).mockResolvedValueOnce(TOUR as never);

    const { PUT } = await import("@/app/api/releases/[id]/tour/route");
    const res = await PUT(makePutRequest(validBody), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("tour-1");
  });

  it("returns 200 when updating an existing tour", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.release.findUnique).mockResolvedValueOnce({ id: "release-1" } as never);
    vi.mocked(db.releaseTour.findUnique).mockResolvedValueOnce({ id: "tour-1" } as never);
    vi.mocked(db.$transaction).mockResolvedValueOnce([{ count: 1 }, TOUR] as never);

    const { PUT } = await import("@/app/api/releases/[id]/tour/route");
    const res = await PUT(makePutRequest(validBody), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("tour-1");
  });
});

// ─── DELETE /api/releases/[id]/tour ───────────────────────────────────────────

describe("DELETE /api/releases/[id]/tour", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { DELETE } = await import("@/app/api/releases/[id]/tour/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when role lacks MANAGE_ROLES permission", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const { DELETE } = await import("@/app/api/releases/[id]/tour/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for INSTALL_MANAGER role", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);

    const { DELETE } = await import("@/app/api/releases/[id]/tour/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when release does not exist", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.release.findUnique).mockResolvedValueOnce(null as never);

    const { DELETE } = await import("@/app/api/releases/[id]/tour/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 204 and calls deleteMany when tour exists", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.release.findUnique).mockResolvedValueOnce({ id: "release-1" } as never);
    vi.mocked(db.releaseTour.deleteMany).mockResolvedValueOnce({ count: 1 } as never);

    const { DELETE } = await import("@/app/api/releases/[id]/tour/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(204);
    expect(db.releaseTour.deleteMany).toHaveBeenCalledWith({ where: { releaseId: "release-1" } });
  });

  it("returns 204 even when no tour exists (deleteMany is a no-op)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.release.findUnique).mockResolvedValueOnce({ id: "release-1" } as never);
    vi.mocked(db.releaseTour.deleteMany).mockResolvedValueOnce({ count: 0 } as never);

    const { DELETE } = await import("@/app/api/releases/[id]/tour/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "release-1" }),
    });
    expect(res.status).toBe(204);
  });
});

// ─── GET /api/releases/latest-new ─────────────────────────────────────────────

describe("GET /api/releases/latest-new", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/releases/latest-new/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 204 when no release with a tour exists", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);
    vi.mocked(db.release.findFirst).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/releases/latest-new/route");
    const res = await GET();
    expect(res.status).toBe(204);
  });

  it("returns 200 with release and tour when a tour exists", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);
    vi.mocked(db.release.findFirst).mockResolvedValueOnce(RELEASE as never);

    const { GET } = await import("@/app/api/releases/latest-new/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.release.id).toBe("release-1");
    expect(body.tour.id).toBe("tour-1");
    expect(body.tour.steps).toHaveLength(1);
  });
});

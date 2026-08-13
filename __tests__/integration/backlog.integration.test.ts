import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/dev-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    backlogItem: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeGetRequest(path = "http://localhost/api/backlog") {
  return new NextRequest(path);
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/backlog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/backlog/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockSession = { user: { id: "user-1", role: "ADMIN" } };

// ── GET /api/backlog ───────────────────────────────────────────────────────────

describe("GET /api/backlog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ACTIVE items for the authenticated user", async () => {
    const { getSession } = await import("@/lib/dev-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue(mockSession as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(db.backlogItem.findMany).mockResolvedValue([
      { id: "item-1", title: "Add offline caching", notes: "For field use", source: "MANUAL", status: "ACTIVE", userId: "user-1", createdAt: new Date("2026-03-01"), updatedAt: new Date("2026-03-01") },
    ]);

    const { GET } = await import("@/app/api/backlog/route");
    const res = await GET();
    const body = await res.json() as { items: unknown[] };

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(db.backlogItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", status: "ACTIVE" } })
    );
  });

  it("returns 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const { GET } = await import("@/app/api/backlog/route");
    const res = await GET();

    expect(res.status).toBe(401);
  });
});

// ── POST /api/backlog ──────────────────────────────────────────────────────────

describe("POST /api/backlog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a MANUAL backlog item with title and notes", async () => {
    const { getSession } = await import("@/lib/dev-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue(mockSession as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(db.backlogItem.create).mockResolvedValue({
      id: "item-2",
      title: "Explore Procore API",
      notes: "Check their OAuth flow",
      source: "MANUAL",
      status: "ACTIVE",
      userId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { POST } = await import("@/app/api/backlog/route");
    const req = makePostRequest({ title: "Explore Procore API", notes: "Check their OAuth flow", source: "MANUAL" });
    const res = await POST(req);
    const body = await res.json() as { item: { title: string } };

    expect(res.status).toBe(201);
    expect(body.item.title).toBe("Explore Procore API");
  });

  it("creates an AI_SUGGESTED item with empty notes (null tolerance)", async () => {
    const { getSession } = await import("@/lib/dev-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue(mockSession as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(db.backlogItem.create).mockResolvedValue({
      id: "item-3",
      title: "Research BIM integration",
      notes: null,
      source: "AI_SUGGESTED",
      status: "ACTIVE",
      userId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { POST } = await import("@/app/api/backlog/route");
    const req = makePostRequest({ title: "Research BIM integration", notes: "", source: "AI_SUGGESTED" });
    const res = await POST(req);

    expect(res.status).toBe(201);
  });

  it("returns 400 when title is missing", async () => {
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue(mockSession as Awaited<ReturnType<typeof getSession>>);

    const { POST } = await import("@/app/api/backlog/route");
    const req = makePostRequest({ title: "", source: "MANUAL" });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const { POST } = await import("@/app/api/backlog/route");
    const req = makePostRequest({ title: "Something", source: "MANUAL" });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/backlog/[id] ────────────────────────────────────────────────────

describe("PATCH /api/backlog/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dismisses an item owned by the authenticated user", async () => {
    const { getSession } = await import("@/lib/dev-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue(mockSession as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(db.backlogItem.findUnique).mockResolvedValue({
      id: "item-1",
      userId: "user-1",
      title: "Add offline caching",
      notes: null,
      source: "MANUAL",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.backlogItem.update).mockResolvedValue({
      id: "item-1",
      title: "Add offline caching",
      notes: null,
      source: "MANUAL",
      status: "DISMISSED",
      userId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { PATCH } = await import("@/app/api/backlog/[id]/route");
    const req = makePatchRequest("item-1", { status: "DISMISSED" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "item-1" }) });
    const body = await res.json() as { item: { status: string } };

    expect(res.status).toBe(200);
    expect(body.item.status).toBe("DISMISSED");
  });

  it("returns 403 when item belongs to another user", async () => {
    const { getSession } = await import("@/lib/dev-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue(mockSession as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(db.backlogItem.findUnique).mockResolvedValue({
      id: "item-2",
      userId: "other-user",
      title: "Someone else's item",
      notes: null,
      source: "MANUAL",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { PATCH } = await import("@/app/api/backlog/[id]/route");
    const req = makePatchRequest("item-2", { status: "DISMISSED" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "item-2" }) });

    expect(res.status).toBe(403);
  });

  it("returns 404 when item does not exist", async () => {
    const { getSession } = await import("@/lib/dev-session");
    const { db } = await import("@/lib/db");

    vi.mocked(getSession).mockResolvedValue(mockSession as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(db.backlogItem.findUnique).mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/backlog/[id]/route");
    const req = makePatchRequest("nonexistent", { status: "DISMISSED" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid status value", async () => {
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue(mockSession as Awaited<ReturnType<typeof getSession>>);

    const { PATCH } = await import("@/app/api/backlog/[id]/route");
    const req = makePatchRequest("item-1", { status: "DELETED" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "item-1" }) });

    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/backlog/[id]/route");
    const req = makePatchRequest("item-1", { status: "DISMISSED" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "item-1" }) });

    expect(res.status).toBe(401);
  });
});

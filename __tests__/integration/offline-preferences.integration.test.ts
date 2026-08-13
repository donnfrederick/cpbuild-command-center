/**
 * Integration tests for GET/PUT /api/offline/preferences
 *
 * The DB and auth session are fully mocked — this validates the handler
 * logic (auth check, validation, upsert, response shape) without I/O.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockSession = {
  user: { id: "user-1", name: "Phil", email: "phil@example.com", role: "ADMIN" as const },
};

vi.mock("@/lib/dev-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    offlinePreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    offlineProjectSync: {
      findMany: vi.fn(),
    },
  },
}));

import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { GET, PUT } from "@/app/api/offline/preferences/route";

const mockAuth = vi.mocked(getSession);
const mockFindUnique = vi.mocked(db.offlinePreference.findUnique);
const mockUpsert = vi.mocked(db.offlinePreference.upsert);
const mockSyncFindMany = vi.mocked(db.offlineProjectSync.findMany);

// ── Helper ─────────────────────────────────────────────────────────────────

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/offline/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── GET ────────────────────────────────────────────────────────────────────

describe("GET /api/offline/preferences", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(mockSession as never);
    mockFindUnique.mockResolvedValue(null);
    mockSyncFindMany.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns empty modules when no preference exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.modules).toEqual([]);
    expect(body.syncedAt).toBeNull();
  });

  it("returns saved modules when preference exists", async () => {
    mockFindUnique.mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: ["team-directory"],
      syncedAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
    } as never);

    const res = await GET();
    const body = await res.json();
    expect(body.modules).toContain("team-directory");
    expect(body.syncedAt).toBeTruthy();
  });

  it("always includes availableModules in response", async () => {
    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body.availableModules)).toBe(true);
    expect(body.availableModules.length).toBeGreaterThan(0);
  });
});

// ── PUT ────────────────────────────────────────────────────────────────────

describe("PUT /api/offline/preferences", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue(mockSession as never);
    mockSyncFindMany.mockResolvedValue([]);
    mockUpsert.mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: ["my-profile", "team-directory"],
      syncedAt: null,
      updatedAt: new Date(),
    } as never);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PUT(makeRequest({ modules: [] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    const res = await PUT(makeRequest({ modules: "not-an-array" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost/api/offline/preferences", {
      method: "PUT",
      body: "not json",
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("saves valid module list and returns it", async () => {
    const res = await PUT(makeRequest({ modules: ["team-directory"] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.modules).toContain("my-profile"); // always included
    expect(body.modules).toContain("team-directory");
  });

  it("silently drops unavailable module IDs", async () => {
    mockUpsert.mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: ["my-profile"],
      syncedAt: null,
      updatedAt: new Date(),
    } as never);

    const res = await PUT(makeRequest({ modules: ["projects"] })); // not available yet
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modules).not.toContain("projects");
  });

  it("always includes my-profile even if not in request", async () => {
    const [, upsertCall] = mockUpsert.mock.calls[0] ?? [];
    const res = await PUT(makeRequest({ modules: [] }));
    await res.json();
    const upsertArg = mockUpsert.mock.calls[0];
    expect(upsertArg).toBeDefined();
    // The create/update data should always include my-profile
    const data = (upsertArg[0] as { update: { modules: string[] } }).update;
    expect(data.modules).toContain("my-profile");
    void upsertCall;
  });
});

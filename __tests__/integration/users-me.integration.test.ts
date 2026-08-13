import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/users/me/route";

vi.mock("@/lib/dev-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";

const mockGetSession = vi.mocked(getSession);
const mockFindUnique = vi.mocked(db.user.findUnique);
const mockUpdate = vi.mocked(db.user.update);

const authedSession = { user: { id: "user-1", email: "phil@test.com", name: "Phil", role: "ADMIN" } };
const dbUser = { id: "user-1" };

describe("PATCH /api/users/me", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const req = new Request("http://localhost/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ name: "Phil" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 when email not found in DB (e.g. dev-user synthetic session)", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    mockFindUnique.mockResolvedValueOnce(null);
    const req = new Request("http://localhost/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ name: "Phil" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });

  it("updates name and returns 200 with trimmed name", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    mockFindUnique.mockResolvedValueOnce(dbUser as never);
    mockUpdate.mockResolvedValueOnce({ name: "Phil Amour" } as never);
    const req = new Request("http://localhost/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ name: "  Phil Amour  " }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string };
    expect(body.name).toBe("Phil Amour");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Phil Amour" } })
    );
  });

  it("looks up user by id first (reliable for all real auth sessions)", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    mockFindUnique.mockResolvedValueOnce(dbUser as never);
    mockUpdate.mockResolvedValueOnce({ name: "Phil Amour" } as never);
    const req = new Request("http://localhost/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ name: "Phil Amour" }),
    });
    await PATCH(req);
    // Handler tries id first; email fallback only fires when id lookup returns null
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } })
    );
  });

  it("returns 400 for empty name", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    const req = new Request("http://localhost/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ name: "" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for name exceeding 100 characters", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    const req = new Request("http://localhost/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ name: "A".repeat(101) }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    const req = new Request("http://localhost/api/users/me", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("accepts name for session with null initial name", async () => {
    const sessionWithNullName = { user: { id: "user-3", email: "new@test.com", name: null, role: "MEMBER" } };
    mockGetSession.mockResolvedValueOnce(sessionWithNullName as Awaited<ReturnType<typeof getSession>>);
    mockFindUnique.mockResolvedValueOnce(dbUser as never);
    mockUpdate.mockResolvedValueOnce({ name: "New User" } as never);
    const req = new Request("http://localhost/api/users/me", {
      method: "PATCH",
      body: JSON.stringify({ name: "New User" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
  });
});

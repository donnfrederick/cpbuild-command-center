import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "@/app/api/users/me/agent-identity/route";

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
const memberSession = { user: { id: "user-2", email: "member@test.com", name: "Member", role: "MEMBER" } };
const dbUser = { id: "user-1" };

describe("GET /api/users/me/agent-identity", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for roles without ACCESS_DEVTOOLS (e.g. MEMBER)", async () => {
    mockGetSession.mockResolvedValueOnce(memberSession as Awaited<ReturnType<typeof getSession>>);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("looks up by id first, returns agent identity for ADMIN", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    mockFindUnique.mockResolvedValueOnce({
      agentName: "Max", agentCallsign: "MAX", agentMission: "Build fast.",
    } as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { agentName: string };
    expect(body.agentName).toBe("Max");
    expect(body.agentCallsign).toBe("MAX");
    // Handler tries id first; email fallback only fires when id lookup returns null
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } })
    );
  });

  it("returns null fields when user not in DB (graceful fallback)", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await GET();
    const body = await res.json() as { agentName: null };
    expect(body.agentName).toBeNull();
  });
});

describe("PATCH /api/users/me/agent-identity", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const req = new Request("http://localhost/api/users/me/agent-identity", {
      method: "PATCH",
      body: JSON.stringify({ agentName: "Max", agentCallsign: "MAX", agentMission: "" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for roles without ACCESS_DEVTOOLS (e.g. MEMBER)", async () => {
    mockGetSession.mockResolvedValueOnce(memberSession as Awaited<ReturnType<typeof getSession>>);
    const req = new Request("http://localhost/api/users/me/agent-identity", {
      method: "PATCH",
      body: JSON.stringify({ agentName: "Max", agentCallsign: "MAX", agentMission: "" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });

  it("updates agent identity and auto-uppercases callsign", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    mockFindUnique.mockResolvedValueOnce(dbUser as never);
    mockUpdate.mockResolvedValueOnce({ agentName: "Max", agentCallsign: "MAX", agentMission: "Build fast." } as never);
    const req = new Request("http://localhost/api/users/me/agent-identity", {
      method: "PATCH",
      body: JSON.stringify({ agentName: "Max", agentCallsign: "max", agentMission: "Build fast." }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ agentCallsign: "MAX" }) })
    );
  });

  it("accepts empty fields and sets them to null", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    mockFindUnique.mockResolvedValueOnce(dbUser as never);
    mockUpdate.mockResolvedValueOnce({ agentName: null, agentCallsign: null, agentMission: null } as never);
    const req = new Request("http://localhost/api/users/me/agent-identity", {
      method: "PATCH",
      body: JSON.stringify({ agentName: "", agentCallsign: "", agentMission: "" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { agentName: null, agentCallsign: null, agentMission: null } })
    );
  });

  it("returns 404 when email not in DB (e.g. dev-user synthetic session)", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    mockFindUnique.mockResolvedValueOnce(null);
    const req = new Request("http://localhost/api/users/me/agent-identity", {
      method: "PATCH",
      body: JSON.stringify({ agentName: "Max", agentCallsign: "MAX", agentMission: "" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid JSON", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    const req = new Request("http://localhost/api/users/me/agent-identity", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("rejects agentName longer than 40 chars", async () => {
    mockGetSession.mockResolvedValueOnce(authedSession as Awaited<ReturnType<typeof getSession>>);
    const req = new Request("http://localhost/api/users/me/agent-identity", {
      method: "PATCH",
      body: JSON.stringify({ agentName: "A".repeat(41), agentCallsign: "", agentMission: "" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});

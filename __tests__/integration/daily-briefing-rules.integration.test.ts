import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks must be defined before imports ──────────────────────────────────────

const mockGetSession = vi.fn();
vi.mock("@/lib/dev-session", () => ({ getSession: () => mockGetSession() }));

const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    briefingRule: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { GET, POST } from "@/app/api/daily-briefing/rules/route";
import { PATCH, DELETE } from "@/app/api/daily-briefing/rules/[id]/route";

// ── Auth fixtures ─────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  user: { id: "u1", role: "ADMIN", email: "phil@cpbuild.com", name: "Phil" },
};

const MEMBER_SESSION = {
  user: { id: "u2", role: "MEMBER", email: "member@cpbuild.com", name: "Member" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/daily-briefing/rules", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function idRequest(method: string, id: string, body?: unknown) {
  return new Request(`http://localhost/api/daily-briefing/rules/${id}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const exampleRule = {
  id: "rule_1",
  text: "Never estimate user acquisition ROI",
  source: "MANUAL",
  active: true,
  createdAt: new Date("2026-03-11T08:00:00Z"),
  createdBy: "u1",
  updatedAt: new Date("2026-03-11T08:00:00Z"),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/daily-briefing/rules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-ADMIN (lacks VIEW_MORNING_BRIEFING permission)", async () => {
    mockGetSession.mockResolvedValue(MEMBER_SESSION);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns all rules", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([exampleRule]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rules).toHaveLength(1);
    expect(body.rules[0].text).toBe("Never estimate user acquisition ROI");
  });
});

describe("POST /api/daily-briefing/rules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(jsonRequest("POST", { text: "A rule" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for empty text", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(jsonRequest("POST", { text: "" }));
    expect(res.status).toBe(400);
  });

  it("creates a rule and returns 201", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockCreate.mockResolvedValue(exampleRule);
    const res = await POST(jsonRequest("POST", { text: "Never estimate user acquisition ROI" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rule.text).toBe("Never estimate user acquisition ROI");
  });
});

describe("PATCH /api/daily-briefing/rules/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when rule does not exist", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue(null);
    const res = await PATCH(idRequest("PATCH", "rule_missing", { active: false }), {
      params: Promise.resolve({ id: "rule_missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("toggles active state", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue(exampleRule);
    mockUpdate.mockResolvedValue({ ...exampleRule, active: false });
    const res = await PATCH(idRequest("PATCH", "rule_1", { active: false }), {
      params: Promise.resolve({ id: "rule_1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rule.active).toBe(false);
  });

  it("updates text", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue(exampleRule);
    const updated = { ...exampleRule, text: "Updated rule text" };
    mockUpdate.mockResolvedValue(updated);
    const res = await PATCH(idRequest("PATCH", "rule_1", { text: "Updated rule text" }), {
      params: Promise.resolve({ id: "rule_1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rule.text).toBe("Updated rule text");
  });
});

describe("DELETE /api/daily-briefing/rules/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when rule does not exist", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue(null);
    const res = await DELETE(idRequest("DELETE", "rule_missing"), {
      params: Promise.resolve({ id: "rule_missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("deletes the rule and returns 200", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockFindUnique.mockResolvedValue(exampleRule);
    mockDelete.mockResolvedValue(exampleRule);
    const res = await DELETE(idRequest("DELETE", "rule_1"), {
      params: Promise.resolve({ id: "rule_1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });
});

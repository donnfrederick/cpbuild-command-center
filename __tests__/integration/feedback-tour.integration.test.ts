import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockReportFindUnique = vi.fn();
const mockTourUpsert = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    feedbackReport: {
      findUnique: (...args: unknown[]) => mockReportFindUnique(...args),
    },
    feedbackTour: {
      upsert: (...args: unknown[]) => mockTourUpsert(...args),
    },
  },
}));

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

// ── Import handlers after mocks ────────────────────────────────────────────────

const { GET, PUT } = await import("@/app/api/feedback/[id]/tour/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession() {
  return { user: { id: "admin-1", email: "admin@test.com", name: "Admin", role: "ADMIN" } };
}

function memberSession() {
  return { user: { id: "member-1", email: "member@test.com", name: "Member", role: "MEMBER" } };
}

function makeRequest(method: string, id: string, body?: unknown) {
  return new Request(`http://localhost/api/feedback/${id}/tour`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const VALID_STEP = {
  order: 0,
  pageUrl: "/en/projects",
  elementSelector: "#upload-button",
  title: "Click upload",
  description: "Click the upload button to replace the file.",
  voiceText: "Here is the upload button.",
};

const SAMPLE_TOUR = {
  id: "tour-1",
  feedbackId: "fb-1",
  steps: [VALID_STEP],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GET /api/feedback/[id]/tour", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest("GET", "fb-1"), { params: Promise.resolve({ id: "fb-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when feedback report does not exist", async () => {
    mockAuth.mockResolvedValue(memberSession());
    mockReportFindUnique.mockResolvedValue(null);
    const res = await GET(makeRequest("GET", "fb-x"), { params: Promise.resolve({ id: "fb-x" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when feedback is not resolved", async () => {
    mockAuth.mockResolvedValue(memberSession());
    mockReportFindUnique.mockResolvedValue({ id: "fb-1", status: "OPEN", tour: null });
    const res = await GET(makeRequest("GET", "fb-1"), { params: Promise.resolve({ id: "fb-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 when feedback is resolved but has no tour", async () => {
    mockAuth.mockResolvedValue(memberSession());
    mockReportFindUnique.mockResolvedValue({ id: "fb-1", status: "RESOLVED", tour: null });
    const res = await GET(makeRequest("GET", "fb-1"), { params: Promise.resolve({ id: "fb-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns tour steps for a resolved feedback report", async () => {
    mockAuth.mockResolvedValue(memberSession());
    mockReportFindUnique.mockResolvedValue({
      id: "fb-1",
      status: "RESOLVED",
      tour: SAMPLE_TOUR,
    });
    const res = await GET(makeRequest("GET", "fb-1"), { params: Promise.resolve({ id: "fb-1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.steps).toHaveLength(1);
    expect(data.steps[0].title).toBe("Click upload");
  });
});

describe("PUT /api/feedback/[id]/tour", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PUT(makeRequest("PUT", "fb-1", { steps: [VALID_STEP] }), {
      params: Promise.resolve({ id: "fb-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    mockAuth.mockResolvedValue(memberSession());
    const res = await PUT(makeRequest("PUT", "fb-1", { steps: [VALID_STEP] }), {
      params: Promise.resolve({ id: "fb-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when steps array is empty", async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await PUT(makeRequest("PUT", "fb-1", { steps: [] }), {
      params: Promise.resolve({ id: "fb-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when a step is missing required fields", async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await PUT(
      makeRequest("PUT", "fb-1", {
        steps: [{ order: 0, pageUrl: "/en/projects" }],
      }),
      { params: Promise.resolve({ id: "fb-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the feedback report does not exist", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockReportFindUnique.mockResolvedValue(null);
    const res = await PUT(makeRequest("PUT", "fb-x", { steps: [VALID_STEP] }), {
      params: Promise.resolve({ id: "fb-x" }),
    });
    expect(res.status).toBe(404);
  });

  it("creates or replaces the tour for a valid admin request", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockReportFindUnique.mockResolvedValue({ id: "fb-1" });
    mockTourUpsert.mockResolvedValue(SAMPLE_TOUR);

    const res = await PUT(makeRequest("PUT", "fb-1", { steps: [VALID_STEP] }), {
      params: Promise.resolve({ id: "fb-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockTourUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { feedbackId: "fb-1" },
        create: expect.objectContaining({ feedbackId: "fb-1" }),
        update: expect.objectContaining({ steps: expect.any(Array) }),
      })
    );
  });

  it("accepts a step with a null/empty elementSelector (no highlight)", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockReportFindUnique.mockResolvedValue({ id: "fb-1" });
    mockTourUpsert.mockResolvedValue({ ...SAMPLE_TOUR });

    const stepNoSelector = { ...VALID_STEP, elementSelector: "" };
    const res = await PUT(makeRequest("PUT", "fb-1", { steps: [stepNoSelector] }), {
      params: Promise.resolve({ id: "fb-1" }),
    });
    expect(res.status).toBe(200);
  });

  it("accepts a step with no voiceText (silent step)", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockReportFindUnique.mockResolvedValue({ id: "fb-1" });
    mockTourUpsert.mockResolvedValue({ ...SAMPLE_TOUR });

    const silentStep = { ...VALID_STEP, voiceText: "" };
    const res = await PUT(makeRequest("PUT", "fb-1", { steps: [silentStep] }), {
      params: Promise.resolve({ id: "fb-1" }),
    });
    expect(res.status).toBe(200);
  });
});

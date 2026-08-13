import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    inspectionSubmission: { findUnique: vi.fn() },
    projectRow: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/pdf/inspection-submission-pdf", () => ({
  buildInspectionSubmissionPdf: vi.fn(),
}));
vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectById: vi.fn(),
}));

import { POST } from "@/app/api/inspection-submissions/[id]/export-pdf/route";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { buildInspectionSubmissionPdf } from "@/lib/pdf/inspection-submission-pdf";
import { enrichProjectById } from "@/lib/project-unifier-merge";

const mockGetSession = vi.mocked(getSession);
const mockVis = vi.mocked(enforceProjectReadVisibility);
const mockFind = vi.mocked(db.inspectionSubmission.findUnique);
const mockRowFind = vi.mocked(db.projectRow.findUnique);
const mockPdf = vi.mocked(buildInspectionSubmissionPdf);

const mockEnrich = vi.mocked(enrichProjectById);

const SESSION = {
  user: { id: "u1", email: "a@test.com", role: "MEMBER", name: "A", specialPermissions: [] as string[] },
};

const BASE_SUB = {
  id: "sub-1",
  formId: "form-1",
  templateSnapshot: {
    name: "Clear check",
    description: "",
    status: "published",
    level: "scope",
    scopeTypeCodes: [],
    category: "CLEAR_INSPECTION",
    sections: [
      {
        id: "s1",
        title: "Checks",
        questions: [
          {
            id: "q1",
            title: "OK?",
            description: "",
            responseType: "PASS_FAIL",
            required: true,
            photoRequired: false,
            deficiencyPhotoRequired: false,
            options: [],
          },
        ],
      },
    ],
  },
  projectId: "proj-1",
  unitId: "unit-row-1",
  scopeRowId: "scope-1",
  scopeTypeCode: "CAB",
  submittedAt: new Date("2026-05-01T12:00:00Z"),
  clearInspection: {
    inspectedBy: { name: "Inspector Pat" },
  },
  outcome: "PASS" as const,
  deficiencyCount: 0,
  payload: { q1: { choice: "pass" } },
  source: "FORM" as const,
};

describe("POST /api/inspection-submissions/[id]/export-pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(SESSION as never);
    mockVis.mockResolvedValue(null);
    mockEnrich.mockResolvedValue({
      id: "proj-1",
      projectName: "Test Project",
    } as Awaited<ReturnType<typeof enrichProjectById>>);
    mockPdf.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
    mockRowFind.mockResolvedValue({
      building: "North",
      level: "2",
      unit: "205",
    } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(new NextRequest("http://localhost/api/inspection-submissions/x/export-pdf", { method: "POST" }), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("returns 404 when submission is missing", async () => {
    mockFind.mockResolvedValue(null);
    const res = await POST(new NextRequest("http://localhost/api/inspection-submissions/missing/export-pdf", { method: "POST" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
    expect(mockPdf).not.toHaveBeenCalled();
  });

  it("returns 403/404 when project visibility blocks read", async () => {
    mockFind.mockResolvedValue({ ...BASE_SUB } as never);
    const block = new Response("nope", { status: 403 });
    mockVis.mockResolvedValue(block as never);
    const res = await POST(new NextRequest("http://localhost/api/inspection-submissions/sub-1/export-pdf", { method: "POST" }), {
      params: Promise.resolve({ id: "sub-1" }),
    });
    expect(res.status).toBe(403);
    expect(mockPdf).not.toHaveBeenCalled();
  });

  it("returns PDF when authorized", async () => {
    mockFind.mockResolvedValue({ ...BASE_SUB } as never);
    const res = await POST(new NextRequest("http://localhost/api/inspection-submissions/sub-1/export-pdf", { method: "POST" }), {
      params: Promise.resolve({ id: "sub-1" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(mockPdf).toHaveBeenCalledOnce();
    const call = mockPdf.mock.calls[0][0];
    expect(call.projectName).toBe("Test Project");
    expect(call.outcome).toBe("PASS");
    expect(call.locationLine).toBe("North · 2 · 205");
  });

  it("forwards shareOnlyFailedItems to the PDF builder", async () => {
    mockFind.mockResolvedValue({ ...BASE_SUB } as never);
    const res = await POST(
      new NextRequest("http://localhost/api/inspection-submissions/sub-1/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareOnlyFailedItems: true }),
      }),
      { params: Promise.resolve({ id: "sub-1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({ shareOnlyFailedItems: true }),
    );
  });
});

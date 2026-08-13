import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: { inspectionSubmission: { findMany: vi.fn() } },
}));
vi.mock("@/lib/inspections/hydrate-inspection-submission-view", () => ({
  hydrateInspectionSubmissionView: vi.fn(),
}));
vi.mock("@/lib/inspections/resolve-submission-submitter", () => ({
  enrichSubmissionsWithActivitySubmitters: vi.fn(async (_db: unknown, subs: unknown[]) => subs),
  attachSubmitterFromSession: vi.fn((sub: unknown) => sub),
}));
vi.mock("@/lib/pdf/inspection-report-pdf", () => ({
  buildInspectionReportPdf: vi.fn(),
  categoryLabelFromTemplate: vi.fn().mockReturnValue("Clear"),
}));

import { POST } from "@/app/api/projects/[id]/inspections-report/export-pdf/route";
import { MAX_INSPECTION_REPORT_EXPORT_SUBMISSIONS } from "@/lib/inspections/inspection-export-limits";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { hydrateInspectionSubmissionView } from "@/lib/inspections/hydrate-inspection-submission-view";
import { buildInspectionReportPdf } from "@/lib/pdf/inspection-report-pdf";

const mockGetSession = vi.mocked(getSession);
const mockVis = vi.mocked(enforceProjectReadVisibility);
const mockFindMany = vi.mocked(db.inspectionSubmission.findMany);
const mockHydrate = vi.mocked(hydrateInspectionSubmissionView);
const mockBuildPdf = vi.mocked(buildInspectionReportPdf);

const SESSION = {
  user: { id: "u1", email: "a@test.com", role: "MEMBER", name: "A", specialPermissions: [] as string[] },
};

function postExport(body: unknown, projectId = "proj-1") {
  return POST(
    new NextRequest(`http://localhost/api/projects/${projectId}/inspections-report/export-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: projectId }) },
  );
}

describe("POST /api/projects/[id]/inspections-report/export-pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(SESSION as Awaited<ReturnType<typeof getSession>>);
    mockVis.mockResolvedValue(null);
    mockBuildPdf.mockResolvedValue(Buffer.from("%PDF-mock"));
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await postExport({ submissionIds: ["sub-1"] });
    expect(res.status).toBe(401);
  });

  it("returns 404 when submissionIds is empty", async () => {
    const res = await postExport({ submissionIds: [] });
    expect(res.status).toBe(404);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns 400 when submissionIds exceeds export cap", async () => {
    const tooMany = Array.from(
      { length: MAX_INSPECTION_REPORT_EXPORT_SUBMISSIONS + 1 },
      (_, i) => `sub-${i}`,
    );
    const res = await postExport({ submissionIds: tooMany });
    expect(res.status).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns 400 when records metadata does not match submissionIds", async () => {
    const res = await postExport({
      submissionIds: ["sub-1", "sub-2"],
      records: [
        {
          submissionId: "sub-1",
          seqNumber: 1,
          scopeTypeName: "Cabinetry",
          unit: "101",
          building: "A",
          level: "L2",
          area: "",
          phase: "",
          imName: null,
          installTeamName: null,
          attemptLabel: "1st attempt",
          totalDeficiencies: 0,
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns PDF when submissions exist", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "sub-1",
        projectId: "proj-1",
        formId: "form-1",
        formVersionId: "fv-1",
        templateSnapshot: { sections: [] },
        payload: {},
        source: "FORM",
        scopeTypeCode: "CAB",
        submittedAt: new Date("2026-05-20T09:30:00Z"),
        clearInspection: {
          inspectedBy: { name: "Inspector" },
        },
        outcome: "FAIL",
        deficiencyCount: 1,
        form: {
          id: "form-1",
          name: "Clear Inspection",
          category: "CLEAR",
          level: "scope",
          scopeTypeCodes: ["CAB"],
          description: null,
        },
      },
    ] as Awaited<ReturnType<typeof mockFindMany>>);

    mockHydrate.mockResolvedValueOnce({
      templateSnapshot: { sections: [] },
      payload: { "q-1": { choice: "pass" } },
    });

    const res = await postExport({
      submissionIds: ["sub-1"],
      projectName: "Test Project",
      filterSummary: "All",
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(mockBuildPdf).toHaveBeenCalledOnce();
  });
});

import { describe, it, expect, vi } from "vitest";
import type { FormTemplate } from "@/components/forms/formTypes";
import { buildInspectionReportHtml } from "@/lib/pdf/inspection-report-pdf";

vi.mock("@/lib/pdf/inspection-submission-pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pdf/inspection-submission-pdf")>();
  return {
    ...actual,
    prefetchInspectionPayloadImages: vi.fn().mockResolvedValue(new Map()),
    buildInspectionRecordBodyInner: vi.fn().mockReturnValue('<div class="q"><p class="answer">Pass</p></div>'),
  };
});

const MINIMAL_TEMPLATE: FormTemplate = {
  id: "form-1",
  name: "Clear Inspection",
  description: "",
  status: "published",
  level: "scope",
  scopeTypeCodes: ["CAB"],
  category: "CLEAR",
  sections: [
    {
      id: "sec-1",
      title: "General",
      description: "",
      questions: [
        {
          id: "q-1",
          title: "Is the unit ready?",
          responseType: "PASS_FAIL",
          required: true,
        },
      ],
    },
  ],
};

describe("buildInspectionReportHtml", () => {
  it("includes cover page, filter summary, and one record header per submission", async () => {
    const html = await buildInspectionReportHtml({
      projectName: "9Ten West (TEST)",
      filterSummary: "Failed only · Cabinetry",
      exportedAt: new Date("2026-05-22T12:00:00Z"),
      records: [
        {
          submissionId: "sub-1",
          seqNumber: 3,
          scopeTypeName: "Cabinetry",
          unit: "101",
          building: "A",
          level: "L2",
          area: "Kitchen",
          phase: "Phase 1",
          imName: "Alex IM",
          installTeamName: "Acme Cabinets",
          attemptLabel: "1st attempt",
          totalDeficiencies: 2,
          formName: "Clear Inspection",
          categoryLabel: "Clear",
          outcome: "FAIL",
          submittedAt: new Date("2026-05-20T09:30:00Z"),
          submittedBy: "Inspector One",
          template: MINIMAL_TEMPLATE,
          payload: { "q-1": { choice: "fail" } },
        },
      ],
    });

    expect(html).toContain("Inspections Report");
    expect(html).toContain("9Ten West (TEST)");
    expect(html).toContain("Failed only · Cabinetry");
    expect(html).toContain("1 inspection");
    expect(html).toContain("#3");
    expect(html).toContain("Cabinetry");
    expect(html).toContain("1st attempt");
    expect(html).toContain("2 deficiencies");
    expect(html).toContain("Inspector One");
  });

  it("uses Project Level Form Submissions title for project_forms export", async () => {
    const html = await buildInspectionReportHtml({
      projectName: "348 South Temple",
      filterSummary: "Project forms — 3 project forms",
      exportedAt: new Date("2026-06-18T14:59:00Z"),
      reportKind: "project_forms",
      records: [
        {
          submissionId: "sub-doc",
          seqNumber: 1,
          scopeTypeName: "Project",
          unit: "—",
          building: "",
          level: "",
          area: "",
          phase: "",
          imName: null,
          installTeamName: null,
          attemptLabel: "Submitted",
          totalDeficiencies: 0,
          formName: "Daily Update",
          categoryLabel: "Other",
          outcome: "COMPLETE",
          submittedAt: new Date("2026-06-18T14:51:00Z"),
          submittedBy: "Phil Salter",
          template: {
            ...MINIMAL_TEMPLATE,
            name: "Daily Update",
            category: "OTHER",
            formPurpose: "documentation",
          },
          payload: { "q-1": { choice: "no" } },
        },
      ],
    });

    expect(html).toContain("Project Level Form Submissions");
    expect(html).not.toContain("Inspections Report");
    expect(html).toContain("1 submission");
    expect(html).toContain("Submitted by: Phil Salter");
    expect(html).not.toContain("Inspector:");
    expect(html).not.toContain("Other ·");
    expect(html).not.toContain("No deficiencies");
  });

  it("omits passing inspections entirely when shareOnlyFailedItems is enabled", async () => {
    const { buildInspectionRecordBodyInner } = await import("@/lib/pdf/inspection-submission-pdf");
    vi.mocked(buildInspectionRecordBodyInner)
      .mockReturnValueOnce('<div class="q"><p class="answer">Fail</p></div>')
      .mockReturnValueOnce('<p class="muted">No failed items in this record.</p>');

    const html = await buildInspectionReportHtml({
      projectName: "Test Project",
      filterSummary: "Failed items only",
      exportedAt: new Date("2026-06-27T12:00:00Z"),
      shareOnlyFailedItems: true,
      records: [
        {
          submissionId: "sub-fail",
          seqNumber: 1,
          scopeTypeName: "Tile",
          unit: "101",
          building: "A",
          level: "1",
          area: "",
          phase: "",
          imName: null,
          installTeamName: null,
          attemptLabel: "1st attempt",
          totalDeficiencies: 1,
          formName: "Clear Inspection",
          categoryLabel: "Clear",
          outcome: "FAIL",
          submittedAt: new Date("2026-06-20T09:30:00Z"),
          submittedBy: "Inspector One",
          template: MINIMAL_TEMPLATE,
          payload: { "q-1": { choice: "fail" } },
        },
        {
          submissionId: "sub-pass",
          seqNumber: 2,
          scopeTypeName: "Tile",
          unit: "102",
          building: "A",
          level: "1",
          area: "",
          phase: "",
          imName: null,
          installTeamName: null,
          attemptLabel: "1st attempt",
          totalDeficiencies: 0,
          formName: "Clear Inspection",
          categoryLabel: "Clear",
          outcome: "PASS",
          submittedAt: new Date("2026-06-21T09:30:00Z"),
          submittedBy: "Inspector Two",
          template: MINIMAL_TEMPLATE,
          payload: { "q-1": { choice: "pass" } },
        },
      ],
    });

    expect(html).toContain("1 inspection");
    expect(html).toContain("#1");
    expect(html).not.toContain("#2");
    expect(html).not.toContain("Inspector Two");
    expect(html).not.toContain("No failed items in this record.");
  });
});

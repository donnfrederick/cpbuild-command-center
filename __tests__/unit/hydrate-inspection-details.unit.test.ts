import { describe, it, expect, vi, beforeEach } from "vitest";
import { hydrateInspectionSubmissionDetails } from "@/lib/field-daily-report/hydrate-inspection-details";
import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

vi.mock("@/lib/db", () => ({
  db: {
    inspectionSubmission: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/inspections/hydrate-inspection-submission-view", () => ({
  hydrateInspectionSubmissionView: vi.fn(),
}));

import { db } from "@/lib/db";
import { hydrateInspectionSubmissionView } from "@/lib/inspections/hydrate-inspection-submission-view";

const mockFindMany = vi.mocked(db.inspectionSubmission.findMany);
const mockHydrateView = vi.mocked(hydrateInspectionSubmissionView);

const baseSnapshot: FieldDailyReportProjectSnapshot = {
  progress: {
    statusChangeCount: 0,
    installCompleteCount: 0,
    installCompleteQtyToday: 0,
    inspectionSubmittedCount: 1,
    issuesCreatedCount: 0,
    issuesResolvedCount: 0,
    observationsCreatedCount: 0,
  },
  statusUpdates: { summaryGroups: [], sourceEvents: [] },
  subcontractors: { summaryGroups: [] },
  teamsOnSite: { summaryGroups: [] },
  inspections: {
    summaryGroups: [
      {
        id: "fail",
        outcome: "FAIL",
        items: [
          {
            itemKey: "insp-1",
            activityLogId: "log-1",
            createdAt: "2026-07-17T12:00:00.000Z",
            headline: "Clear Inspection",
            locationLabel: "Unit 119",
            badge: "FAIL",
            submissionId: "sub-1",
          },
        ],
      },
    ],
  },
  issues: { items: [] },
  observations: { items: [] },
};

describe("hydrateInspectionSubmissionDetails()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates relational stub submissions before building PDF detail blocks", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        formId: "form-1",
        formVersionId: "fv-1",
        source: "FORM",
        payload: {},
        templateSnapshot: { category: "CLEAR_INSPECTION" },
        outcome: "FAIL",
        form: {
          id: "form-1",
          name: "Clear Inspection",
          category: "CLEAR_INSPECTION",
          level: "scope",
          purpose: "inspection",
          scopeTypeCodes: [],
          description: null,
        },
      },
    ] as never);

    mockHydrateView.mockResolvedValue({
      templateSnapshot: {
        sections: [
          {
            id: "sec-1",
            title: "Section 1",
            questions: [
              {
                id: "q1",
                title: "do you like pizza?",
                description: "",
                responseType: "PASS_FAIL_DEFICIENCIES",
                required: true,
                photoRequired: false,
                deficiencyPhotoRequired: false,
                options: [],
              },
            ],
          },
        ],
      },
      payload: {
        q1: {
          choice: "fail",
          comment: "test comment on the deficiency",
          deficiencies: [
            {
              description: "Gap at left stile",
              count: 3,
              severity: "Major",
              capturedFiles: [
                {
                  storageUrl: "https://example.com/deficiency.jpg",
                  storageKey: "inspections/deficiency.jpg",
                  mimeType: "image/jpeg",
                },
              ],
            },
          ],
        },
      },
    });

    const result = await hydrateInspectionSubmissionDetails(baseSnapshot);
    const item = result.inspections.summaryGroups[0]?.items[0];

    expect(mockHydrateView).toHaveBeenCalledTimes(1);
    expect(item?.bodyText).toContain("do you like pizza?");
    expect(item?.bodyText).toContain("[Major] Gap at left stile");
    expect(item?.bodyText).toContain("test comment on the deficiency");
    expect(item?.inspectionDetailBlocks).toHaveLength(1);
    expect(item?.inspectionDetailBlocks?.[0]?.attachments).toHaveLength(1);
    expect(item?.attachments).toHaveLength(1);
  });
});

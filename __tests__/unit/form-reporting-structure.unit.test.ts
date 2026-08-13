import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadFormSectionsFromReporting,
  countFormDraftQuestions,
  copyFormDraftToVersionReporting,
} from "@/lib/inspections/form-reporting-structure";

describe("loadFormSectionsFromReporting()", () => {
  it("returns sections with parent questions and nested fail follow-ups", async () => {
    const client = {
      inspectionFormSection: {
        findMany: vi.fn(async () => [
          {
            formId: "form-1",
            sourceSectionId: "sec-1",
            title: "Section A",
            description: "Desc",
            questions: [
              {
                sourceQuestionId: "q1",
                title: "Main Q",
                description: null,
                responseType: "PASS_FAIL",
                options: null,
                required: true,
                photoRequired: false,
                deficiencyPhotoRequired: false,
                deficiencyDescriptionEnabled: null,
                isFailFollowUp: false,
                rawQuestion: {
                  id: "q1",
                  title: "Main Q",
                  description: "",
                  responseType: "PASS_FAIL",
                  required: true,
                  photoRequired: false,
                  deficiencyPhotoRequired: false,
                  options: [],
                },
              },
              {
                sourceQuestionId: "q1__followup",
                title: "Follow up",
                description: null,
                responseType: "SHORT_ANSWER",
                options: null,
                required: false,
                photoRequired: false,
                deficiencyPhotoRequired: false,
                deficiencyDescriptionEnabled: null,
                isFailFollowUp: true,
                sourceParentQuestionId: "q1",
                rawQuestion: {
                  id: "q1__followup",
                  title: "Follow up",
                  description: "",
                  responseType: "SHORT_ANSWER",
                  required: false,
                  photoRequired: false,
                  deficiencyPhotoRequired: false,
                  options: [],
                },
              },
            ],
          },
        ]),
      },
      inspectionFormQuestion: { count: vi.fn() },
      inspectionFormVersionSection: { deleteMany: vi.fn(), create: vi.fn() },
      inspectionFormVersionQuestion: { create: vi.fn() },
    };

    const sections = await loadFormSectionsFromReporting("form-1", client as never);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.questions).toHaveLength(1);
    expect(sections[0]?.questions[0]?.failFollowUp?.id).toBe("q1__followup");
  });

  it("returns empty array when no relational sections exist", async () => {
    const client = {
      inspectionFormSection: { findMany: vi.fn(async () => []) },
      inspectionFormQuestion: { count: vi.fn() },
      inspectionFormVersionSection: { deleteMany: vi.fn(), create: vi.fn() },
      inspectionFormVersionQuestion: { create: vi.fn() },
    };

    const sections = await loadFormSectionsFromReporting("form-1", client as never);
    expect(sections).toEqual([]);
  });
});

describe("countFormDraftQuestions()", () => {
  it("counts non-follow-up draft questions", async () => {
    const client = {
      inspectionFormSection: { findMany: vi.fn() },
      inspectionFormQuestion: {
        count: vi.fn(async () => 3),
      },
      inspectionFormVersionSection: { deleteMany: vi.fn(), create: vi.fn() },
      inspectionFormVersionQuestion: { create: vi.fn(), count: vi.fn() },
    };

    const count = await countFormDraftQuestions("form-1", client as never);
    expect(count).toBe(3);
  });
});

describe("copyFormDraftToVersionReporting()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies draft rows into version mirror tables", async () => {
    const client = {
      inspectionFormSection: {
        findMany: vi.fn(async () => [
          {
            sourceSectionId: "sec-1",
            title: "Section",
            description: null,
            displayOrder: 0,
            questions: [
              {
                sourceQuestionId: "q1",
                sourceSectionId: "sec-1",
                title: "Q1",
                description: null,
                responseType: "PASS_FAIL",
                options: null,
                required: false,
                photoRequired: false,
                deficiencyPhotoRequired: false,
                deficiencyDescriptionEnabled: null,
                isFailFollowUp: false,
                sourceParentQuestionId: null,
                parentQuestionTitle: null,
                displayOrder: 0,
                rawQuestion: {},
              },
            ],
          },
        ]),
      },
      inspectionFormQuestion: { count: vi.fn() },
      inspectionFormVersionSection: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        create: vi.fn(async () => ({ id: "version-sec-1" })),
      },
      inspectionFormVersionQuestion: {
        create: vi.fn(async () => ({ id: "version-q-1" })),
        count: vi.fn(),
      },
    };

    const count = await copyFormDraftToVersionReporting("form-1", "fv-1", client as never);

    expect(count).toBe(1);
    expect(client.inspectionFormVersionSection.deleteMany).toHaveBeenCalledWith({
      where: { formVersionId: "fv-1" },
    });
    expect(client.inspectionFormVersionQuestion.create).toHaveBeenCalledTimes(1);
  });
});

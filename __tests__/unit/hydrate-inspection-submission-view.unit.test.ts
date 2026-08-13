import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isInspectionPayloadStub,
  isInspectionTemplateSnapshotStub,
  hydrateInspectionSubmissionView,
} from "@/lib/inspections/hydrate-inspection-submission-view";

vi.mock("@/lib/inspections/form-reporting-structure", () => ({
  loadFormVersionSectionsFromReporting: vi.fn(),
}));

import { loadFormVersionSectionsFromReporting } from "@/lib/inspections/form-reporting-structure";

const mockLoadSections = vi.mocked(loadFormVersionSectionsFromReporting);

describe("isInspectionPayloadStub()", () => {
  it("returns true for empty object", () => {
    expect(isInspectionPayloadStub({})).toBe(true);
  });

  it("returns true for auto appendix only payloads", () => {
    expect(
      isInspectionPayloadStub({
        __inspector_notes__: { text: "Note" },
        __inspector_media__: { capturedFiles: [] },
      }),
    ).toBe(true);
  });

  it("returns false when answers are present", () => {
    expect(isInspectionPayloadStub({ q1: { choice: "pass" } })).toBe(false);
  });
});

describe("isInspectionTemplateSnapshotStub()", () => {
  it("returns true for category-only stub", () => {
    expect(isInspectionTemplateSnapshotStub({ category: "CLEAR_INSPECTION" })).toBe(true);
  });

  it("returns false when sections are populated", () => {
    expect(
      isInspectionTemplateSnapshotStub({
        name: "Form",
        sections: [{ id: "s1", title: "S", questions: [] }],
      })
    ).toBe(false);
  });
});

describe("hydrateInspectionSubmissionView()", () => {
  const mockClient = {
    inspectionAnswer: { findMany: vi.fn() },
    inspectionFormVersionSection: { findMany: vi.fn() },
    inspectionFormVersionQuestion: { findMany: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSections.mockResolvedValue([
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
    ]);
  });

  it("returns legacy JSON unchanged when not stubs", async () => {
    const legacy = {
      id: "sub-1",
      formId: "form-1",
      formVersionId: "fv-1",
      source: "FORM" as const,
      templateSnapshot: { name: "Legacy", sections: [{ id: "s1", title: "S", questions: [] }] },
      payload: { q1: { choice: "pass" } },
    };

    const result = await hydrateInspectionSubmissionView(legacy, mockClient as never);
    expect(result.templateSnapshot).toEqual(legacy.templateSnapshot);
    expect(result.payload).toEqual(legacy.payload);
    expect(mockClient.inspectionAnswer.findMany).not.toHaveBeenCalled();
  });

  it("hydrates template and payload from relational rows", async () => {
    mockClient.inspectionAnswer.findMany.mockResolvedValue([
      {
        questionId: "q1",
        choiceValue: "pass",
        choicesValue: [],
        textValue: null,
        numberValue: null,
        ratingValue: null,
        rawAnswer: {},
        answerMedia: [],
        deficiencies: [],
      },
    ]);

    const result = await hydrateInspectionSubmissionView(
      {
        id: "sub-2",
        formId: "form-1",
        formVersionId: "fv-1",
        source: "FORM",
        templateSnapshot: { category: "CLEAR_INSPECTION" },
        payload: {},
        form: {
          id: "form-1",
          name: "Clear check",
          category: "CLEAR_INSPECTION",
          level: "scope",
          scopeTypeCodes: ["CAB"],
          description: "Desc",
        },
      },
      mockClient as never
    );

    expect(mockLoadSections).toHaveBeenCalledWith("fv-1", mockClient);
    expect(result.payload).toEqual({ q1: { choice: "pass" } });
    expect(result.templateSnapshot).toMatchObject({
      name: "Clear check",
      category: "CLEAR_INSPECTION",
      latestVersionId: "fv-1",
    });
  });

  it("uses form category when stub stores legacy PRE_INSTALL", async () => {
    const result = await hydrateInspectionSubmissionView(
      {
        id: "sub-3",
        formId: "form-2ac",
        formVersionId: "fv-2",
        source: "FORM",
        templateSnapshot: { category: "PRE_INSTALL" },
        payload: {},
        form: {
          id: "form-2ac",
          name: "2 Area Clear",
          category: "TWO_AREA_CLEAR",
          level: "scope",
          scopeTypeCodes: ["CAB"],
          description: "Desc",
        },
      },
      mockClient as never,
    );

    expect(result.templateSnapshot).toMatchObject({
      name: "2 Area Clear",
      category: "TWO_AREA_CLEAR",
    });
  });

  it("preserves CALIBRATION_INSPECTION category when hydrating from calibration stub", async () => {
    const result = await hydrateInspectionSubmissionView(
      {
        id: "sub-cal",
        formId: "form-clear",
        formVersionId: "fv-cal",
        source: "FORM",
        templateSnapshot: { category: "CALIBRATION_INSPECTION" },
        payload: {},
        form: {
          id: "form-clear",
          name: "Clear check",
          category: "CLEAR_INSPECTION",
          level: "scope",
          scopeTypeCodes: ["TIL"],
          description: "Desc",
        },
      },
      mockClient as never,
    );

    expect(result.templateSnapshot).toMatchObject({
      name: "Clear check",
      category: "CALIBRATION_INSPECTION",
      latestVersionId: "fv-cal",
    });
  });

  it("hydrates relational answers when submission payload only stores auto appendix", async () => {
    mockClient.inspectionAnswer.findMany.mockResolvedValue([
      {
        questionId: "q1",
        choiceValue: "no",
        choicesValue: [],
        textValue: null,
        numberValue: null,
        ratingValue: null,
        rawAnswer: { choice: "no" },
        answerMedia: [
          {
            storageUrl: "http://localhost:3002/api/upload/field-media/file?key=field-media%2Finspections%2Fa.jpg",
            storageKey: "field-media/inspections/a.jpg",
            mimeType: null,
            fileSizeBytes: 100,
            localUrl: null,
            caption: null,
            imageAnnotation: null,
          },
        ],
        deficiencies: [],
      },
    ]);

    const result = await hydrateInspectionSubmissionView(
      {
        id: "sub-auto",
        formId: "form-1",
        formVersionId: "fv-1",
        source: "FORM",
        templateSnapshot: { category: "OTHER" },
        payload: {
          __inspector_media__: { capturedFiles: [{ serverUrl: "http://x/b.jpg", mimeType: "image/jpeg" }] },
        },
        form: {
          id: "form-1",
          name: "Daily Update",
          category: "OTHER",
          level: "project",
          scopeTypeCodes: [],
          description: "",
        },
      },
      mockClient as never,
    );

    expect(result.payload.q1).toMatchObject({ choice: "no" });
    expect(result.payload.q1).toHaveProperty("capturedFiles");
    expect(result.payload.__inspector_media__).toBeDefined();
  });
});

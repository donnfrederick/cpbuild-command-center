import { describe, it, expect } from "vitest";
import type { FormTemplate } from "@/components/forms/formTypes";
import type { AnswersMap } from "@/components/forms/FormFillClient";
import {
  answersDirty,
  buildDraftKey,
  countAnsweredQuestions,
  hasAnyAnswers,
  isRetryDirty,
  sanitizeDraftAnswers,
} from "@/lib/inspections/inspection-draft";

const TEMPLATE: FormTemplate = {
  id: "form-1",
  name: "Test",
  description: "",
  status: "published",
  level: "scope",
  scopeTypeCodes: ["CAB"],
  category: "CLEAR_INSPECTION",
  sections: [
    {
      id: "s1",
      title: "Section",
      questions: [
        {
          id: "q1",
          title: "Item 1",
          description: "",
          responseType: "PASS_FAIL",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        {
          id: "q2",
          title: "Item 2",
          description: "",
          responseType: "PASS_FAIL",
          required: false,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
      ],
    },
  ],
};

describe("buildDraftKey", () => {
  it("builds live, retry, and calibration keys scoped by project and unit", () => {
    expect(
      buildDraftKey({
        kind: "live",
        projectId: "proj-1",
        unitId: "unit-a",
        scopeRowId: "scope-1",
        formId: "form-1",
        formVersionId: "v1",
      }),
    ).toBe("live:proj-1:scope-1:form-1:v1");

    expect(
      buildDraftKey({
        kind: "retry",
        projectId: "proj-1",
        unitId: "unit-a",
        scopeRowId: "scope-1",
        formId: "form-1",
        parentSubmissionId: "sub-prev",
      }),
    ).toBe("retry:proj-1:scope-1:form-1:sub-prev");

    expect(
      buildDraftKey({
        kind: "calibration",
        projectId: "proj-1",
        unitId: "unit-a",
        scopeRowId: "scope-1",
        formId: "form-1",
        parentSubmissionId: "sub-clear",
      }),
    ).toBe("calibration:proj-1:scope-1:form-1:sub-clear");

    expect(
      buildDraftKey({
        kind: "edit",
        projectId: "proj-1",
        unitId: "unit-a",
        scopeRowId: "scope-1",
        formId: "form-1",
        parentSubmissionId: "sub-server-1",
      }),
    ).toBe("edit:proj-1:scope-1:form-1:sub-server-1");
  });

  it("uses unit segment when scopeRowId is omitted", () => {
    expect(
      buildDraftKey({
        kind: "live",
        projectId: "proj-1",
        unitId: "building|L1|U1",
        formId: "form-gyp",
        formVersionId: "v1",
      }),
    ).toBe("live:proj-1:unit:building|L1|U1:form-gyp:v1");
  });
});

describe("hasAnyAnswers / countAnsweredQuestions", () => {
  it("detects answered questions", () => {
    const answers: AnswersMap = { q1: { choice: "pass" } };
    expect(hasAnyAnswers(TEMPLATE, answers)).toBe(true);
    expect(hasAnyAnswers(TEMPLATE, {})).toBe(false);
    expect(countAnsweredQuestions(TEMPLATE, answers)).toBe(1);
  });
});

describe("answersDirty", () => {
  it("returns false for identical sanitized maps", () => {
    const baseline: AnswersMap = { q1: { choice: "pass" } };
    const current: AnswersMap = { q1: { choice: "pass" } };
    expect(answersDirty(baseline, current)).toBe(false);
  });

  it("returns true when an answer changes", () => {
    const baseline: AnswersMap = { q1: { choice: "pass" } };
    const current: AnswersMap = { q1: { choice: "fail" } };
    expect(answersDirty(baseline, current)).toBe(true);
  });
});

describe("isRetryDirty", () => {
  const previous: AnswersMap = {
    q1: { choice: "fail", deficiencies: [{ id: "d1", description: "Gap", severity: "Major", count: 1 }] },
  };

  it("is clean when retry state matches previous answers only", () => {
    expect(
      isRetryDirty(previous, {
        answers: { ...previous },
        resolutions: {},
        updatedDefs: {},
        resolvedDocs: {},
        resolutionSubmitted: {},
      }),
    ).toBe(false);
  });

  it("is dirty when a resolution is recorded", () => {
    expect(
      isRetryDirty(previous, {
        answers: { ...previous },
        resolutions: { q1: "resolved" },
        updatedDefs: {},
        resolvedDocs: {},
        resolutionSubmitted: {},
      }),
    ).toBe(true);
  });
});

describe("sanitizeDraftAnswers", () => {
  it("flags pending media when File blobs are present", () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    const answers: AnswersMap = {
      q1: {
        choice: "pass",
        capturedFiles: [{ file, previewUrl: "blob:x", mimeType: "image/jpeg" }],
      },
    };
    const { hasPendingMedia, answers: sanitized } = sanitizeDraftAnswers(answers);
    expect(hasPendingMedia).toBe(true);
    expect(sanitized.q1?.capturedFiles?.[0]).not.toHaveProperty("file");
  });
});

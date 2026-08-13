import { describe, expect, it } from "vitest";
import { extractInspectionDeficiencies } from "@/lib/inspections/deficiency-extraction";

const TEMPLATE = {
  sections: [
    {
      questions: [
        {
          id: "q-pass-fail-def",
          title: "Final cabinet quality",
          responseType: "PASS_FAIL_DEFICIENCIES",
        },
        {
          id: "q-other-def",
          title: "Countertop quality",
          responseType: "PASS_FAIL_DEFICIENCIES",
        },
      ],
    },
  ],
};

const BASE_INPUT = {
  inspectionSubmissionId: "sub-1",
  templateSnapshot: TEMPLATE,
};

describe("extractInspectionDeficiencies", () => {
  it("extracts failed question deficiencies with media", () => {
    const deficiencies = extractInspectionDeficiencies({
      ...BASE_INPUT,
      payload: {
        "q-pass-fail-def": {
          choice: "fail",
          deficiencies: [
            {
              id: "def-1",
              description: "Door reveal is uneven.",
              severity: "Major",
              count: 2,
              capturedFiles: [
                {
                  serverUrl: "https://example.supabase.co/storage/v1/object/sign/field-media/inspections/photo.jpg?token=abc",
                  localUrl: "blob:http://local/photo",
                  mimeType: "image/jpeg",
                  fileSizeBytes: 12345,
                },
              ],
            },
          ],
        },
      },
    });

    expect(deficiencies).toHaveLength(1);
    expect(deficiencies[0]).toMatchObject({
      questionId: "q-pass-fail-def",
      questionTitle: "Final cabinet quality",
      sourceDeficiencyId: "def-1",
      description: "Door reveal is uneven.",
      severity: "Major",
      count: 2,
    });
    expect(deficiencies[0].media).toHaveLength(1);
    expect(deficiencies[0].media[0]).toMatchObject({
      storageKey: "field-media/inspections/photo.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 12345,
    });
  });

  it("ignores non-failed answers and creates stable ids for legacy deficiencies", () => {
    const deficiencies = extractInspectionDeficiencies({
      ...BASE_INPUT,
      payload: {
        "q-pass-fail-def": {
          choice: "pass",
          deficiencies: [{ description: "Should not be extracted.", severity: "Minor" }],
        },
        "q-other-def": {
          choice: "Fail",
          deficiencies: [{ description: "Missing caulk.", severity: "Minor" }],
        },
      },
    });

    expect(deficiencies).toHaveLength(1);
    expect(deficiencies[0]).toMatchObject({
      questionId: "q-other-def",
      sourceDeficiencyId: "legacy-q-other-def-1",
      description: "Missing caulk.",
      severity: "Minor",
      count: 1,
    });
  });

  it("preserves media URLs even when storage keys cannot be reconstructed", () => {
    const deficiencies = extractInspectionDeficiencies({
      ...BASE_INPUT,
      payload: {
        "q-pass-fail-def": {
          choice: "fail",
          deficiencies: [
            {
              id: "def-1",
              description: "Scratch on panel.",
              capturedFiles: [{ serverUrl: "https://cdn.example.com/photo.jpg" }],
            },
          ],
        },
      },
    });

    expect(deficiencies[0].media[0]).toMatchObject({
      storageUrl: "https://cdn.example.com/photo.jpg",
      storageKey: null,
    });
  });
});

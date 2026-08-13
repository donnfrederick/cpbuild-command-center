import { describe, it, expect } from "vitest";
import {
  buildInspectionSubmissionDetailBlocks,
  formatInspectionDeficiencySummary,
  formatInspectionFailureDetailsFromPayload,
  formatInspectionReportDetailsFromPayload,
} from "@/lib/field-daily-report/format-inspection-deficiency-summary";
import type { SectionResult } from "@/app/api/projects/[id]/inspections-report/route";

const templateSnapshot = {
  sections: [
    {
      id: "sec-1",
      title: "General",
      questions: [
        {
          id: "q-fail",
          title: "Cabinet alignment",
          responseType: "PASS_FAIL_DEFICIENCIES",
          required: true,
        },
        {
          id: "q-pass",
          title: "Hardware installed",
          responseType: "PASS_FAIL_DEFICIENCIES",
          required: true,
        },
      ],
    },
  ],
};

describe("formatInspectionDeficiencySummary()", () => {
  it("formats failed questions and deficiencies as plain text lines", () => {
    const sections: SectionResult[] = [
      {
        sectionTitle: "General",
        passed: false,
        totalOccurrences: 2,
        questions: [],
        failingQuestions: [
          {
            questionTitle: "Cabinet alignment",
            passed: false,
            totalOccurrences: 1,
            deficiencies: [
              {
                description: "Gap at left stile",
                count: 1,
                severity: "Major",
              },
            ],
          },
          {
            questionTitle: "Hardware installed",
            passed: false,
            totalOccurrences: 0,
            deficiencies: [],
          },
        ],
      },
    ];

    expect(formatInspectionDeficiencySummary(sections)).toBe(
      "Cabinet alignment: [Major] Gap at left stile\nHardware installed: Fail",
    );
  });

  it("includes question comments and inspector notes from payload", () => {
    const payload = {
      "q-fail": {
        choice: "fail",
        comment: "Visible from entry",
        deficiencies: [
          {
            description: "Gap at left stile",
            count: 1,
            severity: "Major",
          },
        ],
      },
      __inspector_notes__: {
        text: "Customer walk scheduled Monday",
      },
    };

    expect(formatInspectionFailureDetailsFromPayload(templateSnapshot, payload)).toBe(
      "Cabinet alignment: [Major] Gap at left stile — Visible from entry\nInspector notes: Customer walk scheduled Monday",
    );
  });
});

describe("buildInspectionSubmissionDetailBlocks()", () => {
  it("includes pass questions when they have comments or photos", () => {
    const payload = {
      "q-fail": {
        choice: "fail",
        deficiencies: [{ description: "Gap at left stile", count: 1, severity: "Major" }],
      },
      "q-pass": {
        choice: "pass",
        comment: "All hardware tight",
      },
    };

    const blocks = buildInspectionSubmissionDetailBlocks(templateSnapshot, payload);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.heading).toBe("Cabinet alignment");
    expect(blocks[0]?.lines[0]).toContain("[Major] Gap at left stile");
    expect(blocks[1]?.heading).toBe("Hardware installed");
    expect(blocks[1]?.lines[0]).toBe("Pass — All hardware tight");
  });

  it("includes pass questions with photos even without comments", () => {
    const payload = {
      "q-pass": {
        choice: "pass",
        capturedFiles: [
          {
            storageUrl: "https://example.com/pass-photo.jpg",
            storageKey: "inspections/pass-photo.jpg",
            mimeType: "image/jpeg",
          },
        ],
      },
    };

    const blocks = buildInspectionSubmissionDetailBlocks(templateSnapshot, payload);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.lines[0]).toBe("Pass — Photo attached");
    expect(blocks[0]?.imageRefs).toHaveLength(1);
  });

  it("groups inspector media into a notes block", () => {
    const payload = {
      __inspector_notes__: { text: "Follow up Monday" },
      __inspector_media__: {
        capturedFiles: [
          {
            storageUrl: "https://example.com/note-photo.jpg",
            storageKey: "inspections/note-photo.jpg",
            mimeType: "image/jpeg",
          },
        ],
      },
    };

    const blocks = buildInspectionSubmissionDetailBlocks(templateSnapshot, payload);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.heading).toBe("Inspector notes");
    expect(blocks[0]?.lines[0]).toBe("Follow up Monday");
    expect(blocks[0]?.imageRefs).toHaveLength(1);
  });
});

describe("formatInspectionReportDetailsFromPayload()", () => {
  it("flattens detail blocks into prefixed lines", () => {
    const payload = {
      "q-pass": { choice: "pass", comment: "Looks good" },
    };

    expect(formatInspectionReportDetailsFromPayload(templateSnapshot, payload)).toBe(
      "Hardware installed: Pass — Looks good",
    );
  });

  it("includes deficiency-only answers without an explicit fail choice", () => {
    const payload = {
      "q-fail": {
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
    };

    const blocks = buildInspectionSubmissionDetailBlocks(templateSnapshot, payload);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.lines[0]).toContain("[Major] Gap at left stile");
    expect(blocks[0]?.lines[0]).toContain("test comment on the deficiency");
    expect(blocks[0]?.imageRefs).toHaveLength(1);
  });
});

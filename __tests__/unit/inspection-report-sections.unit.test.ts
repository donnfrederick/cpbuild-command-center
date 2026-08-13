import { describe, it, expect } from "vitest";
import { buildSubmissionSectionResults, buildSubmissionSectionResultsFromPayload } from "@/lib/inspections/inspection-report-sections";

describe("buildSubmissionSectionResults()", () => {
  it("builds section detail from normalized answers only", () => {
    const result = buildSubmissionSectionResults({
      outcome: "FAIL",
      deficiencyCount: 2,
      answers: [
        {
          questionId: "q1",
          choiceValue: "fail",
          isFailed: true,
          isNotApplicable: false,
          formVersionQuestion: {
            title: "Door Adjustments",
            responseType: "PASS_FAIL_DEFICIENCIES",
            sourceSectionId: "doors",
            section: { title: "DOORS AND DRAWERS" },
          },
          deficiencies: [
            { description: "[TEST-SEED] Synthetic deficiency", count: 1, severity: "Minor" },
          ],
        },
      ],
    });

    expect(result.totalDeficiencies).toBe(1);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.sectionTitle).toBe("DOORS AND DRAWERS");
    expect(result.sections[0]?.failingQuestions[0]?.questionTitle).toBe("Door Adjustments");
    expect(result.sections[0]?.questions).toHaveLength(1);
  });

  it("includes passed questions in the questions array", () => {
    const result = buildSubmissionSectionResults({
      outcome: "FAIL",
      deficiencyCount: 1,
      answers: [
        {
          questionId: "q-pass",
          choiceValue: "pass",
          isFailed: false,
          isNotApplicable: false,
          formVersionQuestion: {
            title: "Section 1 status",
            responseType: "PASS_FAIL",
            sourceSectionId: "sec-1",
            section: { title: "Section 1" },
          },
          deficiencies: [],
        },
        {
          questionId: "q-fail",
          choiceValue: "fail",
          isFailed: true,
          isNotApplicable: false,
          formVersionQuestion: {
            title: "Section 2 status",
            responseType: "PASS_FAIL_DEFICIENCIES",
            sourceSectionId: "sec-2",
            section: { title: "Section 2" },
          },
          deficiencies: [
            { description: "Crack", count: 1, severity: "Minor" },
          ],
        },
      ],
    });

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]?.questions[0]?.passed).toBe(true);
    expect(result.sections[1]?.questions[0]?.passed).toBe(false);
    expect(result.sections[1]?.failingQuestions).toHaveLength(1);
  });

  it("returns empty sections when no normalized answers exist", () => {
    const result = buildSubmissionSectionResults({
      outcome: "PASS",
      deficiencyCount: 0,
      answers: [],
    });
    expect(result.sections).toEqual([]);
    expect(result.totalDeficiencies).toBe(0);
  });

  it("buildSubmissionSectionResultsFromPayload reads legacy JSON payload", () => {
    const result = buildSubmissionSectionResultsFromPayload({
      sections: [
        {
          id: "layout",
          title: "LAYOUT",
          questions: [
            {
              id: "q1",
              title: "Cabinet alignment",
              description: "",
              responseType: "PASS_FAIL_DEFICIENCIES",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: true,
              options: [],
            },
          ],
        },
      ],
      payload: {
        q1: {
          choice: "fail",
          deficiencies: [{ id: "d1", description: "Off plan", severity: "Major", count: 3 }],
        },
      },
    });

    expect(result.totalDeficiencies).toBe(3);
    expect(result.sections[0]?.sectionTitle).toBe("LAYOUT");
    expect(result.sections[0]?.failingQuestions[0]?.totalOccurrences).toBe(3);
    expect(result.sections[0]?.questions).toHaveLength(1);
    expect(result.sections[0]?.questions[0]?.passed).toBe(false);
  });

  it("buildSubmissionSectionResultsFromPayload includes passed questions in questions array", () => {
    const result = buildSubmissionSectionResultsFromPayload({
      sections: [
        {
          id: "layout",
          title: "LAYOUT",
          questions: [
            {
              id: "q-pass",
              title: "Alignment ok",
              description: "",
              responseType: "PASS_FAIL",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: false,
              options: [],
            },
            {
              id: "q-fail",
              title: "Cabinet alignment",
              description: "",
              responseType: "PASS_FAIL_DEFICIENCIES",
              required: true,
              photoRequired: false,
              deficiencyPhotoRequired: true,
              options: [],
            },
          ],
        },
      ],
      payload: {
        "q-pass": { choice: "pass" },
        "q-fail": {
          choice: "fail",
          deficiencies: [{ id: "d1", description: "Off plan", severity: "Major", count: 1 }],
        },
      },
    });

    expect(result.sections[0]?.questions).toHaveLength(2);
    expect(result.sections[0]?.questions[0]?.passed).toBe(true);
    expect(result.sections[0]?.failingQuestions).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  isScoredResponseType,
  isNotApplicableChoice,
  sectionDeficiencyOccurrences,
  sectionHasScoredQuestions,
  sectionIsFailed,
  sectionPassedQuestionCount,
  sectionTitleLabel,
  dedupeCategoryHeaderStatus,
  questionIsFailed,
  questionIsPassed,
} from "@/components/projects/inspections/inspectionRecordDisplay";
import type { FormSection } from "@/components/forms/formTypes";

const infoSection: FormSection = {
  id: "general",
  title: "",
  description: "",
  questions: [
    {
      id: "sub",
      title: "Subcontractor Assigned to this Install",
      responseType: "SHORT_ANSWER",
      required: true,
    },
  ],
};

const layoutSection: FormSection = {
  id: "layout",
  title: "Layout",
  description: "",
  questions: [
    {
      id: "layout-q",
      title: "Cabinet layout meets plan",
      responseType: "PASS_FAIL_DEFICIENCIES",
      required: true,
    },
  ],
};

describe("inspectionRecordDisplay", () => {
  it("treats only pass/fail question types as scored", () => {
    expect(isScoredResponseType("PASS_FAIL")).toBe(true);
    expect(isScoredResponseType("PASS_FAIL_DEFICIENCIES")).toBe(true);
    expect(isScoredResponseType("SHORT_ANSWER")).toBe(false);
  });

  it("does not mark informational sections as scored", () => {
    expect(sectionHasScoredQuestions(infoSection)).toBe(false);
    expect(sectionHasScoredQuestions(layoutSection)).toBe(true);
  });

  it("returns null title label for untitled sections instead of a fallback", () => {
    expect(sectionTitleLabel(infoSection)).toBeNull();
    expect(sectionTitleLabel(layoutSection)).toBe("Layout");
  });

  it("counts deficiency occurrences only from deficiency capture questions", () => {
    const answers = {
      "layout-q": {
        choice: "fail" as const,
        deficiencies: [
          { id: "d1", description: "Gap visible", severity: "Major" as const, count: 4 },
          { id: "d2", description: "Missing trim", severity: "Major" as const, count: 1 },
        ],
      },
    };

    expect(sectionDeficiencyOccurrences(layoutSection, answers)).toBe(5);
    expect(sectionIsFailed(layoutSection, answers)).toBe(true);
    expect(sectionIsFailed(infoSection, { sub: { text: "Pinnacle Finishes LLC" } })).toBe(false);
  });

  it("splits passed vs failed questions within a section", () => {
    const mixedSection: FormSection = {
      id: "trim",
      title: "Trim",
      description: "",
      questions: [
        {
          id: "trim-fail",
          title: "Trim installed",
          responseType: "PASS_FAIL_DEFICIENCIES",
          required: true,
        },
        {
          id: "trim-pass",
          title: "Crown moulding flush",
          responseType: "PASS_FAIL",
          required: true,
        },
      ],
    };
    const answers = {
      "trim-fail": {
        choice: "fail" as const,
        deficiencies: [{ id: "d1", description: "Gap", severity: "Minor" as const, count: 2 }],
      },
      "trim-pass": { choice: "pass" as const },
    };

    expect(questionIsFailed(mixedSection.questions[0]!, answers["trim-fail"])).toBe(true);
    expect(questionIsPassed(mixedSection.questions[1]!, answers["trim-pass"])).toBe(true);
    expect(sectionPassedQuestionCount(mixedSection, answers)).toBe(1);
    expect(sectionIsFailed(mixedSection, answers)).toBe(true);
  });

  it("drops duplicate pass/fail from header badge when outcome is hoisted", () => {
    expect(
      dedupeCategoryHeaderStatus("Pass", true, "Pass", "Fail"),
    ).toBe("");
    expect(
      dedupeCategoryHeaderStatus("3 deficiencies", true, "Pass", "Fail"),
    ).toBe("3 deficiencies");
    expect(
      dedupeCategoryHeaderStatus("Pass", false, "Pass", "Fail"),
    ).toBe("Pass");
  });

  it("recognizes N/A choices including n/a alias", () => {
    expect(isNotApplicableChoice("na")).toBe(true);
    expect(isNotApplicableChoice("n/a")).toBe(true);
    expect(isNotApplicableChoice("pass")).toBe(false);
  });

  it("treats PASS_FAIL_DEFICIENCIES N/A as passed, not failed", () => {
    const section: FormSection = {
      id: "electrical",
      title: "Electrical/Gas",
      description: "",
      questions: [
        {
          id: "gas-lines",
          title: "Gas lines (if applicable) fall within Appliance Locations",
          responseType: "PASS_FAIL_DEFICIENCIES",
          required: true,
        },
      ],
    };
    const answers = {
      "gas-lines": { choice: "na" as const },
    };

    expect(questionIsFailed(section.questions[0]!, answers["gas-lines"])).toBe(false);
    expect(questionIsPassed(section.questions[0]!, answers["gas-lines"])).toBe(true);
    expect(sectionIsFailed(section, answers)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  isFailedPassFailAnswer,
  isPassFailQuestionType,
} from "@/lib/inspections/inspection-failed-items-filter";

describe("inspection-failed-items-filter", () => {
  it("identifies pass/fail question types", () => {
    expect(isPassFailQuestionType("PASS_FAIL")).toBe(true);
    expect(isPassFailQuestionType("PASS_FAIL_DEFICIENCIES")).toBe(true);
    expect(isPassFailQuestionType("YES_NO")).toBe(false);
  });

  it("treats fail choice as failed", () => {
    expect(isFailedPassFailAnswer("PASS_FAIL", { choice: "fail" })).toBe(true);
    expect(isFailedPassFailAnswer("PASS_FAIL", { choice: "pass" })).toBe(false);
  });

  it("treats legacy deficiency-only rows as failed", () => {
    expect(
      isFailedPassFailAnswer("PASS_FAIL_DEFICIENCIES", {
        deficiencies: [{ description: "Gap" }],
      }),
    ).toBe(true);
  });
});

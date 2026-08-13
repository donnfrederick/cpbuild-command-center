import { describe, it, expect } from "vitest";
import { shouldHighlightDeficiencyDescription } from "@/lib/inspections/form-fill-validation";

describe("shouldHighlightDeficiencyDescription()", () => {
  it("never highlights — deficiency descriptions are optional", () => {
    expect(
      shouldHighlightDeficiencyDescription({
        descriptionEnabled: true,
        description: "",
        severity: "Major",
        showValidation: true,
      }),
    ).toBe(false);
  });
});

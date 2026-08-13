import { describe, it, expect } from "vitest";
import { allowsAdditionalDeficiencies } from "@/components/forms/formTypes";

describe("allowsAdditionalDeficiencies()", () => {
  it("returns false when allowAdditionalDeficiencies is omitted (default opt-in off)", () => {
    expect(allowsAdditionalDeficiencies({})).toBe(false);
  });

  it("returns true when allowAdditionalDeficiencies is explicitly true", () => {
    expect(allowsAdditionalDeficiencies({ allowAdditionalDeficiencies: true })).toBe(true);
  });

  it("returns false when allowAdditionalDeficiencies is false", () => {
    expect(allowsAdditionalDeficiencies({ allowAdditionalDeficiencies: false })).toBe(false);
  });
});

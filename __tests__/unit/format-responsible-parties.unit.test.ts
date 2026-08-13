import { describe, it, expect } from "vitest";
import { formatResponsibleParties } from "@/lib/issues/issueDisplay";

describe("formatResponsibleParties()", () => {
  it("joins multiple parties with comma", () => {
    expect(formatResponsibleParties(["ELECTRICIAN", "PLUMBER"])).toBe(
      "ELECTRICIAN, PLUMBER",
    );
  });

  it("falls back to single party when array empty", () => {
    expect(formatResponsibleParties([], "CP_BUILD")).toBe("CP BUILD");
  });
});

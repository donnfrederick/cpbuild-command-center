import { describe, it, expect } from "vitest";
import {
  normalizeResponsibleParties,
  resolveResponsiblePartiesInput,
} from "@/lib/issues/responsible-parties";

describe("normalizeResponsibleParties()", () => {
  it("dedupes while preserving order", () => {
    expect(
      normalizeResponsibleParties(["ELECTRICIAN", "PLUMBER", "ELECTRICIAN"]),
    ).toEqual(["ELECTRICIAN", "PLUMBER"]);
  });

  it("throws when empty", () => {
    expect(() => normalizeResponsibleParties([])).toThrow(/At least one/);
  });

  it("throws when more than max parties", () => {
    const tooMany = Array.from({ length: 13 }, (_, i) => `FAKE_${i}`);
    expect(() => normalizeResponsibleParties(tooMany)).toThrow(/At most 12/);
  });
});

describe("resolveResponsiblePartiesInput()", () => {
  it("prefers responsibleParties array when provided", () => {
    expect(
      resolveResponsiblePartiesInput({
        responsibleParties: ["PLUMBER", "ELECTRICIAN"],
        responsibleParty: "CP_BUILD",
      }),
    ).toEqual(["PLUMBER", "ELECTRICIAN"]);
  });

  it("falls back to legacy single party", () => {
    expect(
      resolveResponsiblePartiesInput({ responsibleParty: "CP_BUILD" }),
    ).toEqual(["CP_BUILD"]);
  });

  it("throws when neither field is set", () => {
    expect(() => resolveResponsiblePartiesInput({})).toThrow(/At least one/);
  });
});

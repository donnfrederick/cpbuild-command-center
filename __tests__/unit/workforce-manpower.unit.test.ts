import { describe, expect, it } from "vitest";
import {
  formatWorkforceManpowerForPdf,
  parseWorkforceManpower,
  resolveDailyManpower,
} from "@/lib/field-daily-report/workforce-manpower";

describe("resolveDailyManpower()", () => {
  it("returns null for NaN column values instead of propagating NaN to PDF output", () => {
    expect(resolveDailyManpower(Number.NaN)).toBeNull();
  });

  it("prefers the DB column over legacy comment text", () => {
    expect(resolveDailyManpower(12, "8")).toBe(12);
  });

  it("falls back to legacy workforce comment digits", () => {
    expect(resolveDailyManpower(null, "15")).toBe(15);
  });
});

describe("formatWorkforceManpowerForPdf()", () => {
  it("replaces simple count placeholders for PDF templates", () => {
    expect(formatWorkforceManpowerForPdf("{count} people on site", 8)).toBe("8 people on site");
  });

  it("does not produce NaN when an ICU plural template is passed by mistake", () => {
    const icuLikeTemplate =
      "{count, plural, one {# person on site} other {# people on site}}";
    const formatted = formatWorkforceManpowerForPdf(icuLikeTemplate, 8);
    expect(formatted).not.toContain("NaN");
  });

  it("uses an em dash when count is not finite", () => {
    expect(formatWorkforceManpowerForPdf("{count} people on site", Number.NaN)).toBe(
      "— people on site",
    );
  });
});

describe("parseWorkforceManpower()", () => {
  it("rejects non-numeric legacy comment bodies", () => {
    expect(parseWorkforceManpower("NaN")).toBeNull();
  });
});

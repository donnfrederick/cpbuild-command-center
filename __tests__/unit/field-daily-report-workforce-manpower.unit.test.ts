import { describe, expect, it } from "vitest";
import {
  formatWorkforceManpowerForPdf,
  isDailyManpowerMissing,
  isValidDailyManpower,
  legacyWorkforceCommentBody,
  parseWorkforceManpower,
  resolveDailyManpower,
} from "@/lib/field-daily-report/workforce-manpower";

describe("workforce-manpower", () => {
  it("parseWorkforceManpower returns null for empty or invalid values", () => {
    expect(parseWorkforceManpower("")).toBeNull();
    expect(parseWorkforceManpower("  ")).toBeNull();
    expect(parseWorkforceManpower("12.5")).toBeNull();
    expect(parseWorkforceManpower("-1")).toBeNull();
    expect(parseWorkforceManpower("abc")).toBeNull();
    expect(parseWorkforceManpower("10000")).toBeNull();
  });

  it("parseWorkforceManpower accepts whole numbers from 0 to 9999", () => {
    expect(parseWorkforceManpower("0")).toBe(0);
    expect(parseWorkforceManpower("12")).toBe(12);
    expect(parseWorkforceManpower("9999")).toBe(9999);
  });

  it("resolveDailyManpower prefers the DB column over legacy comments", () => {
    expect(resolveDailyManpower(5, "12")).toBe(5);
    expect(resolveDailyManpower(null, "12")).toBe(12);
    expect(resolveDailyManpower(undefined, "")).toBeNull();
  });

  it("isDailyManpowerMissing reflects resolved value", () => {
    expect(isDailyManpowerMissing(null, "")).toBe(true);
    expect(isDailyManpowerMissing(0, "")).toBe(false);
    expect(isDailyManpowerMissing(null, "8")).toBe(false);
  });

  it("isValidDailyManpower allows null or valid integers", () => {
    expect(isValidDailyManpower(null)).toBe(true);
    expect(isValidDailyManpower(15)).toBe(true);
    expect(isValidDailyManpower(15.2)).toBe(false);
  });

  it("legacyWorkforceCommentBody reads workforce section comments", () => {
    expect(
      legacyWorkforceCommentBody([
        { sectionKey: "progress", itemKey: "", body: "x" },
        { sectionKey: "workforce", itemKey: "", body: "9" },
      ]),
    ).toBe("9");
  });

  it("formatWorkforceManpowerForPdf substitutes count into template", () => {
    expect(formatWorkforceManpowerForPdf("{count} people on site", 6)).toBe("6 people on site");
  });
});

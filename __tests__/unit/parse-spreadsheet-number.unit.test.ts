import { describe, it, expect } from "vitest";
import {
  parseSpreadsheetNumber,
  isValidSpreadsheetNumberString,
  formatSpreadsheetNumberForExport,
} from "@/lib/parse-spreadsheet-number";

describe("lib/parse-spreadsheet-number", () => {
  describe("parseSpreadsheetNumber", () => {
    it("returns null for empty or whitespace", () => {
      expect(parseSpreadsheetNumber("")).toBe(null);
      expect(parseSpreadsheetNumber("   ")).toBe(null);
    });

    it("parses plain integers and decimals", () => {
      expect(parseSpreadsheetNumber("5")).toBe(5);
      expect(parseSpreadsheetNumber("5.5")).toBe(5.5);
      expect(parseSpreadsheetNumber(" 14 ")).toBe(14);
    });

    it("strips US thousands commas", () => {
      expect(parseSpreadsheetNumber("1,200")).toBe(1200);
      expect(parseSpreadsheetNumber("12,345.67")).toBe(12345.67);
      expect(parseSpreadsheetNumber("1,234,567")).toBe(1234567);
    });

    it("returns null for non-numeric tokens", () => {
      expect(parseSpreadsheetNumber("not-a-number")).toBe(null);
      expect(parseSpreadsheetNumber("abc")).toBe(null);
    });
  });

  describe("isValidSpreadsheetNumberString", () => {
    it("allows empty or whitespace", () => {
      expect(isValidSpreadsheetNumberString("")).toBe(true);
      expect(isValidSpreadsheetNumberString("  ")).toBe(true);
    });

    it("allows comma-formatted numbers", () => {
      expect(isValidSpreadsheetNumberString("1,200")).toBe(true);
      expect(isValidSpreadsheetNumberString("12,345.67")).toBe(true);
    });

    it("rejects invalid values when non-empty", () => {
      expect(isValidSpreadsheetNumberString("x")).toBe(false);
      expect(isValidSpreadsheetNumberString("not-a-number")).toBe(false);
    });
  });

  describe("formatSpreadsheetNumberForExport", () => {
    it("returns empty for non-finite", () => {
      expect(formatSpreadsheetNumberForExport(Number.NaN, 4)).toBe("");
      expect(formatSpreadsheetNumberForExport(Number.POSITIVE_INFINITY, 4)).toBe("");
    });

    it("rounds to maxFractionDigits and drops float noise", () => {
      expect(formatSpreadsheetNumberForExport(2.5, 4)).toBe("2.5");
      expect(formatSpreadsheetNumberForExport(2.4999999999999996, 4)).toBe("2.5");
      expect(formatSpreadsheetNumberForExport(100, 4)).toBe("100");
      expect(formatSpreadsheetNumberForExport(12.345678, 2)).toBe("12.35");
    });

    it("output passes isValidSpreadsheetNumberString when non-empty", () => {
      const s = formatSpreadsheetNumberForExport(1.2345, 4);
      expect(s).not.toBe("");
      expect(isValidSpreadsheetNumberString(s)).toBe(true);
    });
  });
});

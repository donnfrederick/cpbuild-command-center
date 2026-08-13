import { describe, it, expect } from "vitest";
import {
  fullRowKeyFromParts,
  fullRowKeyFromSpreadsheetRow,
  buildFullRowKeyIndex,
  locKey,
} from "@/lib/project-row-matching";

describe("lib/project-row-matching", () => {
  describe("fullRowKeyFromParts", () => {
    it("includes normalized building, level, unit, and description", () => {
      expect(
        fullRowKeyFromParts({
          building: " A ",
          level: "1",
          unit: "101",
          description: " Floor install ",
        }),
      ).toBe("a|1|101|floor install");
    });

    it("treats null description as empty segment", () => {
      expect(
        fullRowKeyFromParts({
          building: "A",
          level: "1",
          unit: "101",
          description: null,
        }),
      ).toBe("a|1|101|");
    });
  });

  describe("fullRowKeyFromSpreadsheetRow", () => {
    it("maps Description column from spreadsheet row", () => {
      const key = fullRowKeyFromSpreadsheetRow({
        Building: "B",
        Level: "2",
        Unit: "201",
        Description: "Tile scope",
      });
      expect(key).toBe("b|2|201|tile scope");
    });
  });

  describe("locKey vs fullRowKey", () => {
    it("same unit with different descriptions produces different full keys", () => {
      const unit = locKey("A", "1", "101");
      const keyA = fullRowKeyFromParts({
        building: "A",
        level: "1",
        unit: "101",
        description: "Scope A",
      });
      const keyB = fullRowKeyFromParts({
        building: "A",
        level: "1",
        unit: "101",
        description: "Scope B",
      });
      expect(unit).toBe("a|1|101");
      expect(keyA).not.toBe(keyB);
    });
  });

  describe("buildFullRowKeyIndex", () => {
    it("maps full row keys to row ids (last wins on duplicate keys)", () => {
      const index = buildFullRowKeyIndex([
        {
          id: "r1",
          building: "A",
          level: "1",
          unit: "101",
          description: "First",
        },
        {
          id: "r2",
          building: "A",
          level: "1",
          unit: "101",
          description: "First",
        },
      ]);
      expect(index.get("a|1|101|first")).toBe("r2");
    });
  });
});

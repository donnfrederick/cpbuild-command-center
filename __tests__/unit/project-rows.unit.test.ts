import { describe, it, expect, vi } from "vitest";
import { mapRowToColumns, rowKey, insertProjectRows } from "@/lib/project-rows";

describe("lib/project-rows", () => {
  describe("mapRowToColumns", () => {
    it("maps Building, Level, Unit from spreadsheet format", () => {
      const row = { Building: "A", Level: "1", Unit: "101" };
      const result = mapRowToColumns(row);
      expect(result.building).toBe("A");
      expect(result.level).toBe("1");
      expect(result.unit).toBe("101");
    });

    it("returns empty strings for missing columns", () => {
      const row = {};
      const result = mapRowToColumns(row);
      expect(result.building).toBe("");
      expect(result.level).toBe("");
      expect(result.unit).toBe("");
    });

    it("parses QTY as decimal", () => {
      const row = { Building: "A", Level: "1", Unit: "101", QTY: "5.5" };
      const result = mapRowToColumns(row);
      expect(result.qty).toBe("5.5");
    });

    it("returns null for empty QTY", () => {
      const row = { Building: "A", Level: "1", Unit: "101", QTY: "" };
      const result = mapRowToColumns(row);
      expect(result.qty).toBe(null);
    });

    it("parses QTY with thousands commas (US format)", () => {
      const row = { Building: "A", Level: "1", Unit: "101", QTY: "1,200" };
      expect(mapRowToColumns(row).qty).toBe("1200");
      const row2 = { Building: "A", Level: "1", Unit: "101", QTY: "12,345.67" };
      expect(mapRowToColumns(row2).qty).toBe("12345.67");
    });

    it("parses Start Date in YYYY-MM-DD format", () => {
      const row = { Building: "A", Level: "1", Unit: "101", "Start Date": "2024-01-15" };
      const result = mapRowToColumns(row);
      expect(result.startDate).toBe("2024-01-15");
    });

    it("accepts Ship. Phase or Ship Phase", () => {
      const row1 = { Building: "A", Level: "1", Unit: "101", "Ship. Phase": "Phase 1" };
      const row2 = { Building: "A", Level: "1", Unit: "101", "Ship Phase": "Phase 2" };
      expect(mapRowToColumns(row1).shipPhase).toBe("Phase 1");
      expect(mapRowToColumns(row2).shipPhase).toBe("Phase 2");
    });

    it("maps Scope Type, Location Type, Cost Type, Installer, UOM", () => {
      const row = {
        Building: "A",
        Level: "1",
        Unit: "101",
        "Scope Type": "ST1",
        "Location Type": "LT1",
        "Cost Type": "CT1",
        Installer: "IT1",
        UOM: "EA",
      };
      const result = mapRowToColumns(row);
      expect(result.scopeTypeCode).toBe("ST1");
      expect(result.locationTypeCode).toBe("LT1");
      expect(result.costTypeCode).toBe("CT1");
      expect(result.installerCode).toBe("IT1");
      expect(result.uomCode).toBe("EA");
    });

    it("accepts alternate column names (CSI, Install Team, dates)", () => {
      const row = {
        Building: "A",
        Level: "1",
        Unit: "101",
        "CSI Prime": "01",
        "CSI Detail": "01010",
        "Install Team": "Team A",
        "StartDate": "2024-02-01",
        "FinishDate": "2024-03-15",
      };
      const result = mapRowToColumns(row);
      expect(result.csiPrimeCode).toBe("01");
      expect(result.csiDetailCode).toBe("01010");
      expect(result.installerCode).toBe("Team A");
      expect(result.startDate).toBe("2024-02-01");
      expect(result.finishDate).toBe("2024-03-15");
    });

    it("matches column names case-insensitively", () => {
      const row = {
        building: "A",
        LEVEL: "1",
        unit: "101",
        "SCOPE TYPE": "Framing",
        "LOCATION TYPE": "Interior",
        "COST TYPE": "Labor",
        INSTALLER: "Sub A",
        uom: "SF",
      };
      const result = mapRowToColumns(row);
      expect(result.building).toBe("A");
      expect(result.level).toBe("1");
      expect(result.unit).toBe("101");
      expect(result.scopeTypeCode).toBe("Framing");
      expect(result.locationTypeCode).toBe("Interior");
      expect(result.costTypeCode).toBe("Labor");
      expect(result.installerCode).toBe("Sub A");
      expect(result.uomCode).toBe("SF");
    });

    it("accepts common shorthand aliases for location, cost, and installer", () => {
      const row = {
        Building: "A",
        Level: "1",
        Unit: "101",
        "Loc. Type": "Exterior",
        "Cost Cd": "MAT",
        "Sub": "ABC Flooring",
      };
      const result = mapRowToColumns(row);
      expect(result.locationTypeCode).toBe("Exterior");
      expect(result.costTypeCode).toBe("MAT");
      expect(result.installerCode).toBe("ABC Flooring");
    });

    it("maps CPB Field Tracker column names (LType (U/C), Cost Type (L/S), CSI (Detail) Code, Budgeted MH, etc.)", () => {
      const row = {
        Building: "1",
        Level: "1",
        Unit: "109",
        "Scope Type": "Cabinetry",
        "LType (U/C)": "U",
        "Cost Type (L/S)": "S",
        Installer: "",
        "CSI Prime": "12",
        "CSI (Detail) Code": "123416",
        QTY: "36",
        UOM: "EA",
        "Unit Rate": "0.647",
        "Budgeted MH": "23",
        Start: "",
        Finish: "",
        "% Complete": "",
        "Actual MH": "500",
      };
      const result = mapRowToColumns(row);
      expect(result.locationTypeCode).toBe("U");
      expect(result.costTypeCode).toBe("S");
      expect(result.installerCode).toBe(""); // blank in spreadsheet
      expect(result.csiPrimeCode).toBe("12");
      expect(result.csiDetailCode).toBe("123416");
      expect(result.qty).toBe("36");
      expect(result.uomCode).toBe("EA");
      expect(result.unitRate).toBe("0.647");
      expect(result.budgetedManHours).toBe("23");
      expect(result.startDate).toBeNull();
      expect(result.percentComplete).toBeNull();
      expect(result.actualManHours).toBe("500");
    });

    it("parses Unit Rate, Budgeted Man Hours, Percent Complete, Actual Man Hours", () => {
      const row = {
        Building: "A",
        Level: "1",
        Unit: "101",
        "Unit Rate": "10.5",
        "Budgeted Man Hours": "2.25",
        "Percent Complete": "50",
        "Actual Man Hours": "1.1",
      };
      const result = mapRowToColumns(row);
      expect(result.unitRate).toBe("10.5");
      expect(result.budgetedManHours).toBe("2.25");
      expect(result.percentComplete).toBe("50");
      expect(result.actualManHours).toBe("1.1");
    });

    it("maps Area, Build Phase, Scheme, Unit Type, Description", () => {
      const row = {
        Building: "A",
        Level: "1",
        Unit: "101",
        Area: "SF",
        "Build Phase": "BP1",
        Scheme: "S1",
        "Unit Type": "UT1",
        Description: "Test desc",
      };
      const result = mapRowToColumns(row);
      expect(result.area).toBe("SF");
      expect(result.buildPhase).toBe("BP1");
      expect(result.scheme).toBe("S1");
      expect(result.unitType).toBe("UT1");
      expect(result.description).toBe("Test desc");
    });
  });

  describe("rowKey", () => {
    it("builds key from building, level, unit (lowercase)", () => {
      const row = { Building: "A", Level: "1", Unit: "101" };
      expect(rowKey(row)).toBe("a|1|101");
    });

    it("handles empty values", () => {
      const row = { Building: "", Level: "", Unit: "" };
      expect(rowKey(row)).toBe("||");
    });

    it("trims whitespace", () => {
      const row = { Building: "  A  ", Level: " 1 ", Unit: "101 " };
      expect(rowKey(row)).toBe("a|1|101");
    });
  });

  describe("insertProjectRows", () => {
    it("inserts rows and resolves lookups", async () => {
      const executeRaw = vi.fn().mockResolvedValue(undefined);
      const queryRaw = vi.fn().mockResolvedValue([{ id: "lk-1" }]);
      const tx = {
        $executeRawUnsafe: executeRaw,
        $queryRawUnsafe: queryRaw,
      };
      const rows = [
        { Building: "A", Level: "1", Unit: "101", "Scope Type": "ST1", "Location Type": "LT1", "Cost Type": "CT1", Installer: "IT1", UOM: "EA" },
      ];
      await insertProjectRows(tx as never, "proj-1", rows, 0);
      expect(queryRaw).toHaveBeenCalled();
      expect(executeRaw).toHaveBeenCalled();
    });

    it("handles rows with no lookup codes", async () => {
      const executeRaw = vi.fn().mockResolvedValue(undefined);
      const queryRaw = vi.fn().mockResolvedValue([{ id: "lk-1" }]);
      const tx = {
        $executeRawUnsafe: executeRaw,
        $queryRawUnsafe: queryRaw,
      };
      const rows = [{ Building: "A", Level: "1", Unit: "101" }];
      await insertProjectRows(tx as never, "proj-1", rows, 0);
      expect(executeRaw).toHaveBeenCalled();
    });
  });
});

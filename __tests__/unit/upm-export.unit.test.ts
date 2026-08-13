import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  fieldTrackerRecordFromProjectRow,
  FIELD_TRACKER_IMPORT_HEADERS,
  sanitizeFieldTrackerFileBase,
  fieldTrackerRecordsToAoA,
  buildFieldTrackerWorkbook,
  type FieldTrackerExportUnit,
} from "@/lib/upm-export";
import { parseUPM, parseUPMFromFile } from "@/lib/upm-parse";
import { mapRowToColumns } from "@/lib/project-rows";
import { isValidSpreadsheetNumberString } from "@/lib/parse-spreadsheet-number";

const sampleUnit: FieldTrackerExportUnit = {
  rowIndex: 0,
  building: "A",
  level: "1",
  unit: "101",
  area: "500",
  shipPhase: "1",
  buildPhase: "2",
  scheme: "S1",
  unitType: "2BR",
  description: "Test scope",
  scopeType: { code: "SCOPE-A", name: "Scope A" },
  csiPrimeCode: "09",
  csiDetailCode: "091000",
  locationType: { code: "U", name: "Unit" },
  costType: { code: "L", name: "Labor" },
  installer: { code: "TEAM1", name: "Team 1" },
  qty: 2.5,
  uom: { code: "EA", name: "Each" },
  unitRate: 100.25,
  budgetedManHours: 10,
  startDate: "2024-01-15",
  finishDate: "2024-02-01",
  percentComplete: 50,
  actualManHours: 5,
};

describe("lib/upm-export", () => {
  it("fieldTrackerRecordFromProjectRow fills all header keys", () => {
    const rec = fieldTrackerRecordFromProjectRow(sampleUnit);
    for (const h of FIELD_TRACKER_IMPORT_HEADERS) {
      expect(rec).toHaveProperty(h);
    }
  });

  it("re-import pipeline: TSV from export round-trips through parseUPM and mapRowToColumns", () => {
    const rec = fieldTrackerRecordFromProjectRow(sampleUnit);
    const line = FIELD_TRACKER_IMPORT_HEADERS.map((h) => rec[h] ?? "").join("\t");
    const pasted = `${FIELD_TRACKER_IMPORT_HEADERS.join("\t")}\n${line}`;
    const parsed = parseUPM(pasted);
    expect(parsed.error).toBeNull();
    expect(parsed.validationErrors).toHaveLength(0);
    expect(parsed.rows).toHaveLength(1);
    const mapped = mapRowToColumns(parsed.rows[0]!);
    expect(mapped.building).toBe("A");
    expect(mapped.level).toBe("1");
    expect(mapped.unit).toBe("101");
    expect(mapped.description).toBe("Test scope");
    expect(mapped.scopeTypeCode).toBe("SCOPE-A");
    expect(mapped.qty).toBe("2.5");
    expect(mapped.startDate).toBe("2024-01-15");
    expect(mapped.finishDate).toBe("2024-02-01");
  });

  it("sanitizeFieldTrackerFileBase strips unsafe characters", () => {
    expect(sanitizeFieldTrackerFileBase("My / Project:name")).toBe("My_Project_name");
  });

  it("fieldTrackerRecordsToAoA includes header row first", () => {
    const aoa = fieldTrackerRecordsToAoA([fieldTrackerRecordFromProjectRow(sampleUnit)]);
    expect(aoa[0]).toEqual([...FIELD_TRACKER_IMPORT_HEADERS]);
    expect(aoa[1]?.[0]).toBe("A");
  });

  it("export workbook includes UPM and Readme sheets", () => {
    const wb = buildFieldTrackerWorkbook([fieldTrackerRecordFromProjectRow(sampleUnit)]);
    expect(wb.SheetNames).toContain("UPM");
    expect(wb.SheetNames).toContain("Readme");
  });

  it("exported xlsx still parses when Readme sheet is present", async () => {
    const wb = buildFieldTrackerWorkbook([fieldTrackerRecordFromProjectRow(sampleUnit)]);
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = new File([buf], "export.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const parsed = await parseUPMFromFile(file);
    expect(parsed.error).toBeNull();
    expect(parsed.validationErrors).toHaveLength(0);
    expect(parsed.rows).toHaveLength(1);
  });

  it("QTY from noisy float passes spreadsheet validation after export", () => {
    const noisy: FieldTrackerExportUnit = {
      ...sampleUnit,
      qty: 3.0000000000000004,
    };
    const rec = fieldTrackerRecordFromProjectRow(noisy);
    expect(isValidSpreadsheetNumberString(rec.QTY)).toBe(true);
  });
});

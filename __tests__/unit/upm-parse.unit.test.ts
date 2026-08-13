import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseUPM, parseUPMFromFile, formatUPMValidationError } from "@/lib/upm-parse";

/** Minimal required columns beyond Building/Level/Unit for valid UPM rows. */
const REQ = "\tUnit Type\tDescription\tScope Type";
const REQ_VAL = "\tLobby\tTile floor\tTile";

describe("lib/upm-parse", () => {
  describe("parseUPM", () => {
    it("returns error when no data pasted", () => {
      const result = parseUPM("");
      expect(result.error).toBe("No data pasted.");
      expect(result.rows).toHaveLength(0);
    });

    it("returns error when header row not found", () => {
      const result = parseUPM("foo\tbar\n1\t2");
      expect(result.error).toContain("Building");
      expect(result.rows).toHaveLength(0);
    });

    it("parses tab-delimited data with Building header", () => {
      const pasted = `Building\tLevel\tUnit${REQ}\nA\t1\t101${REQ_VAL}\nB\t2\t202${REQ_VAL}`;
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.headers).toEqual(["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toMatchObject({ Building: "A", Level: "1", Unit: "101", "Unit Type": "Lobby", Description: "Tile floor", "Scope Type": "Tile" });
      expect(result.rows[1]).toMatchObject({ Building: "B", Level: "2", Unit: "202" });
    });

    it("parses comma-delimited data", () => {
      const pasted = `Building,Level,Unit,Unit Type,Description,Scope Type\nA,1,101,Lobby,Tile floor,Tile`;
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ Building: "A", Level: "1", Unit: "101", "Unit Type": "Lobby", Description: "Tile floor", "Scope Type": "Tile" });
    });

    it("skips rows where Building, Level and Unit are all blank (continues past them)", () => {
      // Empty-identity rows are skipped; data rows after the gap are kept.
      // This matches real Field Tracker spreadsheets that have blank separator
      // rows mid-sheet with non-empty numeric columns later.
      const pasted = `Building,Level,Unit,Unit Type,Description,Scope Type\nA,1,101,Lobby,Tile floor,Tile\n,,,,\nB,2,202,Lobby,Tile floor,Tile`;
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toMatchObject({ Building: "A", Level: "1", Unit: "101" });
      expect(result.rows[1]).toMatchObject({ Building: "B", Level: "2", Unit: "202" });
    });

    it("excludes template filler rows that have '0' in numeric columns but blank identity fields", () => {
      // Excel template rows often have 0 in Area/Ship Phase but no Building/Level/Unit.
      // The old all-cells-empty check kept those rows; key-field check excludes them.
      const pasted = `Building,Level,Unit,Unit Type,Description,Scope Type,Area,Ship Phase\nA,1,101,Lobby,Tile floor,Tile,0,0\n,,,,,,0,0\nB,2,202,Lobby,Tile floor,Tile,5,1`;
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.rows).toHaveLength(2);
      expect(result.rows.every((r) => r.Building !== "" || r.Level !== "" || r.Unit !== "")).toBe(true);
    });

    it("finds header when not on first line (comma-delimited)", () => {
      const pasted = `Some,other,line\nBuilding,Level,Unit,Unit Type,Description,Scope Type\nA,1,101,Lobby,Tile floor,Tile`;
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ Building: "A", Level: "1", Unit: "101" });
    });

    it("validates required columns when header found but Level/Unit missing", () => {
      const pasted = "Building\tBar\n1\t2";
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.validationErrors.length).toBeGreaterThan(0);
      expect(result.validationErrors.some((e) => e.col === "Level" || e.col === "Unit")).toBe(true);
    });

    it("validates QTY is numeric", () => {
      const pasted = `Building\tLevel\tUnit${REQ}\tQTY\nA\t1\t101${REQ_VAL}\tnot-a-number`;
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.validationErrors.length).toBeGreaterThan(0);
      expect(result.validationErrors.some((e) => e.col === "QTY")).toBe(true);
    });

    it("accepts valid QTY", () => {
      const pasted = `Building\tLevel\tUnit${REQ}\tQTY\nA\t1\t101${REQ_VAL}\t5`;
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.validationErrors).toHaveLength(0);
      expect(result.rows[0].QTY).toBe("5");
    });

    it("accepts QTY with US thousands commas", () => {
      const pasted = `Building\tLevel\tUnit${REQ}\tQTY\nA\t1\t101${REQ_VAL}\t1,200\nB\t2\t202${REQ_VAL}\t12,345.67`;
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.validationErrors).toHaveLength(0);
      expect(result.rows[0].QTY).toBe("1,200");
      expect(result.rows[1].QTY).toBe("12,345.67");
    });

    it("validates Quantity alias header for non-numeric values (matches mapRowToColumns)", () => {
      const pasted = `Building\tLevel\tUnit${REQ}\tQuantity\nA\t1\t101${REQ_VAL}\tnot-a-number`;
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.validationErrors.some((e) => e.col === "QTY" && e.row === 1)).toBe(true);
    });

    it("handles Windows line endings", () => {
      const pasted = `Building\tLevel\tUnit${REQ}\r\nA\t1\t101${REQ_VAL}`;
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.rows).toHaveLength(1);
    });

    it("validates Unit Type, Description, and Scope Type are required per row", () => {
      const pasted = `Building\tLevel\tUnit${REQ}\nA\t1\t101\t\tTile floor\tTile`;
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.validationErrors.some((e) => e.col === "Unit Type" && e.row === 1)).toBe(true);
    });

    it("validates required column headers for Unit Type, Description, Scope Type", () => {
      const pasted = "Building\tLevel\tUnit\nA\t1\t101";
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.validationErrors.some((e) => e.col === "Unit Type")).toBe(true);
      expect(result.validationErrors.some((e) => e.col === "Description")).toBe(true);
      expect(result.validationErrors.some((e) => e.col === "Scope Type")).toBe(true);
    });

    it("accepts case-insensitive and prefix-matched required headers (matches mapRowToColumns)", () => {
      const pasted = `building\tlevel\tunit\tunit type\tDescription\tScope Type (L/S)\nA\t1\t101\tLobby\tTile floor\tTile`;
      const result = parseUPM(pasted);
      expect(result.error).toBe(null);
      expect(result.validationErrors).toHaveLength(0);
      expect(result.rows[0]).toMatchObject({
        building: "A",
        level: "1",
        unit: "101",
        "unit type": "Lobby",
        Description: "Tile floor",
        "Scope Type (L/S)": "Tile",
      });
    });
  });

  describe("parseUPMFromFile", () => {
    function createExcelFile(rows: (string | number)[][]): File {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      return new File([buf], "test.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }

    it("parses Excel file with Building header", async () => {
      const file = createExcelFile([
        ["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"],
        ["A", "1", "101", "Lobby", "Tile floor", "Tile"],
        ["B", "2", "202", "Lobby", "Tile floor", "Tile"],
      ]);
      const result = await parseUPMFromFile(file);
      expect(result.error).toBe(null);
      expect(result.headers).toEqual(["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toMatchObject({ Building: "A", Level: "1", Unit: "101", "Unit Type": "Lobby" });
      expect(result.rows[1]).toMatchObject({ Building: "B", Level: "2", Unit: "202" });
    });

    it("excludes empty rows when parsing Excel file", async () => {
      const file = createExcelFile([
        ["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"],
        ["A", "1", "101", "Lobby", "Tile floor", "Tile"],
        ["", "", "", "", "", ""],
        ["B", "2", "202", "Lobby", "Tile floor", "Tile"],
        ["", "", "", "", "", ""],
        ["C", "3", "301", "Lobby", "Tile floor", "Tile"],
      ]);
      const result = await parseUPMFromFile(file);
      expect(result.error).toBe(null);
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toMatchObject({ Building: "A", Level: "1", Unit: "101" });
      expect(result.rows[1]).toMatchObject({ Building: "B", Level: "2", Unit: "202" });
      expect(result.rows[2]).toMatchObject({ Building: "C", Level: "3", Unit: "301" });
      const hasEmptyRow = result.rows.some(
        (r) =>
          !String(r.Building ?? "").trim() &&
          !String(r.Level ?? "").trim() &&
          !String(r.Unit ?? "").trim()
      );
      expect(hasEmptyRow).toBe(false);
    });

    it("prefers sheet with UPM/unit in name", async () => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([["Foo"], ["x"]]),
        "Other"
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"],
          ["A", "1", "101", "Lobby", "Tile floor", "Tile"],
        ]),
        "UPM Data"
      );
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      const file = new File([buf], "test.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const result = await parseUPMFromFile(file);
      expect(result.error).toBe(null);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ Building: "A", Level: "1", Unit: "101" });
    });

    it("returns error when no UPM data found", async () => {
      const file = createExcelFile([["Foo", "Bar"], ["1", "2"]]);
      const result = await parseUPMFromFile(file);
      expect(result.error).toContain("Building");
      expect(result.rows).toHaveLength(0);
    });

    it("returns error on read failure", async () => {
      const file = new File([], "empty.xlsx");
      const result = await parseUPMFromFile(file);
      expect(result.error).toBeTruthy();
      expect(result.rows).toHaveLength(0);
    });

    it("returns error when result is not object (covers data check)", async () => {
      const file = createExcelFile([
        ["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"],
        ["A", "1", "101", "Lobby", "Tile floor", "Tile"],
      ]);
      const origRead = FileReader.prototype.readAsArrayBuffer;
      FileReader.prototype.readAsArrayBuffer = function (this: FileReader) {
        queueMicrotask(() => {
          this.onload?.({ target: { result: null } } as ProgressEvent<FileReader>);
        });
      };
      const result = await parseUPMFromFile(file);
      FileReader.prototype.readAsArrayBuffer = origRead;
      expect(result.error).toBe("Could not read file.");
      expect(result.rows).toHaveLength(0);
    });

    it("returns error when XLSX parsing throws (covers catch block)", async () => {
      const file = new File([new Uint8Array([1, 2, 3, 4, 5])], "corrupt.xlsx");
      const result = await parseUPMFromFile(file);
      expect(result.error).toBeTruthy();
      expect(result.rows).toHaveLength(0);
    });


    it("calls onerror when FileReader fails", async () => {
      const file = createExcelFile([["Building"], ["A"]]);
      const origRead = FileReader.prototype.readAsArrayBuffer;
      FileReader.prototype.readAsArrayBuffer = function (this: FileReader) {
        queueMicrotask(() => this.onerror?.({} as ProgressEvent<FileReader>));
      };
      const result = await parseUPMFromFile(file);
      FileReader.prototype.readAsArrayBuffer = origRead;
      expect(result.error).toBe("Failed to read file.");
      expect(result.rows).toHaveLength(0);
    });
  });

  describe("formatUPMValidationError", () => {
    it("returns message only for header-level errors (row 0)", () => {
      expect(formatUPMValidationError({ row: 0, col: "Unit Type", message: 'Missing required column: "Unit Type"' }))
        .toBe('Missing required column: "Unit Type"');
    });

    it("includes row and column for per-row errors", () => {
      expect(formatUPMValidationError({ row: 3, col: "QTY", message: "QTY must be numeric" }))
        .toBe("Row 3, QTY: QTY must be numeric");
    });
  });
});

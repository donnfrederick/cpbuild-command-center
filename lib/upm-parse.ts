/**
 * UPM (Unit Plan Matrix) parsing from paste and Excel files.
 * Shared by CreateProjectModal and ProjectDetailView.
 */

import * as XLSX from "xlsx";
import { isValidSpreadsheetNumberString } from "@/lib/parse-spreadsheet-number";

export type UPMValidationError = { row: number; col: string; message: string };

/** Human-readable label for toasts and inline lists (row 0 = header/column errors). */
export function formatUPMValidationError(error: UPMValidationError): string {
  return error.row === 0 ? error.message : `Row ${error.row}, ${error.col}: ${error.message}`;
}

const UPM_HEADER_MARKER = "building";
const UPM_REQUIRED_COLS = ["Building", "Level", "Unit", "Unit Type", "Description", "Scope Type"];

/** Canonical column name → spreadsheet header aliases (matches mapRowToColumns). */
const UPM_REQUIRED_ROW_FIELDS: { col: string; aliases: string[] }[] = [
  { col: "Unit Type", aliases: ["Unit Type", "Unit Typ"] },
  { col: "Description", aliases: ["Description", "Desc"] },
  { col: "Scope Type", aliases: ["Scope Type", "Scope Typ", "Scope"] },
];

/** Case-insensitive header lookup with prefix fallback (matches mapRowToColumns). */
function resolveHeaderKey(headers: string[], aliases: string[]): string | null {
  const lowerKeyMap: Record<string, string> = {};
  for (const h of headers) {
    lowerKeyMap[h.trim().toLowerCase()] = h;
  }
  for (const alias of aliases) {
    const key = alias.trim().toLowerCase();
    const exact = lowerKeyMap[key];
    if (exact !== undefined) return exact;
  }
  for (const alias of aliases) {
    const prefix = alias.trim().toLowerCase();
    if (prefix.length < 4) continue;
    for (const [mapKey, originalHeader] of Object.entries(lowerKeyMap)) {
      if (mapKey.startsWith(prefix)) return originalHeader;
    }
  }
  return null;
}

function hasRequiredHeader(headers: string[], canonical: string, aliases: string[]): boolean {
  return resolveHeaderKey(headers, [canonical, ...aliases.filter((a) => a !== canonical)]) !== null;
}

function getRowCell(row: Record<string, string>, headers: string[], aliases: string[]): string {
  const key = resolveHeaderKey(headers, aliases);
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function isEmptyIdentityRow(row: Record<string, string>, headers: string[]): boolean {
  const building = getRowCell(row, headers, ["Building"]);
  const level = getRowCell(row, headers, ["Level"]);
  const unit = getRowCell(row, headers, ["Unit"]);
  return !building && !level && !unit;
}

export function validateUPMRows(headers: string[], rows: Record<string, string>[]): UPMValidationError[] {
  const errors: UPMValidationError[] = [];
  for (const col of UPM_REQUIRED_COLS) {
    if (col === "Unit Type" || col === "Description" || col === "Scope Type") {
      const field = UPM_REQUIRED_ROW_FIELDS.find((f) => f.col === col);
      if (field && !hasRequiredHeader(headers, col, field.aliases)) {
        errors.push({ row: 0, col, message: `Missing required column: "${col}"` });
      }
      continue;
    }
    if (!resolveHeaderKey(headers, [col])) {
      errors.push({ row: 0, col, message: `Missing required column: "${col}"` });
    }
  }
  for (const field of UPM_REQUIRED_ROW_FIELDS) {
    const headerKey = resolveHeaderKey(headers, field.aliases);
    if (!headerKey) continue;
    rows.forEach((row, i) => {
      const val = (row[headerKey] ?? "").trim();
      if (!val) {
        errors.push({
          row: i + 1,
          col: field.col,
          message: `${field.col} is required`,
        });
      }
    });
  }
  const qtyHeaderKey = resolveHeaderKey(headers, ["QTY", "Qty", "Quantity"]);
  if (qtyHeaderKey) {
    rows.forEach((row, i) => {
      const val = (row[qtyHeaderKey] ?? "").trim();
      if (val && !isValidSpreadsheetNumberString(val)) {
        errors.push({ row: i + 1, col: "QTY", message: "QTY must be numeric" });
      }
    });
  }
  return errors;
}

export function parseUPM(pasted: string): {
  headers: string[];
  rows: Record<string, string>[];
  error: string | null;
  validationErrors: UPMValidationError[];
} {
  const lines = pasted.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [], error: "No data pasted.", validationErrors: [] };

  const firstLine = lines[0];
  const hasTabs = firstLine.includes("\t");
  const delimiter = hasTabs ? "\t" : ",";

  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cells = lines[i].split(delimiter).map((c) => c.trim());
    const first = (cells[0] ?? "").toLowerCase();
    if (first === UPM_HEADER_MARKER) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    return {
      headers: [],
      rows: [],
      error: 'Could not find header row. Ensure the first column of the header is "Building" (copy from the Field Tracker spreadsheet).',
      validationErrors: [],
    };
  }

  const headerLine = lines[headerIdx];
  const headers = headerLine.split(delimiter).map((h) => h.trim()).filter(Boolean);
  if (headers.length === 0) return { headers: [], rows: [], error: "Header row has no columns.", validationErrors: [] };

  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter).map((c) => (c ?? "").trim());
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = cells[j] ?? "";
    });
    // A row is "empty" when all three identity fields are blank.
    // Numeric columns like Area/Ship Phase may be "0" on template rows — don't use
    // "all cells empty" as the test or those filler rows will slip through.
    if (isEmptyIdentityRow(row, headers)) continue;
    rows.push(row);
  }

  const validationErrors = validateUPMRows(headers, rows);
  return { headers, rows, error: null, validationErrors };
}

export function parseUPMFromFile(file: File): Promise<{
  headers: string[];
  rows: Record<string, string>[];
  error: string | null;
  validationErrors: UPMValidationError[];
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data || typeof data !== "object") {
          resolve({ headers: [], rows: [], error: "Could not read file.", validationErrors: [] });
          return;
        }
        const wb = XLSX.read(data, { type: "array" });
        const sheetNames = wb.SheetNames ?? [];
        const preferredOrder = [...sheetNames].sort((a, b) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();
          const aScore = aLower.includes("qyt") || aLower.includes("upm") || aLower.includes("unit") ? 1 : 0;
          const bScore = bLower.includes("qyt") || bLower.includes("upm") || bLower.includes("unit") ? 1 : 0;
          return bScore - aScore;
        });

        let headers: string[] = [];
        const rows: Record<string, string>[] = [];

        for (const sheetName of preferredOrder) {
          const sheet = wb.Sheets[sheetName];
          if (!sheet) continue;
          const json = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false }) as (string | number)[][];
          if (!json.length) continue;

          for (let i = 0; i < Math.min(json.length, 30); i++) {
            const row = json[i] ?? [];
            for (let c = 0; c < Math.min(row.length, 10); c++) {
              const cell = String(row[c] ?? "").trim().toLowerCase();
              if (cell === UPM_HEADER_MARKER) {
                const startCol = c;
                const headerRow = row.slice(c);
                headers = headerRow.map((h) => String(h ?? "").trim()).filter(Boolean);
                if (headers.length > 0) {
                  for (let j = i + 1; j < json.length; j++) {
                    const dataCells = json[j] ?? [];
                    const cells = dataCells.slice(startCol);
                    const rowObj: Record<string, string> = {};
                    headers.forEach((h, k) => {
                      rowObj[h] = String(cells[k] ?? "").trim();
                    });
                    // Exclude rows where all key identity fields are blank.
                    // Excel template rows often have "0" for numeric columns, so
                    // "all cells empty" is insufficient — key on Building/Level/Unit.
                    if (isEmptyIdentityRow(rowObj, headers)) continue;
                    rows.push(rowObj);
                  }
                  break;
                }
              }
            }
            if (headers.length > 0) break;
          }
          if (headers.length > 0) break;
        }

        if (headers.length === 0) {
          resolve({
            headers: [],
            rows: [],
            error: 'Could not find UPM data. Ensure a sheet has a header row with "Building" in the first column.',
            validationErrors: [],
          });
          return;
        }

        const validationErrors = validateUPMRows(headers, rows);
        resolve({ headers, rows, error: null, validationErrors });
      } catch (err) {
        resolve({
          headers: [],
          rows: [],
          error: err instanceof Error ? err.message : "Failed to parse Excel file.",
          validationErrors: [],
        });
      }
    };
    reader.onerror = () => resolve({ headers: [], rows: [], error: "Failed to read file.", validationErrors: [] });
    reader.readAsArrayBuffer(file);
  });
}

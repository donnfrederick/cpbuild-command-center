/**
 * Export Field Tracker / UPM rows to .xlsx using the same column headers accepted by
 * parseUPM / parseUPMFromFile and mapRowToColumns (re-uploadable).
 */

import * as XLSX from "xlsx";
import { formatSpreadsheetNumberForExport } from "@/lib/parse-spreadsheet-number";

/** Shape of a unit row from GET /api/projects/[id]/units (spreadsheet-relevant fields). */
export interface FieldTrackerExportUnit {
  rowIndex: number;
  building: string;
  level: string;
  unit: string;
  area: string | null;
  shipPhase: string | null;
  buildPhase: string | null;
  scheme: string | null;
  unitType: string | null;
  description: string;
  scopeType: { code: string; name?: string } | null;
  csiPrimeCode: string | null;
  csiDetailCode: string | null;
  locationType: { code: string; name?: string } | null;
  costType: { code: string; name?: string } | null;
  installer: { code: string; name?: string } | null;
  qty: number | null;
  uom: { code: string; name?: string } | null;
  unitRate: number | null;
  budgetedManHours: number | null;
  startDate: string | null;
  finishDate: string | null;
  percentComplete: number | null;
  actualManHours: number | null;
}

/**
 * Column headers in order — first cell is "Building" (required by lib/upm-parse).
 * Aliases in mapRowToColumns accept these names on re-import.
 */
export const FIELD_TRACKER_IMPORT_HEADERS = [
  "Building",
  "Level",
  "Unit",
  "Area",
  "Ship Phase",
  "Build Phase",
  "Scheme",
  "Unit Type",
  "Description",
  "Scope Type",
  "CSI Prime Code",
  "CSI (Detail) Code",
  "LType (U/C)",
  "Cost Type (L/S)",
  "Installer",
  "QTY",
  "UOM",
  "Unit Rate",
  "Budgeted MH",
  "Start",
  "Finish",
  "% Complete",
  "Actual MH",
] as const;

export type FieldTrackerImportHeader = (typeof FIELD_TRACKER_IMPORT_HEADERS)[number];

/** Second sheet: how to use this file for local upload testing (English, tooling-only). */
export const FIELD_TRACKER_EXPORT_README_AOA: string[][] = [
  ["Field Tracker export — re-upload notes"],
  [""],
  [
    "Rows match the in-app upload format. Use this file locally to exercise merge, append, and overwrite.",
  ],
  [""],
  ["Where: Project → Field Tracker → Upload (or create-project Field Tracker step)."],
  [""],
  ["Overwrite — replace all Field Tracker rows for that project."],
  ["Merge — add only rows whose Building + Level + Unit are not already present."],
  ["Append — add every row to the bottom (duplicates allowed)."],
  [""],
  [
    "Scope stage, row status, and QC inspection are not in this file; they stay in the app only.",
  ],
];

function fmtQty(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "";
  return formatSpreadsheetNumberForExport(n, 4);
}

function fmtMoneyOrHours(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "";
  return formatSpreadsheetNumberForExport(n, 4);
}

function fmtPercent(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "";
  return formatSpreadsheetNumberForExport(n, 2);
}

function fkCode(v: { code: string } | null | undefined): string {
  if (!v) return "";
  return (v.code ?? "").trim();
}

/** One spreadsheet row object keyed by FIELD_TRACKER_IMPORT_HEADERS. */
export function fieldTrackerRecordFromProjectRow(u: FieldTrackerExportUnit): Record<string, string> {
  return {
    Building: u.building ?? "",
    Level: u.level ?? "",
    Unit: u.unit ?? "",
    Area: u.area == null ? "" : String(u.area),
    "Ship Phase": u.shipPhase ?? "",
    "Build Phase": u.buildPhase ?? "",
    Scheme: u.scheme ?? "",
    "Unit Type": u.unitType ?? "",
    Description: u.description ?? "",
    "Scope Type": fkCode(u.scopeType),
    "CSI Prime Code": u.csiPrimeCode ?? "",
    "CSI (Detail) Code": u.csiDetailCode ?? "",
    "LType (U/C)": fkCode(u.locationType),
    "Cost Type (L/S)": fkCode(u.costType),
    Installer: fkCode(u.installer),
    QTY: fmtQty(u.qty),
    UOM: fkCode(u.uom),
    "Unit Rate": fmtMoneyOrHours(u.unitRate),
    "Budgeted MH": fmtMoneyOrHours(u.budgetedManHours),
    Start: u.startDate?.slice(0, 10) ?? "",
    Finish: u.finishDate?.slice(0, 10) ?? "",
    "% Complete": fmtPercent(u.percentComplete),
    "Actual MH": fmtMoneyOrHours(u.actualManHours),
  };
}

export function fieldTrackerRecordsToAoA(records: Record<string, string>[]): string[][] {
  const headers = [...FIELD_TRACKER_IMPORT_HEADERS];
  const aoa: string[][] = [headers];
  for (const r of records) {
    aoa.push(headers.map((h) => r[h] ?? ""));
  }
  return aoa;
}

export function buildFieldTrackerWorkbook(records: Record<string, string>[]): XLSX.WorkBook {
  const aoa = fieldTrackerRecordsToAoA(records);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "UPM");
  const readmeWs = XLSX.utils.aoa_to_sheet(FIELD_TRACKER_EXPORT_README_AOA);
  XLSX.utils.book_append_sheet(wb, readmeWs, "Readme");
  return wb;
}

/** Safe base name for the download (no path separators). */
export function sanitizeFieldTrackerFileBase(name: string): string {
  const trimmed = name.trim();
  const safe = trimmed.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return safe.slice(0, 80) || "FieldTracker";
}

export function downloadFieldTrackerXlsx(records: Record<string, string>[], baseFileName: string): void {
  const wb = buildFieldTrackerWorkbook(records);
  const safe = sanitizeFieldTrackerFileBase(baseFileName);
  XLSX.writeFile(wb, `${safe}_FieldTracker.xlsx`);
}

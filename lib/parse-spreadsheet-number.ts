/**
 * Parse numeric strings copied from Excel / Google Sheets in US locale.
 *
 * **In scope:** Thousands separators as comma (`1,200`, `12,345.67`).
 *
 * **Out of scope:** European format (`1.234,56`) — would need different
 * normalization. Field Tracker exports are treated as US-formatted.
 */

export function parseSpreadsheetNumber(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const normalized = v.replace(/,/g, "");
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** True when empty/whitespace-only, or when the value parses as a finite number after US-style comma stripping. */
export function isValidSpreadsheetNumberString(raw: string): boolean {
  const v = raw.trim();
  if (!v) return true;
  return parseSpreadsheetNumber(raw) !== null;
}

/**
 * Format numbers for Field Tracker / UPM Excel export so re-upload validation
 * (`isValidSpreadsheetNumberString`) passes and float noise from JSON/DB does not
 * break local upload experiments.
 */
export function formatSpreadsheetNumberForExport(n: number, maxFractionDigits: number): string {
  if (!Number.isFinite(n)) return "";
  const rounded = Number(n.toFixed(maxFractionDigits));
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

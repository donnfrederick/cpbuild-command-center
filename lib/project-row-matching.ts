import { mapRowToColumns } from "@/lib/project-rows";

export function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function locKey(
  building: string | null | undefined,
  level: string | null | undefined,
  unit: string | null | undefined,
): string {
  return `${norm(building)}|${norm(level)}|${norm(unit)}`;
}

/** Stable key for a scope row: building|level|unit|description (normalized). */
export function fullRowKeyFromParts(input: {
  building: string | null | undefined;
  level: string | null | undefined;
  unit: string | null | undefined;
  description: string | null | undefined;
}): string {
  return `${locKey(input.building, input.level, input.unit)}|${norm(input.description)}`;
}

/** Stable key from UPM spreadsheet row record. */
export function fullRowKeyFromSpreadsheetRow(row: Record<string, string>): string {
  const c = mapRowToColumns(row);
  return fullRowKeyFromParts({
    building: c.building,
    level: c.level,
    unit: c.unit,
    description: c.description,
  });
}

export interface RowKeyIndexEntry {
  id: string;
}

/** Map fullRowKey → project row id (last wins if duplicate keys). */
export function buildFullRowKeyIndex(
  rows: Array<{
    id: string;
    building: string;
    level: string;
    unit: string;
    description: string;
  }>,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    index.set(
      fullRowKeyFromParts({
        building: row.building,
        level: row.level,
        unit: row.unit,
        description: row.description,
      }),
      row.id,
    );
  }
  return index;
}

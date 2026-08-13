import { parseFieldDailyLocationLabel } from "@/lib/field-daily-report/location-label";
import type { FieldDailyReportStatusUnitEntry } from "@/lib/field-daily-report/types";

export interface FieldDailyUnitDetailTarget {
  building: string;
  level: string;
  unit: string;
}

/** Composite unit ref key matching album `unitPhotoUnitRef` (`building|level|unit`). */
export function unitLocationKey(entry: FieldDailyReportStatusUnitEntry): string {
  const building = entry.building?.trim();
  const level = entry.level?.trim();
  const unit = entry.unit?.trim();
  if (building || level || unit) {
    return `${building ?? ""}|${level ?? ""}|${unit ?? ""}`;
  }
  const target = resolveUnitDetailTarget(entry);
  if (target) {
    return `${target.building}|${target.level}|${target.unit}`;
  }
  return "||";
}

export function unitDedupeKey(entry: FieldDailyReportStatusUnitEntry): string {
  return `${unitLocationKey(entry)}|${entry.scopeName ?? ""}`;
}

/** Resolve lookup coordinates for opening the Locations unit detail modal. */
export function resolveUnitDetailTarget(
  entry: FieldDailyReportStatusUnitEntry,
): FieldDailyUnitDetailTarget | null {
  const unit = entry.unit?.trim();
  if (unit) {
    return {
      building: entry.building?.trim() ?? "",
      level: entry.level?.trim() ?? "",
      unit,
    };
  }

  const parsed = parseFieldDailyLocationLabel(entry.locationLabel);
  if (!parsed?.unit?.trim()) return null;

  return {
    building: parsed.building?.trim() ?? "",
    level: parsed.level?.trim() ?? "",
    unit: parsed.unit.trim(),
  };
}

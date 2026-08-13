/**
 * Shared helpers for inspection sheet headers (record view + retry).
 */

export interface InspectionLocationParts {
  building?: string | null;
  level?: string | null;
  unit?: string | null;
}

/** "Bldg 1 · Level 3" — building and level only (unit is the hero title). */
export function formatInspectionBuildingLevelLabel(
  parts?: InspectionLocationParts | null,
): string | undefined {
  if (!parts) return undefined;
  const label = [
    parts.building?.trim() ? `Bldg ${parts.building.trim()}` : null,
    parts.level?.trim() ? `Level ${parts.level.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return label || undefined;
}

/** Hero title for inspection headers — e.g. "Unit 303". */
export function formatInspectionUnitTitle(
  parts?: InspectionLocationParts | null,
  fallback?: string | null,
): string | undefined {
  if (parts?.unit?.trim()) return `Unit ${parts.unit.trim()}`;
  const trimmed = fallback?.trim();
  return trimmed || undefined;
}

/** "Bldg 1 · Level 3 · Unit 303" — same format everywhere. */
export function formatInspectionLocationLabel(
  parts?: InspectionLocationParts | null,
): string | undefined {
  if (!parts) return undefined;
  const label = [
    parts.building?.trim() ? `Bldg ${parts.building.trim()}` : null,
    parts.level?.trim() ? `Level ${parts.level.trim()}` : null,
    parts.unit?.trim() ? `Unit ${parts.unit.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return label || undefined;
}

export function formatInspectionDateLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatInspectionDateTimeLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

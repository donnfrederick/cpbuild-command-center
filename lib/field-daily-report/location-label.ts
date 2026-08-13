interface UnitRefParts {
  building?: string;
  level?: string;
  unit?: string;
}

function partsFromUnitRef(unitRef: string): UnitRefParts {
  const [building = "", level = "", unit = ""] = unitRef.split("|");
  return {
    building: building.trim() || undefined,
    level: level.trim() || undefined,
    unit: unit.trim() || undefined,
  };
}

/** Building / level / unit coordinates from activity metadata (for unit detail deep links). */
export function extractLocationParts(metadata: Record<string, unknown>): UnitRefParts {
  const building = String(metadata.building ?? "").trim() || undefined;
  const level = String(metadata.level ?? "").trim() || undefined;
  const unit = String(metadata.unit ?? "").trim() || undefined;
  if (building || level || unit) {
    return { building, level, unit };
  }

  const unitRef = metadata.unitRef;
  if (typeof unitRef === "string" && unitRef.trim()) {
    return partsFromUnitRef(unitRef);
  }

  return {};
}

/** Parse a stored location label back into lookup coordinates when legacy snapshots omit fields. */
export function parseFieldDailyLocationLabel(label: string): UnitRefParts | null {
  const parts = label.split("·").map((segment) => segment.trim());
  let building: string | undefined;
  let level: string | undefined;
  let unit: string | undefined;

  for (const part of parts) {
    const bldg = part.match(/^Bldg\s+(.+)$/i);
    if (bldg) {
      building = bldg[1].trim();
      continue;
    }
    const lvl = part.match(/^L(.+)$/i);
    if (lvl) {
      level = lvl[1].trim();
      continue;
    }
    const unt = part.match(/^Unit\s+(.+)$/i);
    if (unt) {
      unit = unt[1].trim();
      continue;
    }
    if (building && level && unit) break;
  }

  if (!unit) return null;
  return { building, level, unit };
}

function formatParts(parts: UnitRefParts, scopeName?: string): string {
  const segments: string[] = [];
  if (parts.building) segments.push(`Bldg ${parts.building}`);
  if (parts.level) segments.push(`L${parts.level}`);
  if (parts.unit) segments.push(`Unit ${parts.unit}`);
  if (scopeName) segments.push(scopeName);
  return segments.length > 0 ? segments.join(" · ") : "";
}

/** Human-readable location for a field daily report line item. */
export function formatFieldDailyLocationLabel(
  metadata: Record<string, unknown>,
  options?: { omitScope?: boolean },
): string {
  const bulkSummary = formatBulkStatusLocationSummary(metadata);
  if (bulkSummary) return bulkSummary;

  const building = String(metadata.building ?? "").trim();
  const level = String(metadata.level ?? "").trim();
  const unit = String(metadata.unit ?? "").trim();
  const scopeName = options?.omitScope ? "" : String(metadata.scopeName ?? "").trim();

  if (building || level || unit) {
    const label = formatParts({ building: building || undefined, level: level || undefined, unit: unit || undefined }, scopeName || undefined);
    if (label) return label;
  }

  const unitRef = metadata.unitRef;
  if (typeof unitRef === "string" && unitRef.trim()) {
    const label = formatParts(partsFromUnitRef(unitRef), scopeName || undefined);
    if (label) return label;
  }

  if (scopeName) return scopeName;
  return "Project level";
}

function formatUnitRefObject(ref: unknown): string | null {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as Record<string, unknown>;
  const label = formatParts({
    building: String(r.building ?? "").trim() || undefined,
    level: String(r.level ?? "").trim() || undefined,
    unit: String(r.unit ?? "").trim() || undefined,
  });
  return label || null;
}

/** Summarize bulk status unitRefs for rollup headlines. */
export function formatBulkStatusLocationSummary(metadata: Record<string, unknown>): string | undefined {
  const refs = metadata.unitRefs;
  if (!Array.isArray(refs) || refs.length === 0) return undefined;

  const labels = refs
    .map((ref) => formatUnitRefObject(ref))
    .filter((label): label is string => Boolean(label));

  if (labels.length === 0) return undefined;
  if (labels.length === 1) return labels[0];

  const units = refs
    .map((ref) => (ref && typeof ref === "object" ? String((ref as Record<string, unknown>).unit ?? "").trim() : ""))
    .filter(Boolean)
    .sort();

  const building = refs[0] && typeof refs[0] === "object" ? String((refs[0] as Record<string, unknown>).building ?? "").trim() : "";
  const level = refs[0] && typeof refs[0] === "object" ? String((refs[0] as Record<string, unknown>).level ?? "").trim() : "";

  if (units.length >= 2 && building && level) {
    const first = units[0];
    const last = units[units.length - 1];
    const unitRange = first === last ? `Unit ${first}` : `Units ${first}–${last}`;
    return `Bldg ${building} · L${level} · ${unitRange} (${units.length})`;
  }

  return `${labels[0]} +${labels.length - 1} more`;
}

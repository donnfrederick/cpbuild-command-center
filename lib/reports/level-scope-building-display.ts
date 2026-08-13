import type { CSSProperties } from "react";

/** Display label for a building row — prefixes "Building" when the raw name omits it. */
export function formatLevelScopeBuildingLabel(
  buildingName: string,
  buildingWord: string,
): string {
  const trimmed = buildingName.trim();
  if (!trimmed) return buildingWord;
  if (/^building\b/i.test(trimmed)) return trimmed;
  return `${buildingWord} ${trimmed}`;
}

/** Compact header badge — icon implies building; strip a leading "Building" word. */
export function formatLevelScopeBuildingHeaderLabel(buildingName: string): string {
  const trimmed = buildingName.trim();
  if (!trimmed) return "";
  const withoutPrefix = trimmed.replace(/^building\s+/i, "").trim();
  return withoutPrefix || trimmed;
}

/** CSS custom property for building-stripe-themed header chrome (anchor fill, borders). */
export function levelScopeBuildingStripeCssVar(stripe: string): CSSProperties {
  return { "--level-scope-building-stripe": stripe } as CSSProperties;
}

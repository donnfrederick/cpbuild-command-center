/**
 * Client-safe level key helper (no DB imports).
 * Used by portfolio grid conversion and server-side level-scope aggregation.
 */

/** Build a display key for a (building, level) pair. */
export function buildLevelKey(building: string, level: string, multiBuilding: boolean): string {
  const b = building.trim();
  const l = level.trim() || "No Level";
  if (!multiBuilding || !b) return l;
  return `${b} › ${l}`;
}

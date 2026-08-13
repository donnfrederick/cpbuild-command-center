const DEFAULT_MAX = 100;

/** Parse optional ?limit= for list endpoints; undefined when absent or invalid. */
export function parseListLimit(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number.parseInt(raw, 10);
  if (n < 1) return undefined;
  return Math.min(n, DEFAULT_MAX);
}

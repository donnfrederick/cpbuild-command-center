const DETAILS_TAIL_MAX = 220;

/**
 * Formats export-pdf API failure JSON into a toast or inline UI string.
 * The API omits `details` in production; when present it is truncated for display.
 */
export function formatPdfExportErrorToast(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;

  const o = body as { error?: unknown; details?: unknown; code?: unknown };
  const base =
    typeof o.error === "string" && o.error.trim().length > 0
      ? o.error.trim()
      : fallback;

  const details =
    typeof o.details === "string" && o.details.trim().length > 0 ? o.details.trim() : "";

  if (!details) return base;

  const short =
    details.length > DETAILS_TAIL_MAX
      ? `${details.slice(0, DETAILS_TAIL_MAX)}…`
      : details;

  return `${base} — ${short}`;
}

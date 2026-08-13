/** Max length for user-supplied PDF cover titles from API JSON bodies. */
export const PDF_COVER_TITLE_MAX_LEN = 200;

/**
 * Coerces an untrusted JSON body field into a PDF cover title string.
 * Non-strings → undefined (caller uses defaults). Trimmed + length-capped.
 */
export function normalizePdfCoverTitleFromBody(
  raw: unknown,
  maxLen: number = PDF_COVER_TITLE_MAX_LEN,
): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : undefined;
}

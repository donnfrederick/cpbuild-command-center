/**
 * Shared Supabase URL resolution (safe for scripts and server code).
 * Server-only callers should import from lib/supabase-url.ts instead.
 */

/** Decode a JWT payload segment (base64url) to UTF-8 JSON. */
export function decodeJwtPayloadSegment(segment: string): unknown {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const normalized = padded + "=".repeat(padLen);
  return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
}

/**
 * Resolve the Supabase project URL from environment variables.
 * Returns an empty string when no source yields a URL.
 */
export function getSupabaseUrlFromEnv(): string {
  const url = process.env.SUPABASE_URL;
  if (url?.trim()) return url.trim().replace(/\/$/, "");

  const dbUrl = process.env.DATABASE_URL ?? "";
  const directMatch = dbUrl.match(/postgres\.([a-z0-9]+):/);
  if (directMatch) return `https://${directMatch[1]}.supabase.co`;

  const jwt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (jwt) {
    try {
      const payloadB64 = jwt.split(".")[1];
      if (payloadB64) {
        const payload = decodeJwtPayloadSegment(payloadB64) as { ref?: string };
        if (payload.ref) return `https://${payload.ref}.supabase.co`;
      }
    } catch {
      /* fall through */
    }
  }

  return "";
}

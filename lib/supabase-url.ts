import "server-only";
import { getSupabaseUrlFromEnv } from "@/lib/supabase-url-shared";

/**
 * Resolve the Supabase project URL from environment variables.
 *
 * Tries three sources in order:
 *   1. SUPABASE_URL (explicit)
 *   2. DATABASE_URL (derive project ref from postgres.<ref>: pattern)
 *   3. SUPABASE_SERVICE_ROLE_KEY (decode the JWT payload's `ref` claim)
 *
 * Returns an empty string when no source yields a URL (soft failure, suitable
 * for optional callers such as the PDF image-fetch pipeline). Callers that
 * require the URL to be present should throw on an empty return value.
 */
export function getSupabaseUrl(): string {
  return getSupabaseUrlFromEnv();
}

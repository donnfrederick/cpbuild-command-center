import { getSupabaseUrlFromEnv } from "@/lib/supabase-url-shared";

/** Canonical signed-URL prefix — objects live in the shared field-media bucket. */
const SIGNED_FIELD_MEDIA_FEEDBACK_PATH =
  "/storage/v1/object/sign/field-media/feedback-screenshots/";

/** Legacy prefix when uploads used a dedicated feedback-screenshots bucket. */
const LEGACY_SIGNED_FEEDBACK_BUCKET_PATH = "/storage/v1/object/sign/feedback-screenshots/";

const LOCAL_FEEDBACK_SCREENSHOT_KEY_PREFIX = "field-media/feedback-screenshots/";

function isValidLocalFeedbackScreenshotKey(key: string): boolean {
  if (!key.startsWith(LOCAL_FEEDBACK_SCREENSHOT_KEY_PREFIX)) return false;
  if (key.includes("..")) return false;
  const rest = key.slice("field-media/".length);
  if (!rest || rest.startsWith("/") || rest.endsWith("/")) return false;
  const segments = rest.split("/");
  if (segments.length < 2 || segments[0] !== "feedback-screenshots") return false;
  return segments.every((s) => s.length > 0 && !s.includes(".."));
}

function isSignedFeedbackScreenshotPath(pathname: string): boolean {
  return (
    pathname.startsWith(SIGNED_FIELD_MEDIA_FEEDBACK_PATH) ||
    pathname.startsWith(LEGACY_SIGNED_FEEDBACK_BUCKET_PATH)
  );
}

/**
 * Returns true when `url` is an HTTPS signed URL for a feedback screenshot object
 * on the configured Supabase host. Fails closed when Supabase URL cannot be resolved.
 */
export function isFeedbackScreenshotSignedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!isSignedFeedbackScreenshotPath(parsed.pathname)) return false;
    if (parsed.pathname.includes("/..")) return false;

    const token = parsed.searchParams.get("token")?.trim();
    if (!token) return false;

    const supabaseUrl = getSupabaseUrlFromEnv();
    if (!supabaseUrl) return false;

    const expectedHost = new URL(supabaseUrl).hostname;
    return parsed.hostname === expectedHost;
  } catch {
    return false;
  }
}

/**
 * Returns true when `url` points at a locally stored feedback screenshot served by
 * GET /api/upload/field-media/file (used when SUPABASE_SERVICE_ROLE_KEY is unset).
 */
export function isFeedbackScreenshotLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.pathname !== "/api/upload/field-media/file") return false;
    const key = parsed.searchParams.get("key");
    if (!key?.startsWith(LOCAL_FEEDBACK_SCREENSHOT_KEY_PREFIX)) return false;
    return isValidLocalFeedbackScreenshotKey(key);
  } catch {
    return false;
  }
}

/** Accepts Supabase signed URLs or local field-media URLs from upload-screenshot. */
export function isFeedbackScreenshotStorageUrl(url: string): boolean {
  return isFeedbackScreenshotSignedUrl(url) || isFeedbackScreenshotLocalUrl(url);
}

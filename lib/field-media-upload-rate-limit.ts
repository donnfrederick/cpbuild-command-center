/**
 * In-memory sliding-window rate limit for POST /api/upload/field-media.
 *
 * **Per Node process** — on multi-instance deployments each replica has its own
 * counters, so effective limits are softer until Redis (or similar) is added.
 *
 * Tuned so a legitimate batch of MAX_MEDIA_ATTACHMENTS_PER_ENTITY uploads plus
 * client retries stays under the per-minute cap (floor 100/min); offline queue
 * flush is the main consumer of burst capacity.
 */
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";

const ONE_MIN_MS = 60_000;
const TEN_MIN_MS = 10 * ONE_MIN_MS;
/**
 * Max upload attempts in the last minute per user. Floor is 100 to accommodate
 * large single-session batches; grows automatically if
 * MAX_MEDIA_ATTACHMENTS_PER_ENTITY + 25 ever exceeds that floor.
 */
export const FIELD_MEDIA_UPLOADS_PER_MINUTE_LIMIT = Math.max(
  MAX_MEDIA_ATTACHMENTS_PER_ENTITY + 25,
  100,
);
/** Max upload attempts in a 10-minute sliding window (sustained abuse cap). */
export const FIELD_MEDIA_UPLOADS_PER_TEN_MIN_LIMIT = 220;

const uploadTimestampsByUser = new Map<string, number[]>();

export type FieldMediaRateLimitDenied = {
  ok: false;
  windowKey: "per_minute" | "per_ten_minute";
  count: number;
  limit: number;
};

export type FieldMediaRateLimitOk = { ok: true };

/**
 * Records this upload attempt and returns whether it is within limits.
 * The attempt is always recorded (including denied ones) so bursts count toward abuse detection.
 */
export function recordFieldMediaUploadAttempt(userId: string): FieldMediaRateLimitOk | FieldMediaRateLimitDenied {
  const now = Date.now();
  let stamps = uploadTimestampsByUser.get(userId) ?? [];
  stamps = stamps.filter((t) => now - t < TEN_MIN_MS);
  stamps.push(now);
  uploadTimestampsByUser.set(userId, stamps);

  const inLastMinute = stamps.filter((t) => now - t < ONE_MIN_MS).length;
  if (inLastMinute > FIELD_MEDIA_UPLOADS_PER_MINUTE_LIMIT) {
    return {
      ok: false,
      windowKey: "per_minute",
      count: inLastMinute,
      limit: FIELD_MEDIA_UPLOADS_PER_MINUTE_LIMIT,
    };
  }

  const inLastTenMin = stamps.length;
  if (inLastTenMin > FIELD_MEDIA_UPLOADS_PER_TEN_MIN_LIMIT) {
    return {
      ok: false,
      windowKey: "per_ten_minute",
      count: inLastTenMin,
      limit: FIELD_MEDIA_UPLOADS_PER_TEN_MIN_LIMIT,
    };
  }

  return { ok: true };
}

/** Test helper — clears all windows. */
export function resetFieldMediaRateLimitForTests(): void {
  uploadTimestampsByUser.clear();
}

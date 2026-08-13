/**
 * Per-user in-memory rate limiter for the optional AI-assisted feedback flow.
 *
 * Keeps a single authenticated user from pounding the Gemini endpoint while
 * still feeling conversational. In-memory is sufficient: Field Tracker runs as
 * a single Railway service, and a missed enforcement on a cold-start boundary
 * is harmless for this non-critical path.
 */

const rateLimitMap = new Map<string, number>();

/** Minimum milliseconds between consecutive calls for the same user. */
export const FEEDBACK_ASSIST_RATE_LIMIT_MS = 5_000;

/**
 * Record a call attempt for `userId`. Returns `true` if the call is allowed
 * (and records the timestamp), `false` if the user is still cooling down.
 */
export function checkFeedbackAssistRateLimit(userId: string): boolean {
  const last = rateLimitMap.get(userId);
  const now = Date.now();
  if (last !== undefined && now - last < FEEDBACK_ASSIST_RATE_LIMIT_MS) {
    return false;
  }
  rateLimitMap.set(userId, now);
  return true;
}

/** Test-only: clear the per-user tracking map. */
export function _resetFeedbackAssistRateLimit(): void {
  rateLimitMap.clear();
}

// ── Video analysis rate limit ────────────────────────────────────────────────
// Video turns cost roughly 10-30x a text turn (upload + Gemini Files API
// polling + longer inference). We keep the per-turn 5-second cooldown above
// and stack a separate per-hour cap on top for video specifically.

/** Rolling hourly cap for video-seeded feedback-assist calls. */
export const FEEDBACK_ASSIST_VIDEO_MAX_PER_HOUR = 5;
export const FEEDBACK_ASSIST_VIDEO_WINDOW_MS = 60 * 60 * 1000;

/** Per-user ring buffer of recent video call timestamps (ms since epoch). */
const videoRateLimitMap = new Map<string, number[]>();

/**
 * Record a video call attempt for `userId`. Returns `true` when the call is
 * within the hourly budget (and records the timestamp), `false` otherwise.
 *
 * Independent of the text-turn cooldown above: a user may (and often will)
 * trigger both a text turn and a video turn within the same second.
 */
export function checkFeedbackAssistVideoRateLimit(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - FEEDBACK_ASSIST_VIDEO_WINDOW_MS;
  const existing = videoRateLimitMap.get(userId) ?? [];
  const pruned = existing.filter((ts) => ts > cutoff);
  if (pruned.length >= FEEDBACK_ASSIST_VIDEO_MAX_PER_HOUR) {
    videoRateLimitMap.set(userId, pruned);
    return false;
  }
  pruned.push(now);
  videoRateLimitMap.set(userId, pruned);
  return true;
}

/** Test-only: clear the per-user tracking map. */
export function _resetFeedbackAssistVideoRateLimit(): void {
  videoRateLimitMap.clear();
}

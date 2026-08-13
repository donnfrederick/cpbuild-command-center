import { createHash, timingSafeEqual } from "node:crypto";

function sha256Utf8(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

/** Constant-time string compare via SHA-256 digests (32-byte fixed length). */
export function feedbackBridgeTimingSafeEqual(a: string, b: string): boolean {
  const ah = sha256Utf8(a);
  const bh = sha256Utf8(b);
  return timingSafeEqual(ah, bh);
}

export function getFeedbackBridgeSecret(): string | undefined {
  const s = process.env.FEEDBACK_BRIDGE_SECRET?.trim();
  return s || undefined;
}

export function isFeedbackBridgeConfiguredOnThisServer(): boolean {
  return Boolean(getFeedbackBridgeSecret());
}

/**
 * Validates `Authorization: Bearer <secret>` for internal feedback bridge routes.
 * Accepts `Request` (and `NextRequest`) — only `headers.get()` is used.
 */
export function verifyFeedbackBridgeBearer(req: Pick<Request, "headers">): boolean {
  const expected = getFeedbackBridgeSecret();
  if (!expected) return false;

  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();

  return feedbackBridgeTimingSafeEqual(token, expected);
}

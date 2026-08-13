import { feedbackBridgeTimingSafeEqual } from "@/lib/feedback-bridge-auth";

export function getFieldDailyCronSecret(): string | undefined {
  const secret = process.env.FIELD_DAILY_CRON_SECRET?.trim();
  return secret || undefined;
}

export function isFieldDailyCronConfigured(): boolean {
  return Boolean(getFieldDailyCronSecret());
}

/** Validates `Authorization: Bearer <secret>` for scheduled field-daily cron routes. */
export function verifyFieldDailyCronBearer(req: Pick<Request, "headers">): boolean {
  const expected = getFieldDailyCronSecret();
  if (!expected) return false;

  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();

  return feedbackBridgeTimingSafeEqual(token, expected);
}

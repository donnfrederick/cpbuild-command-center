import { getPathname } from "@/i18n/navigation";
import type { FeedbackEnvironment } from "@/lib/feedback-environment";

/** Absolute URL to the dedicated feedback detail page (locale-prefixed). */
export function buildFeedbackDetailAbsoluteUrl(
  origin: string,
  locale: string,
  feedbackId: string,
  environment?: FeedbackEnvironment
): string {
  const base = origin.replace(/\/$/, "");
  const path = getPathname({ locale, href: `/feedback/${feedbackId}` });
  const q =
    environment === "production" || environment === "development"
      ? `?environment=${encodeURIComponent(environment)}`
      : "";
  return `${base}${path}${q}`;
}

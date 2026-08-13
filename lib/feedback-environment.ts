import type { NextRequest } from "next/server";

/** Where a feedback row lives (which database / deployment). */
export type FeedbackEnvironment = "development" | "production";

/**
 * Works with `NextRequest` (has `nextUrl`) and plain `Request` used in tests.
 */
export function feedbackRequestSearchParams(
  req: Request & { nextUrl?: NextRequest["nextUrl"] }
): URLSearchParams {
  if (req.nextUrl) {
    return req.nextUrl.searchParams;
  }
  return new URL(req.url).searchParams;
}

export type FeedbackListProdFeedStatus = "off" | "ok" | "error";

export interface FeedbackListApiResponse {
  reports: unknown[];
  prodFeed: FeedbackListProdFeedStatus;
}

export function parseFeedbackEnvironmentParam(
  value: string | null
): FeedbackEnvironment | null {
  if (value === "development" || value === "production") return value;
  return null;
}

export function parseFeedbackEnvironmentFromRequest(
  req: Request & { nextUrl?: NextRequest["nextUrl"] }
): FeedbackEnvironment | null {
  return parseFeedbackEnvironmentParam(
    feedbackRequestSearchParams(req).get("environment")
  );
}

"use client";

import { collectActivityLocation } from "@/lib/activity/collect-activity-location";
import { appendActivityLocationToBody } from "@/lib/activity/append-activity-location";

/** Collect GPS and merge into a JSON mutation body (field actions). */
export async function enrichBodyWithActivityLocation<T extends Record<string, unknown>>(
  body: T,
): Promise<T & { activityLocation: Awaited<ReturnType<typeof collectActivityLocation>> }> {
  const activityLocation = await collectActivityLocation();
  return appendActivityLocationToBody(body, activityLocation);
}

import type { ActivityClientLocation } from "@/lib/activity/activity-location-schema";

/** Merge activityLocation into a JSON request body object. */
export function appendActivityLocationToBody<T extends Record<string, unknown>>(
  body: T,
  activityLocation: ActivityClientLocation,
): T & { activityLocation: ActivityClientLocation } {
  return { ...body, activityLocation };
}

/** Append activityLocation to fetch init when body is JSON. */
export function appendActivityLocationToJsonInit(
  init: RequestInit | undefined,
  activityLocation: ActivityClientLocation,
): RequestInit {
  const prior =
    typeof init?.body === "string"
      ? (JSON.parse(init.body) as Record<string, unknown>)
      : {};
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify({ ...prior, activityLocation }),
  };
}

import type { LocationOutcome } from "@/lib/activity/activity-location-schema";
import { LOCATION_OUTCOME_VALUES } from "@/lib/activity/activity-location-schema";

export const ACTIVITY_LOCATION_FILTER_PRESETS: Record<
  "all" | "onMap" | "gpsFailed" | "notCaptured" | "legacy",
  LocationOutcome[]
> = {
  all: [],
  onMap: ["on_map"],
  gpsFailed: ["denied", "timeout", "unavailable"],
  notCaptured: ["no_capture"],
  legacy: ["legacy"],
};

export { LOCATION_OUTCOME_VALUES };

export function locationOutcomesEqual(a: LocationOutcome[], b: LocationOutcome[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((o) => setB.has(o));
}

export function toggleLocationOutcome(
  current: LocationOutcome[],
  outcome: LocationOutcome,
): LocationOutcome[] {
  return current.includes(outcome)
    ? current.filter((o) => o !== outcome)
    : [...current, outcome];
}

export function locationOutcomeParam(outcomes: LocationOutcome[]): string {
  return outcomes.join(",");
}

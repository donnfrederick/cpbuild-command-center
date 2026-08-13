import { describe, expect, it } from "vitest";
import {
  ACTIVITY_GPS_TRACKING_EPOCH,
} from "@/lib/activity/activity-location-schema";
import {
  buildActivityLocationOutcomeWhere,
  parseLocationOutcomeParam,
} from "@/lib/activity/activity-location-outcome-filter";

describe("parseLocationOutcomeParam", () => {
  it("returns empty array for blank input", () => {
    expect(parseLocationOutcomeParam()).toEqual([]);
    expect(parseLocationOutcomeParam("   ")).toEqual([]);
  });

  it("parses comma-separated valid outcomes", () => {
    expect(parseLocationOutcomeParam("on_map,denied,no_capture")).toEqual([
      "on_map",
      "denied",
      "no_capture",
    ]);
  });

  it("drops unknown tokens", () => {
    expect(parseLocationOutcomeParam("on_map,invalid,legacy")).toEqual([
      "on_map",
      "legacy",
    ]);
  });
});

describe("buildActivityLocationOutcomeWhere", () => {
  it("returns empty object when no outcomes selected", () => {
    expect(buildActivityLocationOutcomeWhere([])).toEqual({});
  });

  it("builds on_map where clause", () => {
    expect(buildActivityLocationOutcomeWhere(["on_map"])).toEqual({
      locationContext: {
        gpsStatus: "GRANTED",
        latitude: { not: null },
        longitude: { not: null },
      },
    });
  });

  it("builds no_capture where clause with GPS epoch", () => {
    expect(buildActivityLocationOutcomeWhere(["no_capture"])).toEqual({
      locationContext: null,
      createdAt: { gte: ACTIVITY_GPS_TRACKING_EPOCH },
    });
  });

  it("builds legacy where clause before GPS epoch", () => {
    expect(buildActivityLocationOutcomeWhere(["legacy"])).toEqual({
      locationContext: null,
      createdAt: { lt: ACTIVITY_GPS_TRACKING_EPOCH },
    });
  });

  it("combines multiple outcomes with OR", () => {
    expect(buildActivityLocationOutcomeWhere(["denied", "timeout"])).toEqual({
      OR: [
        { locationContext: { gpsStatus: "DENIED" } },
        { locationContext: { gpsStatus: "TIMEOUT" } },
      ],
    });
  });
});

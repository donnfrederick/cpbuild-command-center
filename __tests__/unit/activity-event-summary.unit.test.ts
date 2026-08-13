import { describe, it, expect } from "vitest";
import { buildActivityEventDescription } from "@/lib/activity-event-summary";

const locationMetadata = {
  building: "North",
  level: "2",
  unit: "N208",
  scopeName: "Cabinetry",
};

describe("buildActivityEventDescription()", () => {
  it("omits scope from subcontractor updates when it is on the location chip", () => {
    expect(
      buildActivityEventDescription({
        eventType: "SCOPE_SUBCONTRACTOR_UPDATED",
        metadata: {
          ...locationMetadata,
          subcontractorName: "Acme LLC",
          toUnifierSubId: "sub-1",
        },
      }),
    ).toBe('Set subcontractor to "Acme LLC"');
  });

  it("formats status updates as from → to without repeating scope from the chip", () => {
    expect(
      buildActivityEventDescription({
        eventType: "SCOPE_STATUS_UPDATED",
        metadata: {
          ...locationMetadata,
          fromStage: "INSTALL",
          fromStatus: "IN_PROGRESS",
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      }),
    ).toBe(
      "Updated from Install: In Progress status → Install Complete-Verified",
    );
  });

  it("distinguishes verified vs unverified install complete in status updates", () => {
    expect(
      buildActivityEventDescription({
        eventType: "SCOPE_STATUS_UPDATED",
        metadata: {
          ...locationMetadata,
          fromStage: "STAGING",
          fromStatus: "IN_PROGRESS",
          toStage: "INSTALL",
          toStatus: "PENDING_VERIFICATION",
        },
      }),
    ).toBe(
      "Updated from In Staging status → Install Complete-Unverified",
    );
  });

  it("uses unset when prior status was not recorded", () => {
    expect(
      buildActivityEventDescription({
        eventType: "SCOPE_STATUS_UPDATED",
        metadata: {
          ...locationMetadata,
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      }),
    ).toBe("Updated from unset status → Install Complete-Verified");
  });

  it("summarizes INSPECTION_SYNC_FAILED with latest error and attempt suffix", () => {
    expect(
      buildActivityEventDescription({
        eventType: "INSPECTION_SYNC_FAILED",
        metadata: {
          formName: "Clear Inspection",
          category: "CALIBRATION_INSPECTION",
          errorMessage: "Server unreachable",
          httpStatus: 500,
          syncAttempts: 3,
        },
      }),
    ).toBe(
      "Calibration sync failed — Clear Inspection — Server unreachable (HTTP 500) · 3 attempts",
    );
  });

  it("summarizes MUTATION_SYNC_FAILED with item summary and HTTP status", () => {
    expect(
      buildActivityEventDescription({
        eventType: "MUTATION_SYNC_FAILED",
        metadata: {
          itemSummary: "Observation · S112 · \"Note\"",
          mutationType: "create-observation",
          errorMessage: "Invalid request",
          httpStatus: 400,
          syncAttempts: 2,
        },
      }),
    ).toContain("Observation upload failed");
    expect(
      buildActivityEventDescription({
        eventType: "MUTATION_SYNC_FAILED",
        metadata: {
          itemSummary: "Observation · S112 · \"Note\"",
          mutationType: "create-observation",
          errorMessage: "Invalid request",
          httpStatus: 400,
          syncAttempts: 2,
        },
      }),
    ).toContain("(HTTP 400)");
  });

  it("appends offline cache duration to successful replayed events", () => {
    expect(
      buildActivityEventDescription({
        eventType: "OBSERVATION_CREATED",
        metadata: {
          replayedFromOfflineQueue: true,
          offlineCacheDurationMs: 23 * 60_000,
          observationType: "GENERAL",
          title: "Loose trim",
        },
        createdAt: "2026-06-27T15:23:00.000Z",
      }),
    ).toContain("Uploaded from cache after 23 min");
  });

  it("describes custom site location updates and renames", () => {
    expect(
      buildActivityEventDescription({
        eventType: "CUSTOM_SITE_LOCATION_UPDATED",
        metadata: { name: "Dock B", previousName: "Dock A" },
      }),
    ).toBe('Renamed custom site location "Dock A" to "Dock B"');

    expect(
      buildActivityEventDescription({
        eventType: "CUSTOM_SITE_LOCATION_UPDATED",
        metadata: { name: "Dock A", previousName: "Dock A" },
      }),
    ).toBe('Updated custom site location "Dock A"');
  });

  it("describes field daily daily manpower set, update, and clear", () => {
    expect(
      buildActivityEventDescription({
        eventType: "FIELD_DAILY_DAILY_MANPOWER_SET",
        metadata: { reportDate: "2026-07-17", dailyManpower: 10, previousDailyManpower: null },
      }),
    ).toBe("Set daily manpower to 10 for field daily report 2026-07-17");

    expect(
      buildActivityEventDescription({
        eventType: "FIELD_DAILY_DAILY_MANPOWER_SET",
        metadata: { reportDate: "2026-07-17", dailyManpower: 12, previousDailyManpower: 8 },
      }),
    ).toBe("Updated daily manpower from 8 to 12 for field daily report 2026-07-17");

    expect(
      buildActivityEventDescription({
        eventType: "FIELD_DAILY_DAILY_MANPOWER_SET",
        metadata: { reportDate: "2026-07-17", dailyManpower: null, previousDailyManpower: 10 },
      }),
    ).toBe("Cleared daily manpower for field daily report 2026-07-17");
  });
});

import { describe, expect, it } from "vitest";
import { collapseHeatmapEvents } from "@/lib/activity/heatmap/collapse-heatmap-events";
import type { HeatmapActivityEvent } from "@/lib/activity/heatmap/collapse-heatmap-events";

function event(partial: Partial<HeatmapActivityEvent> & Pick<HeatmapActivityEvent, "activityLogId" | "eventType">): HeatmapActivityEvent {
  return {
    userId: "u1",
    userName: "User",
    projectId: "p1",
    createdAt: new Date("2026-07-25T12:00:00.000Z"),
    rowId: "row-1",
    location: { outcome: "legacy" },
    ...partial,
  };
}

describe("collapseHeatmapEvents()", () => {
  it("collapses status+photo pair within 2 minutes to one event", () => {
    const status = event({
      activityLogId: "status-1",
      eventType: "SCOPE_STATUS_UPDATED",
      createdAt: new Date("2026-07-25T12:00:00.000Z"),
      location: { outcome: "no_capture" },
    });
    const photo = event({
      activityLogId: "photo-1",
      eventType: "UNIT_PHOTO_UPLOADED",
      createdAt: new Date("2026-07-25T12:01:00.000Z"),
      location: { outcome: "on_map", latitude: 1, longitude: 2 },
    });

    const out = collapseHeatmapEvents([status, photo]);
    expect(out).toHaveLength(1);
    expect(out[0]!.activityLogId).toBe("status-1");
    expect(out[0]!.location.outcome).toBe("on_map");
  });

  it("does not collapse across different users", () => {
    const photo = event({
      activityLogId: "photo-1",
      eventType: "UNIT_PHOTO_UPLOADED",
      userId: "u2",
    });
    const status = event({
      activityLogId: "status-1",
      eventType: "SCOPE_STATUS_UPDATED",
    });
    expect(collapseHeatmapEvents([status, photo])).toHaveLength(2);
  });
});

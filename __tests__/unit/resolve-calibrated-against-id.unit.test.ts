import { describe, expect, it } from "vitest";
import {
  isLikelyServerCuid,
  resolveCalibratedAgainstSubmissionId,
  sortPendingInspectionsForFlush,
} from "@/lib/inspections/resolve-calibrated-against-id";

describe("isLikelyServerCuid()", () => {
  it("accepts prisma-style cuids", () => {
    expect(isLikelyServerCuid("cl01234567890123456789012")).toBe(true);
  });

  it("rejects offline UUID local ids", () => {
    expect(isLikelyServerCuid("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(false);
  });
});

describe("resolveCalibratedAgainstSubmissionId()", () => {
  const clearLocalId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const clearServerId = "cl01234567890123456789012";

  it("passes through an existing server cuid", () => {
    expect(
      resolveCalibratedAgainstSubmissionId(clearServerId, () => undefined),
    ).toEqual({ status: "resolved", serverId: clearServerId });
  });

  it("defers when the clear inspection is still queued", () => {
    expect(
      resolveCalibratedAgainstSubmissionId(clearLocalId, (id) => (
        id === clearLocalId ? { synced: false } : undefined
      )),
    ).toEqual({ status: "deferred", reason: "clear_not_synced_yet" });
  });

  it("maps a synced offline clear local id to its server id", () => {
    expect(
      resolveCalibratedAgainstSubmissionId(clearLocalId, (id) => (
        id === clearLocalId ? { synced: true, serverId: clearServerId } : undefined
      )),
    ).toEqual({ status: "resolved", serverId: clearServerId });
  });
});

describe("sortPendingInspectionsForFlush()", () => {
  it("flushes non-calibrations before calibrations", () => {
    const sorted = sortPendingInspectionsForFlush([
      { categoryOverride: "CALIBRATION_INSPECTION" as const, submittedAt: "2026-06-28T00:00:00.000Z" },
      { submittedAt: "2026-06-28T00:01:00.000Z" },
    ]);
    expect(sorted[0].categoryOverride).toBeUndefined();
    expect(sorted[1].categoryOverride).toBe("CALIBRATION_INSPECTION");
  });
});

import { describe, it, expect } from "vitest";

/**
 * Inspection sync feedback is rendered by OfflineIndicator (bottom strip).
 * InspectionSyncStatusHost is no longer mounted — see OfflineIndicator.test.tsx.
 */
describe("InspectionSyncStatusHost (deprecated)", () => {
  it("is replaced by OfflineIndicator bottom strip — see OfflineIndicator.test.tsx", () => {
    expect(true).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { mutationActivityItemSummary } from "@/lib/offline/mutation-activity-label";
import { mutationSyncErrorToDisplayMessage } from "@/lib/offline/mutation-sync-error-display";

describe("mutationActivityItemSummary", () => {
  it("describes a queued unit status change", () => {
    expect(mutationActivityItemSummary({
      type: "unit-status",
      body: { unit: "S112", building: "South", level: "1", scopeStage: "INSTALL", scopeStatus: "COMPLETE_VERIFIED" },
    })).toContain("S112");
  });

  it("describes a queued observation", () => {
    expect(mutationActivityItemSummary({
      type: "create-observation",
      body: { title: "Progress note", unitRef: "South|1|S112" },
    })).toContain("Progress note");
  });
});

describe("mutationSyncErrorToDisplayMessage", () => {
  it("decodes HTTP detail codes", () => {
    expect(mutationSyncErrorToDisplayMessage("mutation:http:400:Invalid request")).toBe(
      "Invalid request (HTTP 400)",
    );
  });
});

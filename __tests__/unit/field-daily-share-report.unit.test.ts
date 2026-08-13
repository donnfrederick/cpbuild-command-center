import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildFieldDailyReportSharePayload,
  shareFieldDailyReportPayload,
} from "@/lib/field-daily-report/share-report";
import { emptyProjectSnapshot } from "@/lib/field-daily-report/snapshot-activity";

describe("buildFieldDailyReportSharePayload", () => {
  it("builds title and activity summary lines", () => {
    const snapshot = {
      ...emptyProjectSnapshot(),
      progress: {
        ...emptyProjectSnapshot().progress,
        statusChangeCount: 5,
        inspectionSubmittedCount: 2,
        issuesCreatedCount: 1,
      },
    };
    const payload = buildFieldDailyReportSharePayload({
      projectName: "Marina Bay",
      reportDate: "2026-07-14",
      updatedTimeLabel: "12:49 PM",
      snapshot,
      labels: {
        statusChanges: "5 status changes",
        inspections: "2 inspections",
        issuesReported: "1 issue reported",
        otherActivity: "3 other activity items",
        updated: "Updated",
      },
      pageUrl: "https://example.com/projects/p1",
    });
    expect(payload.title).toBe("Marina Bay — 2026-07-14");
    expect(payload.text).toContain("Marina Bay");
    expect(payload.text).toContain("5 status changes");
    expect(payload.text).toContain("Updated 12:49 PM");
    expect(payload.url).toBe("https://example.com/projects/p1");
  });
});

describe("shareFieldDailyReportPayload", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      share: vi.fn(async () => undefined),
      clipboard: { writeText: vi.fn(async () => undefined) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses navigator.share when available", async () => {
    const result = await shareFieldDailyReportPayload({
      title: "Test",
      text: "Body",
      url: "https://example.com",
    });
    expect(result).toBe("shared");
    expect(navigator.share).toHaveBeenCalled();
  });
});

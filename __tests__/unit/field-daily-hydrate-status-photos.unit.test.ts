import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

vi.mock("@/lib/field-daily-report/hydrate-export-media", () => ({
  loadStatusUpdatePhotoRowsForExport: vi.fn(),
}));

import { loadStatusUpdatePhotoRowsForExport } from "@/lib/field-daily-report/hydrate-export-media";
import { hydrateStatusUpdatePhotos } from "@/lib/field-daily-report/hydrate-status-update-photos";

const baseSnapshot = (): FieldDailyReportProjectSnapshot => ({
  progress: {
    statusChangeCount: 1,
    installCompleteCount: 0,
    installCompleteQtyToday: 0,
    inspectionSubmittedCount: 0,
    issuesCreatedCount: 0,
    issuesResolvedCount: 0,
    observationsCreatedCount: 0,
  },
  statusUpdates: {
    summaryGroups: [
      {
        id: "g1",
        statusLabel: "Install Complete-Verified",
        unitEntries: [
          {
            locationLabel: "BLDG 1 · L1 · UNIT 118",
            building: "1",
            level: "1",
            unit: "118",
            scopeName: "Cabinetry",
            activityLogIds: ["log-1"],
          },
        ],
        sourceActivityLogIds: ["log-1"],
      },
    ],
    sourceEvents: [],
  },
  subcontractors: { summaryGroups: [] },
  teamsOnSite: { summaryGroups: [] },
  inspections: { summaryGroups: [] },
  issues: { items: [] },
  observations: { items: [] },
});

describe("hydrateStatusUpdatePhotos()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attaches matching status-update photos to unit entries", async () => {
    vi.mocked(loadStatusUpdatePhotoRowsForExport).mockResolvedValue([
      {
        storageUrl: "https://example.com/status.jpg",
        storageKey: "status/118.jpg",
        mimeType: "image/jpeg",
        caption: "Done",
        unitPhotoUnitRef: "1|1|118",
        unitPhotoSourceLabel: "Cabinetry · Install Complete-Verified",
      },
    ]);

    const result = await hydrateStatusUpdatePhotos("p1", baseSnapshot(), {
      reportDate: "2026-07-17",
    });

    const entry = result.statusUpdates.summaryGroups[0].unitEntries[0];
    expect(entry.statusUpdateAttachments).toHaveLength(1);
    expect(entry.statusUpdateAttachments?.[0].storageKey).toBe("status/118.jpg");
    expect(entry.statusUpdateAttachments?.[0].caption).toBe("Done");
  });

  it("returns snapshot unchanged when no status photos exist for the day", async () => {
    vi.mocked(loadStatusUpdatePhotoRowsForExport).mockResolvedValue([]);

    const snapshot = baseSnapshot();
    const result = await hydrateStatusUpdatePhotos("p1", snapshot, {
      reportDate: "2026-07-17",
    });

    expect(result.statusUpdates.summaryGroups[0].unitEntries[0].statusUpdateAttachments).toBeUndefined();
  });

  it("does not attach status photos to teams-on-site rollup entries", async () => {
    vi.mocked(loadStatusUpdatePhotoRowsForExport).mockResolvedValue([
      {
        storageUrl: "https://example.com/status.jpg",
        storageKey: "status/118.jpg",
        mimeType: "image/jpeg",
        caption: "Done",
        unitPhotoUnitRef: "1|1|118",
        unitPhotoSourceLabel: "Cabinetry · Install Complete-Verified",
      },
    ]);

    const snapshot = {
      ...baseSnapshot(),
      teamsOnSite: {
        summaryGroups: [
          {
            id: "team-1",
            subcontractorLabel: "Unassigned",
            unitEntries: [
              {
                locationLabel: "BLDG 1 · L1 · UNIT 118",
                building: "1",
                level: "1",
                unit: "118",
                scopeName: "Cabinetry",
                activityLogIds: ["log-1"],
              },
            ],
            sourceActivityLogIds: ["log-1"],
          },
        ],
      },
    };

    const result = await hydrateStatusUpdatePhotos("p1", snapshot, {
      reportDate: "2026-07-17",
    });

    expect(result.statusUpdates.summaryGroups[0].unitEntries[0].statusUpdateAttachments).toHaveLength(1);
    expect(result.teamsOnSite.summaryGroups[0].unitEntries[0].statusUpdateAttachments).toBeUndefined();
  });
});

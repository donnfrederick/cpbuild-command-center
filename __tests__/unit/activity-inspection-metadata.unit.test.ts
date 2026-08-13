import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityEventType } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  findManySubmissions: vi.fn(),
  findManyRows: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    inspectionSubmission: {
      findMany: mocks.findManySubmissions,
    },
    projectRow: {
      findMany: mocks.findManyRows,
    },
  },
}));

describe("hydrateInspectionActivityMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findManyRows.mockResolvedValue([]);
  });

  it("hydrates historical calibration activity from the linked submission snapshot", async () => {
    mocks.findManySubmissions.mockResolvedValue([
      {
        id: "submission-1",
        templateSnapshot: { category: "CALIBRATION_INSPECTION" },
        unitId: "unit-1",
        scopeRowId: "row-1",
        scopeTypeCode: null,
      },
    ]);

    const { hydrateInspectionActivityMetadata } = await import("@/lib/activity-inspection-metadata");
    const events = await hydrateInspectionActivityMetadata([
      {
        id: "activity-1",
        eventType: ActivityEventType.INSPECTION_SUBMITTED,
        metadata: {
          submissionId: "submission-1",
          category: "CLEAR_INSPECTION",
        },
      },
    ]);

    expect(events[0].metadata).toMatchObject({
      submissionId: "submission-1",
      category: "CALIBRATION_INSPECTION",
    });
  });

  it("backfills unit location for unit-level Gypcrete activity rows missing metadata", async () => {
    mocks.findManySubmissions.mockResolvedValue([
      {
        id: "submission-gyp",
        templateSnapshot: { category: "GYPCRETE_MOISTURE_TEST" },
        unitId: "North|2|N208",
        scopeRowId: null,
        scopeTypeCode: null,
      },
    ]);

    const { hydrateInspectionActivityMetadata } = await import("@/lib/activity-inspection-metadata");
    const events = await hydrateInspectionActivityMetadata([
      {
        id: "activity-gyp",
        eventType: ActivityEventType.INSPECTION_SUBMITTED,
        metadata: {
          submissionId: "submission-gyp",
          building: "",
          level: "",
          unit: "",
        },
      },
    ]);

    expect(events[0].metadata).toMatchObject({
      building: "North",
      level: "2",
      unit: "N208",
    });
    expect(events[0].metadata).not.toHaveProperty("scopeName");
  });
});

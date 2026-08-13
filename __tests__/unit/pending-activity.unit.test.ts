import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueuedMutation } from "@/lib/offline/mutation-queue";
import type { PendingInspection } from "@/lib/inspections/inspectionOfflineDb";

const mocks = vi.hoisted(() => ({
  getPendingMutations: vi.fn<() => Promise<QueuedMutation[]>>(),
  getAllPending: vi.fn<() => Promise<PendingInspection[]>>(),
}));

vi.mock("@/lib/offline/mutation-queue", () => ({
  getPendingMutations: mocks.getPendingMutations,
}));

vi.mock("@/lib/inspections/inspectionOfflineDb", () => ({
  getAllPending: mocks.getAllPending,
}));

const baseMutation = {
  method: "POST" as const,
  attempts: 0,
  queuedAt: Date.parse("2026-05-14T12:00:00.000Z"),
  body: {},
};

function queuedMutation(overrides: Partial<QueuedMutation>): QueuedMutation {
  return {
    ...baseMutation,
    id: "mutation-1",
    type: "create-issue",
    url: "/api/projects/project-1/issues",
    ...overrides,
  } as QueuedMutation;
}

/** Default submittedAt is 1h ago so rows pass the 48h activity-feed filter. */
function recentSubmittedAt(hoursAgo = 1): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

function pendingInspection(overrides: Partial<PendingInspection>): PendingInspection {
  return {
    localId: "inspection-1",
    formId: "form-1",
    projectId: "project-1",
    unitId: "unit-1",
    scopeRowId: "row-1",
    scopeTypeCode: "CAB",
    submittedByName: "Inspector",
    outcome: "PASS",
    deficiencyCount: 0,
    payload: {},
    submittedAt: recentSubmittedAt(),
    synced: false,
    templateSnapshot: { name: "Clear Inspection", category: "CLEAR_INSPECTION" },
    ...overrides,
  };
}

describe("getPendingActivityEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {},
    });
    mocks.getPendingMutations.mockResolvedValue([]);
    mocks.getAllPending.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps supported queued mutation types and ignores comments", async () => {
    mocks.getPendingMutations.mockResolvedValue([
      queuedMutation({
        id: "status-1",
        type: "unit-status",
        method: "PATCH",
        url: "/api/projects/project-1/units/row-1",
        body: { scopeStage: "INSTALL", scopeStatus: "COMPLETE", building: "A", level: "1", unit: "101" },
      }),
      queuedMutation({
        id: "issue-1",
        type: "create-issue",
        url: "/api/projects/project-1/issues",
        body: { shortDescription: "Blocked", issueType: "FIELD", unitRef: "A|1|101", isBlockingWork: true },
      }),
      queuedMutation({
        id: "observation-1",
        type: "create-observation",
        url: "/api/projects/project-1/observations",
        body: { title: "Note", observationType: "QUALITY", unitRef: "A|1|101" },
      }),
      queuedMutation({
        id: "comment-1",
        type: "add-comment",
        url: "/api/projects/project-1/issues/issue-1/comments",
        body: { body: "Pending comment" },
      }),
    ]);

    const { getPendingActivityEvents } = await import("@/lib/offline/pending-activity");
    const events = await getPendingActivityEvents({ projectId: "project-1" });

    const statusEvent = events.find((event) => event.eventType === "SCOPE_STATUS_UPDATED");
    expect(statusEvent?.metadata.rowId).toBe("row-1");
    expect(events.map((event) => event.eventType).sort()).toEqual([
      "ISSUE_CREATED",
      "OBSERVATION_CREATED",
      "SCOPE_STATUS_UPDATED",
    ]);
    expect(events.some((event) => event.id === "pending:comment-1")).toBe(false);
  });

  it("filters location matches for unitRef and direct metadata", async () => {
    mocks.getPendingMutations.mockResolvedValue([
      queuedMutation({
        id: "issue-match",
        type: "create-issue",
        url: "/api/projects/project-1/issues",
        body: { shortDescription: "Issue", unitRef: "A|1|101" },
      }),
      queuedMutation({
        id: "status-match",
        type: "unit-status",
        method: "PATCH",
        url: "/api/projects/project-1/units/row-1",
        body: { building: "A", level: "1", unit: "101", scopeStatus: "COMPLETE" },
      }),
      queuedMutation({
        id: "issue-miss",
        type: "create-issue",
        url: "/api/projects/project-1/issues",
        body: { shortDescription: "Other", unitRef: "B|2|202" },
      }),
    ]);

    const { getPendingActivityEvents } = await import("@/lib/offline/pending-activity");
    const events = await getPendingActivityEvents({ projectId: "project-1", building: "A", level: "1", unit: "101" });

    expect(events.map((event) => event.id).sort()).toEqual([
      "pending:issue-match",
      "pending:status-match",
    ]);
  });

  it("omits pending inspections older than 48 hours from the activity feed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:00:00.000Z"));
    mocks.getPendingMutations.mockResolvedValue([]);
    mocks.getAllPending.mockResolvedValue([
      pendingInspection({
        localId: "fresh-inspection",
        submittedAt: "2026-05-15T12:00:00.000Z",
      }),
      pendingInspection({
        localId: "stale-inspection",
        submittedAt: "2026-05-13T12:00:00.000Z",
      }),
    ]);

    const { getPendingActivityEvents } = await import("@/lib/offline/pending-activity");
    const events = await getPendingActivityEvents({ projectId: "project-1" });

    expect(events.map((event) => event.id)).toEqual(["pending:fresh-inspection"]);
    vi.useRealTimers();
  });

  it("includes pending inspections and sorts newest first", async () => {
    mocks.getPendingMutations.mockResolvedValue([
      queuedMutation({
        id: "older-issue",
        queuedAt: Date.parse("2026-05-14T12:00:00.000Z"),
        type: "create-issue",
        url: "/api/projects/project-1/issues",
        body: { shortDescription: "Older" },
      }),
    ]);
    mocks.getAllPending.mockResolvedValue([
      pendingInspection({
        localId: "newer-inspection",
        submittedAt: recentSubmittedAt(0.5),
      }),
    ]);

    const { getPendingActivityEvents } = await import("@/lib/offline/pending-activity");
    const events = await getPendingActivityEvents({ projectId: "project-1" });

    expect(events.map((event) => event.id)).toEqual([
      "pending:newer-inspection",
      "pending:older-issue",
    ]);
    expect(events[0]).toMatchObject({
      eventType: "INSPECTION_SUBMITTED",
      metadata: expect.objectContaining({ formName: "Clear Inspection", pendingSync: true }),
    });
  });

  it("preserves calibration category overrides for pending inspections", async () => {
    mocks.getAllPending.mockResolvedValue([
      pendingInspection({
        categoryOverride: "CALIBRATION_INSPECTION",
      }),
    ]);

    const { getPendingActivityEvents } = await import("@/lib/offline/pending-activity");
    const events = await getPendingActivityEvents({ projectId: "project-1" });

    expect(events[0]).toMatchObject({
      eventType: "INSPECTION_SUBMITTED",
      metadata: expect.objectContaining({
        category: "CALIBRATION_INSPECTION",
      }),
    });
  });

  it("maps syncErrorHistory to INSPECTION_SYNC_FAILED metadata", async () => {
    mocks.getAllPending.mockResolvedValue([
      pendingInspection({
        syncErrorHistory: [
          {
            attempt: 1,
            message: "HTTP 500",
            httpStatus: 500,
            errorKind: "retriable",
            recordedAt: "2026-06-25T10:00:00.000Z",
          },
        ],
        syncAttempts: 1,
        lastSyncError: "HTTP 500",
      }),
    ]);

    const { getPendingActivityEvents } = await import("@/lib/offline/pending-activity");
    const events = await getPendingActivityEvents({ projectId: "project-1" });

    expect(events[0]).toMatchObject({
      eventType: "INSPECTION_SYNC_FAILED",
      metadata: expect.objectContaining({
        syncFailed: true,
        syncErrors: expect.arrayContaining([
          expect.objectContaining({ attempt: 1, message: "HTTP 500" }),
        ]),
        errorMessage: "HTTP 500",
        pendingSync: true,
      }),
    });
  });
});

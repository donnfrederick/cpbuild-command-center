import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discardInspection: vi.fn<() => Promise<void>>(),
  markFailed: vi.fn<() => Promise<number>>().mockResolvedValue(1),
  markSynced: vi.fn<() => Promise<void>>(),
  updatePendingPayload: vi.fn<() => Promise<void>>(),
  updatePendingCalibrationTarget: vi.fn<() => Promise<void>>(),
  getPendingByLocalId: vi.fn<() => Promise<unknown>>(),
  getInspectionRecordByLocalId: vi.fn<() => Promise<unknown>>(),
  answersHavePendingMedia: vi.fn<(answers: unknown) => boolean>(),
  resolvePendingInspectionMedia: vi.fn<(answers: unknown) => Promise<unknown>>(),
  reportInspectionSyncActivityFailure: vi.fn<() => void>(),
}));

vi.mock("@/lib/inspections/inspectionOfflineDb", () => ({
  discardInspection: mocks.discardInspection,
  markFailed: mocks.markFailed,
  markSynced: mocks.markSynced,
  updatePendingPayload: mocks.updatePendingPayload,
  updatePendingCalibrationTarget: mocks.updatePendingCalibrationTarget,
  getPendingByLocalId: mocks.getPendingByLocalId,
  getInspectionRecordByLocalId: mocks.getInspectionRecordByLocalId,
}));

vi.mock("@/lib/inspections/report-inspection-sync-activity", () => ({
  reportInspectionSyncActivityFailure: mocks.reportInspectionSyncActivityFailure,
}));

vi.mock("@/lib/offline/connectivity", () => ({}));

vi.mock("@/lib/inspections/inspection-media-blobs", () => ({
  answersHavePendingMedia: mocks.answersHavePendingMedia,
  resolvePendingInspectionMedia: mocks.resolvePendingInspectionMedia,
}));

vi.mock("@/lib/offline/mutation-queue", () => ({
  flushMutationQueue: vi.fn().mockResolvedValue(undefined),
}));

const basePayload = {
  formId: "form-1",
  formVersionId: "version-1",
  templateSnapshot: { name: "Inspection", sections: [] },
  projectId: "project-1",
  unitId: "unit-1",
  submittedBy: "Inspector",
  outcome: "PASS" as const,
  deficiencyCount: 0,
  payload: {
    q1: {
      value: "pass",
      capturedFiles: [{ pendingBlobId: "blob-1", mimeType: "image/jpeg", localUrl: "blob:x" }],
    },
  },
};

describe("inspection-sync-one pending media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.answersHavePendingMedia.mockReturnValue(true);
    mocks.getPendingByLocalId.mockResolvedValue({
      localId: "local-1",
      projectId: "project-1",
      syncErrorHistory: [{ attempt: 1, message: "Photos pending", errorKind: "retriable", recordedAt: "2026-06-25T10:00:00.000Z" }],
      templateSnapshot: { name: "Inspection" },
      submittedAt: "2026-06-25T09:00:00.000Z",
      outcome: "PASS",
      unitId: "unit-1",
    });
    mocks.resolvePendingInspectionMedia.mockResolvedValue({
      q1: {
        value: "pass",
        capturedFiles: [{ serverUrl: "https://cdn/photo.jpg", mimeType: "image/jpeg", localUrl: "blob:x" }],
      },
    });
  });

  it("uploads pending media then POSTs even when connectivity is slow", async () => {
    mocks.answersHavePendingMedia
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ submissions: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ submission: { id: "server-1" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { syncOne } = await import("@/lib/inspections/inspection-sync-one");
    const synced = await syncOne("local-1", basePayload);

    expect(synced).toBe(true);
    expect(mocks.resolvePendingInspectionMedia).toHaveBeenCalled();
    expect(mocks.updatePendingPayload).toHaveBeenCalledWith("local-1", {
      q1: {
        value: "pass",
        capturedFiles: [{ serverUrl: "https://cdn/photo.jpg", mimeType: "image/jpeg", localUrl: "blob:x" }],
      },
    });
    expect(mocks.markSynced).toHaveBeenCalledWith("local-1", "server-1");
    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === "POST");
    const postBody = JSON.parse(String(postCall?.[1]?.body));
    expect(postBody.payload.q1.capturedFiles[0].serverUrl).toBe("https://cdn/photo.jpg");
  });

  it("marks failed when pending media remains after resolve attempt", async () => {
    mocks.answersHavePendingMedia.mockReturnValue(true);
    mocks.resolvePendingInspectionMedia.mockResolvedValue(basePayload.payload);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { syncOne } = await import("@/lib/inspections/inspection-sync-one");
    const synced = await syncOne("local-1", basePayload);

    expect(synced).toBe(false);
    expect(mocks.markFailed).toHaveBeenCalledWith("local-1", expect.objectContaining({
      errorKind: "retriable",
    }));
    expect(mocks.reportInspectionSyncActivityFailure).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("inspection-sync-one offline deferral", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.answersHavePendingMedia.mockReturnValue(false);
  });

  it("returns false without markFailed when the browser is offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { syncOne } = await import("@/lib/inspections/inspection-sync-one");
    const synced = await syncOne("local-offline", {
      ...basePayload,
      templateSnapshot: { name: "Clear Inspection", category: "CLEAR_INSPECTION" },
      scopeRowId: "scope-row-1",
    });

    expect(synced).toBe(false);
    expect(mocks.markFailed).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubGlobal("navigator", { onLine: true });
  });

  it("returns false without markFailed on transient service worker fetch errors", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Response served by service worker is an error")),
    );

    const { syncOne } = await import("@/lib/inspections/inspection-sync-one");
    const synced = await syncOne("local-sw", {
      ...basePayload,
      templateSnapshot: { name: "Clear Inspection", category: "CLEAR_INSPECTION" },
      scopeRowId: "scope-row-1",
    });

    expect(synced).toBe(false);
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });
});

describe("inspection-sync-one server reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.answersHavePendingMedia.mockReturnValue(false);
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("marks synced when the server already saved the submission before POST", async () => {
    const serverSubmission = {
      id: "server-existing",
      formId: "form-1",
      formVersionId: "version-1",
      outcome: "FAIL",
      deficiencyCount: 6,
      submittedAt: "2026-06-27T16:00:00.000Z",
      payload: { q1: { value: "fail" } },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ submissions: [serverSubmission] }) });
    vi.stubGlobal("fetch", fetchMock);

    const { syncOne } = await import("@/lib/inspections/inspection-sync-one");
    const synced = await syncOne("local-1", {
      ...basePayload,
      scopeRowId: "row-1",
      outcome: "FAIL",
      deficiencyCount: 6,
      payload: { q1: { value: "fail", capturedFiles: [{ serverUrl: "https://cdn/x.jpg" }] } },
    }, {
      replayMetadata: { submittedAt: "2026-06-27T15:30:00.000Z" },
    });

    expect(synced).toBe(true);
    expect(mocks.markSynced).toHaveBeenCalledWith("local-1", "server-existing");
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === "POST")).toBe(false);
  });

  it("reconciles on 400 Invalid request when a relaxed server match exists", async () => {
    const serverSubmission = {
      id: "server-after-retry",
      formId: "form-1",
      formVersionId: "version-1",
      outcome: "FAIL",
      deficiencyCount: 6,
      submittedAt: "2026-06-27T16:00:00.000Z",
      payload: { q1: { value: "fail", capturedFiles: [{ serverUrl: "https://cdn/x.jpg" }] } },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ submissions: [] }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Invalid request" })),
      })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ submissions: [serverSubmission] }) });
    vi.stubGlobal("fetch", fetchMock);

    const { syncOne } = await import("@/lib/inspections/inspection-sync-one");
    const synced = await syncOne("local-1", {
      ...basePayload,
      scopeRowId: "row-1",
      outcome: "FAIL",
      deficiencyCount: 6,
      payload: { q1: { value: "fail" } },
    });

    expect(synced).toBe(true);
    expect(mocks.markSynced).toHaveBeenCalledWith("local-1", "server-after-retry");
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("includes activityLocation in POST body when provided", async () => {
    const activityLocation = {
      gpsStatus: "GRANTED" as const,
      locationRecordedAt: "2026-08-01T12:00:00.000Z",
      latitude: 40.7,
      longitude: -74.0,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ submissions: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ submission: { id: "server-1" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { syncOne } = await import("@/lib/inspections/inspection-sync-one");
    await syncOne("local-1", {
      ...basePayload,
      activityLocation,
    });

    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === "POST");
    const postBody = JSON.parse(String(postCall?.[1]?.body));
    expect(postBody.activityLocation).toEqual(activityLocation);
  });

  it("uses templateSnapshot.latestVersionId when formVersionId is missing on POST", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ submissions: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ submission: { id: "server-1" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { syncOne } = await import("@/lib/inspections/inspection-sync-one");
    await syncOne("local-1", {
      ...basePayload,
      formVersionId: undefined,
      templateSnapshot: { name: "Inspection", latestVersionId: "version-from-template" },
    });

    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === "POST");
    const postBody = JSON.parse(String(postCall?.[1]?.body));
    expect(postBody.formVersionId).toBe("version-from-template");
  });
});

describe("inspection-sync-one calibration offline target", () => {
  const clearLocalId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const clearServerId = "cl01234567890123456789012";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.answersHavePendingMedia.mockReturnValue(false);
    mocks.markFailed.mockResolvedValue(1);
  });

  it("defers POST when the clear inspection is still queued offline", async () => {
    mocks.getInspectionRecordByLocalId.mockResolvedValue({
      localId: clearLocalId,
      synced: false,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { syncOne } = await import("@/lib/inspections/inspection-sync-one");
    const synced = await syncOne("cal-local", {
      ...basePayload,
      categoryOverride: "CALIBRATION_INSPECTION",
      calibratedAgainstSubmissionId: clearLocalId,
    });

    expect(synced).toBe(false);
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === "POST")).toBe(false);
    expect(mocks.markFailed).toHaveBeenCalledWith(
      "cal-local",
      expect.objectContaining({
        message: expect.stringContaining("Waiting for the clear inspection"),
        errorKind: "retriable",
      }),
    );
  });

  it("POSTs with the server cuid after the clear inspection synced", async () => {
    mocks.getInspectionRecordByLocalId.mockResolvedValue({
      localId: clearLocalId,
      synced: true,
      serverId: clearServerId,
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ submission: { id: "cal-server-1" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { syncOne } = await import("@/lib/inspections/inspection-sync-one");
    const synced = await syncOne("cal-local", {
      ...basePayload,
      categoryOverride: "CALIBRATION_INSPECTION",
      calibratedAgainstSubmissionId: clearLocalId,
    });

    expect(synced).toBe(true);
    expect(mocks.updatePendingCalibrationTarget).toHaveBeenCalledWith(
      "cal-local",
      clearServerId,
    );
    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === "POST");
    const postBody = JSON.parse(String(postCall?.[1]?.body));
    expect(postBody.calibratedAgainstSubmissionId).toBe(clearServerId);
  });
});

describe("inspection-sync-one calibration dedupe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.answersHavePendingMedia.mockReturnValue(false);
    vi.stubGlobal("navigator", { onLine: true });
  });

  it("does not reconcile pending calibration to an existing clear submission", async () => {
    const clearServerSubmission = {
      id: "server-clear",
      formId: "form-1",
      formVersionId: "version-1",
      outcome: "PASS",
      deficiencyCount: 0,
      submittedAt: "2026-06-27T16:00:00.000Z",
      payload: { q1: { value: "pass" } },
      templateSnapshot: { category: "CLEAR_INSPECTION" },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ submission: { id: "server-calibration" } }),
      });
    vi.stubGlobal("fetch", fetchMock);
    mocks.getInspectionRecordByLocalId.mockResolvedValue({
      localId: "clear-server-id",
      synced: true,
      serverId: "server-clear",
    });

    const { syncOne } = await import("@/lib/inspections/inspection-sync-one");
    const synced = await syncOne("cal-local", {
      ...basePayload,
      categoryOverride: "CALIBRATION_INSPECTION",
      calibratedAgainstSubmissionId: "clear-server-id",
      outcome: "PASS",
      deficiencyCount: 0,
      payload: { q1: { value: "pass" } },
    });

    expect(synced).toBe(true);
    expect(mocks.markSynced).toHaveBeenCalledWith("cal-local", "server-calibration");
    expect(mocks.markSynced).not.toHaveBeenCalledWith("cal-local", "server-clear");
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === "POST")).toBe(true);
  });

  it("reconcilePendingInspectionIfAlreadyOnServer skips calibrations", async () => {
    const clearServerSubmission = {
      id: "server-clear",
      formId: "form-1",
      formVersionId: "version-1",
      outcome: "PASS",
      deficiencyCount: 0,
      submittedAt: "2026-06-27T16:00:00.000Z",
      payload: { q1: { value: "pass" } },
      templateSnapshot: { category: "CLEAR_INSPECTION" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ submissions: [clearServerSubmission] }),
      }),
    );

    const { reconcilePendingInspectionIfAlreadyOnServer } = await import(
      "@/lib/inspections/inspection-sync-one"
    );
    const reconciled = await reconcilePendingInspectionIfAlreadyOnServer(
      "cal-local",
      {
        ...basePayload,
        categoryOverride: "CALIBRATION_INSPECTION",
        scopeRowId: "scope-1",
      },
      { q1: { value: "pass" } },
    );

    expect(reconciled).toBe(false);
    expect(mocks.markSynced).not.toHaveBeenCalled();
  });
});

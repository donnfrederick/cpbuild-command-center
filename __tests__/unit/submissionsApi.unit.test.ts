import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  discardInspection: vi.fn<() => Promise<void>>(),
  markFailed: vi.fn<() => Promise<number>>().mockResolvedValue(1),
  markSynced: vi.fn<() => Promise<void>>(),
  queueInspection: vi.fn<() => Promise<string>>().mockResolvedValue("local-update-1"),
  updatePendingInspection: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  updatePendingCalibrationTarget: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getPendingByLocalId: vi.fn<() => Promise<unknown>>(),
  getInspectionRecordByLocalId: vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
  reportInspectionSyncActivityFailure: vi.fn<() => void>(),
  readSnapshotModule: vi.fn<() => Promise<unknown>>().mockResolvedValue(null),
  collectActivityLocation: vi.fn<() => Promise<{
    gpsStatus: "GRANTED";
    locationRecordedAt: string;
    latitude: number;
    longitude: number;
  }>>().mockResolvedValue({
    gpsStatus: "GRANTED",
    locationRecordedAt: "2026-08-01T12:00:00.000Z",
    latitude: 40.7,
    longitude: -74.0,
  }),
}));

vi.mock("@/lib/inspections/inspectionOfflineDb", () => ({
  discardInspection: mocks.discardInspection,
  markFailed: mocks.markFailed,
  markSynced: mocks.markSynced,
  queueInspection: mocks.queueInspection,
  updatePendingInspection: mocks.updatePendingInspection,
  updatePendingCalibrationTarget: mocks.updatePendingCalibrationTarget,
  getPendingByProject: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getPendingByScope: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getPendingByUnit: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  getPendingByLocalId: mocks.getPendingByLocalId,
  getInspectionRecordByLocalId: mocks.getInspectionRecordByLocalId,
}));

vi.mock("@/lib/inspections/report-inspection-sync-activity", () => ({
  reportInspectionSyncActivityFailure: mocks.reportInspectionSyncActivityFailure,
}));

vi.mock("@/lib/offline/snapshot-cache", () => ({
  readSnapshotModule: mocks.readSnapshotModule,
}));

vi.mock("@/lib/activity/collect-activity-location", () => ({
  collectActivityLocation: mocks.collectActivityLocation,
}));

const payload = {
  formId: "form-1",
  formVersionId: "version-1",
  templateSnapshot: { name: "Clear Inspection", sections: [] },
  projectId: "project-1",
  unitId: "unit-1",
  submittedBy: "Inspector",
  outcome: "PASS" as const,
  deficiencyCount: 0,
  payload: {},
};

describe("syncOne", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markFailed.mockResolvedValue(1);
    mocks.getPendingByLocalId.mockResolvedValue({
      localId: "local-1",
      projectId: "project-1",
      syncErrorHistory: [{ attempt: 1, message: "err", errorKind: "retriable", recordedAt: "2026-06-25T10:00:00.000Z" }],
      templateSnapshot: payload.templateSnapshot,
      submittedAt: "2026-06-25T09:00:00.000Z",
      outcome: "PASS",
      unitId: "unit-1",
    });
  });

  it("throws auth-required for 401 responses (keeps queued, does not discard)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Unauthorized" })),
    }));

    const { InspectionSyncAuthRequiredError, syncOne } = await import("@/lib/inspections/submissionsApi");

    await expect(syncOne("local-1", payload)).rejects.toThrow(InspectionSyncAuthRequiredError);
    expect(mocks.markFailed).toHaveBeenCalledWith("local-1", expect.objectContaining({ errorKind: "auth" }));
    expect(mocks.reportInspectionSyncActivityFailure).toHaveBeenCalled();
    expect(mocks.discardInspection).not.toHaveBeenCalled();
  });

  it("keeps queued inspections for 403 without discarding", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Forbidden" })),
    }));

    const { InspectionSyncRejectedError, syncOne } = await import("@/lib/inspections/submissionsApi");

    await expect(syncOne("local-1", payload)).rejects.toThrow(InspectionSyncRejectedError);
    expect(mocks.markFailed).toHaveBeenCalledWith("local-1", expect.objectContaining({ errorKind: "rejected" }));
    expect(mocks.discardInspection).not.toHaveBeenCalled();
  });

  it("reports activity on each retriable failure (one upsert per submission, not per row)", async () => {
    mocks.markFailed
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Server error" })),
    }));

    const { InspectionSyncExhaustedError, syncOne } = await import("@/lib/inspections/submissionsApi");

    await expect(syncOne("local-1", payload)).resolves.toBe(false);
    await expect(syncOne("local-1", payload)).resolves.toBe(false);
    await expect(syncOne("local-1", payload)).rejects.toThrow(InspectionSyncExhaustedError);
    expect(mocks.markFailed).toHaveBeenCalledTimes(3);
    expect(mocks.reportInspectionSyncActivityFailure).toHaveBeenCalledTimes(3);
  });

  it("throws exhausted error after max retriable failures", async () => {
    mocks.markFailed.mockResolvedValue(3);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Server error" })),
    }));

    const { InspectionSyncExhaustedError, syncOne } = await import("@/lib/inspections/submissionsApi");

    await expect(syncOne("local-1", payload)).rejects.toThrow(InspectionSyncExhaustedError);
    expect(mocks.markFailed).toHaveBeenCalledWith("local-1", expect.objectContaining({ errorKind: "retriable" }));
    expect(mocks.discardInspection).not.toHaveBeenCalled();
  });

  it("preserves permanently rejected inspections in IndexedDB", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Scope is not ready." })),
    }));

    const { InspectionSyncPreservedError, syncOne } = await import("@/lib/inspections/submissionsApi");

    await expect(syncOne("local-1", payload)).rejects.toThrow(InspectionSyncPreservedError);
    expect(mocks.markFailed).toHaveBeenCalledWith("local-1", expect.objectContaining({
      httpStatus: 422,
      errorKind: "rejected",
    }));
    expect(mocks.reportInspectionSyncActivityFailure).toHaveBeenCalled();
    expect(mocks.discardInspection).not.toHaveBeenCalled();
  });

  const calibrationPayload = {
    ...payload,
    categoryOverride: "CALIBRATION_INSPECTION" as const,
    calibratedAgainstSubmissionId: "cl01234567890123456789012",
  };

  it("keeps calibration inspections in IndexedDB on 422 permanent rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: "calibratedAgainstSubmissionId is required" })),
    }));

    const { InspectionSyncPreservedError, syncOne } = await import("@/lib/inspections/submissionsApi");

    await expect(syncOne("local-1", calibrationPayload)).rejects.toThrow(InspectionSyncPreservedError);
    expect(mocks.markFailed).toHaveBeenCalledWith("local-1", expect.objectContaining({
      httpStatus: 422,
      errorKind: "rejected",
    }));
    expect(mocks.reportInspectionSyncActivityFailure).toHaveBeenCalled();
    expect(mocks.discardInspection).not.toHaveBeenCalled();
  });

  it("keeps calibration inspections in IndexedDB on 409 when no server match exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Conflict" })),
    }));

    const { InspectionSyncPreservedError, syncOne } = await import("@/lib/inspections/submissionsApi");

    await expect(syncOne("local-1", { ...calibrationPayload, scopeRowId: "row-1" }))
      .rejects.toThrow(InspectionSyncPreservedError);
    expect(mocks.discardInspection).not.toHaveBeenCalled();
  });

  it("marks a conflicted retry as synced when the same submission already exists", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ submissions: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Already passed." })),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          submissions: [{
            id: "server-1",
            formId: "form-1",
            formVersionId: "version-1",
            templateSnapshot: { name: "Clear Inspection", category: "CLEAR_INSPECTION" },
            projectId: "project-1",
            unitId: "unit-1",
            scopeRowId: "row-1",
            scopeTypeCode: null,
            submittedAt: "2026-05-20T17:00:00.000Z",
            clearInspection: {
              inspectedById: "user-1",
              inspectedBy: { id: "user-1", name: "Inspector" },
            },
            outcome: "PASS",
            deficiencyCount: 0,
            payload: { nested: { b: 2, a: 1 } },
            source: "FORM",
          }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { syncOne } = await import("@/lib/inspections/submissionsApi");
    const synced = await syncOne("local-1", {
      ...payload,
      scopeRowId: "row-1",
      payload: { nested: { a: 1, b: 2 } },
    });

    expect(synced).toBe(true);
    expect(mocks.markSynced).toHaveBeenCalledWith("local-1", "server-1");
    expect(mocks.markFailed).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/inspection-submissions?scopeRowId=row-1", { cache: "no-store" });
  });

  it("preserves conflicted retries when no matching saved submission exists", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ submissions: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Already passed." })),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ submissions: [] }),
      }));

    const { InspectionSyncPreservedError, syncOne } = await import("@/lib/inspections/submissionsApi");

    await expect(syncOne("local-1", { ...payload, scopeRowId: "row-1" })).rejects.toThrow(InspectionSyncPreservedError);
    expect(mocks.markFailed).toHaveBeenCalledWith("local-1", expect.objectContaining({ httpStatus: 409 }));
    expect(mocks.discardInspection).not.toHaveBeenCalled();
  });

  it("includes offline replay headers when sync metadata is provided", async () => {
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

    const { syncOne } = await import("@/lib/inspections/submissionsApi");
    const synced = await syncOne("local-1", payload, {
      replayMetadata: {
        submittedAt: "2026-05-20T17:00:00.000Z",
      },
    });

    expect(synced).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/inspection-submissions", expect.objectContaining({
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        "X-Offline-Mutation-Id": "local-1",
        "X-Client-Queued-At": "2026-05-20T17:00:00.000Z",
      }),
    }));
  });

  it("syncOne PUT updates an existing submission when updateServerId is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ submission: { id: "server-edit-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { syncOne } = await import("@/lib/inspections/submissionsApi");
    const synced = await syncOne("local-edit", {
      ...payload,
      updateServerId: "server-edit-1",
      payload: { q1: { choice: "pass" } },
    });

    expect(synced).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/inspection-submissions/server-edit-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          outcome: "PASS",
          deficiencyCount: 0,
          payload: { q1: { choice: "pass" } },
        }),
      }),
    );
    expect(mocks.markSynced).toHaveBeenCalledWith("local-edit", "server-edit-1");
  });
});

describe("listByProject offline snapshot fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.readSnapshotModule.mockResolvedValue(null);
  });

  it("falls back to inspection-submissions snapshot when fetch fails", async () => {
    mocks.readSnapshotModule.mockResolvedValue({
      data: [{
        id: "sub-offline",
        formId: "form-1",
        formVersionId: "v1",
        templateSnapshot: { category: "CLEAR_INSPECTION", name: "Clear", sections: [] },
        projectId: "p1",
        unitId: "u1",
        scopeRowId: "row-1",
        scopeTypeCode: "TIL",
        submittedAt: "2026-06-12T12:00:00.000Z",
        outcome: "PASS",
        deficiencyCount: 0,
        payload: {},
        source: "FORM",
        form: { category: "CLEAR_INSPECTION", name: "Clear", level: "scope" },
        clearInspection: { inspectedById: "u2", inspectedBy: { id: "u2", name: "Inspector" } },
      }],
      generatedAt: "2026-06-12T12:00:00.000Z",
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { listByProject } = await import("@/lib/inspections/submissionsApi");
    const subs = await listByProject("p1");
    expect(subs).toHaveLength(1);
    expect(subs[0]?.id).toBe("sub-offline");
    expect(subs[0]?.outcome).toBe("PASS");
  });
});

describe("listByProject category resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("resolves TWO_AREA_CLEAR from form when snapshot stores legacy PRE_INSTALL full template", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        submissions: [{
          id: "sub-1",
          formId: "form-1",
          formVersionId: "v1",
          templateSnapshot: {
            category: "PRE_INSTALL",
            name: "Legacy",
            sections: [{ id: "s1", title: "S", questions: [] }],
          },
          projectId: "p1",
          unitId: "u1",
          scopeRowId: "row-til",
          scopeTypeCode: "TIL",
          submittedAt: "2026-06-12T12:00:00.000Z",
          outcome: "FAIL",
          deficiencyCount: 1,
          payload: {},
          source: "FORM",
          form: { category: "TWO_AREA_CLEAR", name: "2 Area Clear", level: "scope" },
          clearInspection: { inspectedById: null, inspectedBy: null },
        }],
      }),
    }));

    const { listByProject } = await import("@/lib/inspections/submissionsApi");
    const subs = await listByProject("p1");
    expect(subs[0]?.categorySnapshot).toBe("TWO_AREA_CLEAR");
    expect(subs[0]?.formCategory).toBe("TWO_AREA_CLEAR");
  });

  it("merges unsynced IndexedDB submissions for grid initial load", async () => {
    const { getPendingByProject } = await import("@/lib/inspections/inspectionOfflineDb");
    vi.mocked(getPendingByProject).mockResolvedValue([
      {
        localId: "local-2ac",
        formId: "form-2ac",
        templateSnapshot: {
          category: "TWO_AREA_CLEAR",
          name: "2 Area Clear",
          level: "scope",
          sections: [],
        },
        projectId: "p1",
        unitId: "1B|4|S238",
        scopeRowId: "row-til",
        scopeTypeCode: "TIL",
        submittedByName: "Inspector",
        outcome: "FAIL",
        deficiencyCount: 1,
        payload: {},
        submittedAt: "2026-06-12T21:00:00.000Z",
        synced: false,
      },
    ]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submissions: [] }),
    }));

    const { listByProject } = await import("@/lib/inspections/submissionsApi");
    const subs = await listByProject("p1");
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({
      scopeRowId: "row-til",
      categorySnapshot: "TWO_AREA_CLEAR",
      outcome: "FAIL",
      _pendingSync: true,
    });
  });
});

describe("listByUnit pending merge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("merges unsynced unit-level IndexedDB submissions", async () => {
    const { getPendingByUnit } = await import("@/lib/inspections/inspectionOfflineDb");
    vi.mocked(getPendingByUnit).mockResolvedValue([
      {
        localId: "local-gyp",
        formId: "form-gyp",
        templateSnapshot: {
          category: "GYPCRETE_MOISTURE_TEST",
          name: "Gypcrete Moisture Test",
          level: "unit",
          sections: [],
        },
        projectId: "p1",
        unitId: "B1|3|209",
        submittedByName: "Inspector",
        outcome: "PASS",
        deficiencyCount: 0,
        payload: {},
        submittedAt: "2026-06-12T21:00:00.000Z",
        synced: false,
      },
    ]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submissions: [] }),
    }));

    const { listByUnit } = await import("@/lib/inspections/submissionsApi");
    const subs = await listByUnit("B1|3|209", "p1");
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({
      level: "unit",
      categorySnapshot: "GYPCRETE_MOISTURE_TEST",
      unitId: "B1|3|209",
      _pendingSync: true,
    });
    expect(subs[0]?.scopeRowId).toBeUndefined();
  });
});

describe("isProjectLevelSubmission", () => {
  it("returns true for project sentinel unitId without scope", async () => {
    const { isProjectLevelSubmission } = await import("@/lib/inspections/submissionsApi");
    expect(
      isProjectLevelSubmission({
        unitId: "||",
        scopeRowId: undefined,
        level: "scope",
        source: "FORM",
      }),
    ).toBe(true);
  });

  it("returns false for scope-level and backfill submissions", async () => {
    const { isProjectLevelSubmission } = await import("@/lib/inspections/submissionsApi");
    expect(
      isProjectLevelSubmission({
        unitId: "1B|4|S238",
        scopeRowId: "row-1",
        level: "scope",
        source: "FORM",
      }),
    ).toBe(false);
    expect(
      isProjectLevelSubmission({
        unitId: "||",
        scopeRowId: undefined,
        level: "project",
        source: "BACKFILL",
      }),
    ).toBe(false);
  });
});

describe("listByProjectLevel", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("fetches project-level submissions with sentinel unitId filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        submissions: [{
          id: "sub-proj-1",
          formId: "form-daily",
          formVersionId: "v1",
          templateSnapshot: {
            category: "OTHER",
            name: "Daily Update",
            level: "project",
            sections: [],
          },
          projectId: "p1",
          unitId: "||",
          scopeRowId: null,
          submittedAt: "2026-06-12T12:00:00.000Z",
          outcome: "COMPLETE",
          deficiencyCount: 0,
          payload: {},
          source: "FORM",
          form: { category: "OTHER", name: "Daily Update", level: "project" },
          clearInspection: { inspectedById: null, inspectedBy: { name: "PM" } },
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { listByProjectLevel } = await import("@/lib/inspections/submissionsApi");
    const subs = await listByProjectLevel("p1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/inspection-submissions?projectId=p1&unitId=%7C%7C",
      { cache: "no-store" },
    );
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({
      id: "sub-proj-1",
      level: "project",
      unitId: "||",
      formNameSnapshot: "Daily Update",
      submittedBy: "PM",
    });
  });

  it("assigns stable local ids to unsynced pending project-level submissions", async () => {
    const { getPendingByProject } = await import("@/lib/inspections/inspectionOfflineDb");
    vi.mocked(getPendingByProject).mockResolvedValue([
      {
        localId: "local-daily-1",
        formId: "form-daily",
        projectId: "p1",
        unitId: "||",
        scopeRowId: undefined,
        submittedAt: "2026-06-18T12:00:00.000Z",
        submittedByName: "Phil",
        outcome: "COMPLETE",
        deficiencyCount: 0,
        payload: {},
        synced: false,
        templateSnapshot: {
          category: "OTHER",
          name: "Daily Update",
          level: "project",
          sections: [],
        },
      },
    ] as never);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submissions: [] }),
    }));

    const { listByProjectLevel } = await import("@/lib/inspections/submissionsApi");
    const subs = await listByProjectLevel("p1");

    expect(subs).toHaveLength(1);
    expect(subs[0]?.id).toBe("local-daily-1");
    expect(subs[0]?._pendingSync).toBe(true);
  });
});

describe("updateOfflineFirst", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueInspection.mockResolvedValue("local-update-1");
  });

  const baseSubmission = {
    id: "sub-1",
    formId: "form-1",
    formNameSnapshot: "Clear Inspection",
    categorySnapshot: "CLEAR_INSPECTION" as const,
    level: "scope" as const,
    projectId: "p1",
    unitId: "u1",
    scopeRowId: "row-1",
    submittedAt: "2026-06-12T12:00:00.000Z",
    submittedBy: "Inspector",
    outcome: "PASS" as const,
    deficiencyCount: 0,
    payload: { q1: { choice: "pass" } },
    templateSnapshot: {
      id: "form-1",
      name: "Clear Inspection",
      description: "",
      status: "published" as const,
      level: "scope" as const,
      scopeTypeCodes: ["CAB"],
      category: "CLEAR_INSPECTION" as const,
      latestVersionId: "v1",
      sections: [{ id: "s1", title: "S", questions: [] }],
    },
    source: "FORM" as const,
  };

  it("queues a background PUT for an existing server submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submission: { id: "sub-1" } }),
    }));

    const { updateOfflineFirst } = await import("@/lib/inspections/submissionsApi");
    const { submission: optimistic, syncPromise } = await updateOfflineFirst(baseSubmission, {
      outcome: "FAIL",
      deficiencyCount: 1,
      payload: { q1: { choice: "fail" } },
    });

    expect(mocks.queueInspection).toHaveBeenCalledWith(
      expect.objectContaining({
        updateServerId: "sub-1",
        outcome: "FAIL",
        deficiencyCount: 1,
        activityLocation: {
          gpsStatus: "GRANTED",
          locationRecordedAt: "2026-08-01T12:00:00.000Z",
          latitude: 40.7,
          longitude: -74.0,
        },
      }),
    );
    expect(optimistic._pendingSync).toBe(true);
    expect(optimistic._localId).toBe("local-update-1");
    expect(optimistic.outcome).toBe("FAIL");
    await expect(syncPromise).resolves.toBe(true);
  });

  it("patches a still-pending queued submission in place", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submission: { id: "local-pending" } }),
    }));

    const { updateOfflineFirst } = await import("@/lib/inspections/submissionsApi");
    const pending = {
      ...baseSubmission,
      id: "local-pending",
      _pendingSync: true as const,
      _localId: "local-pending",
    };

    const { submission: optimistic } = await updateOfflineFirst(pending, {
      outcome: "COMPLETE",
      deficiencyCount: 0,
      payload: { q1: { choice: "pass" } },
    });

    expect(mocks.updatePendingInspection).toHaveBeenCalledWith("local-pending", {
      outcome: "COMPLETE",
      deficiencyCount: 0,
      payload: { q1: { choice: "pass" } },
      activityLocation: {
        gpsStatus: "GRANTED",
        locationRecordedAt: "2026-08-01T12:00:00.000Z",
        latitude: 40.7,
        longitude: -74.0,
      },
    });
    expect(mocks.queueInspection).not.toHaveBeenCalled();
    expect(optimistic.outcome).toBe("COMPLETE");
  });
});

describe("reclassifySubmissionToCalibration()", () => {
  it("PATCHes reclassify-calibration with calibratedAgainstSubmissionId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { reclassifySubmissionToCalibration } = await import("@/lib/inspections/submissionsApi");
    await reclassifySubmissionToCalibration("sub-wrong", "clear-other");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/inspection-submissions/sub-wrong/reclassify-calibration",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ calibratedAgainstSubmissionId: "clear-other" }),
      }),
    );
  });

  it("throws with server error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: vi.fn().mockResolvedValue({ error: "This scope already has a calibration inspection" }),
      }),
    );

    const { reclassifySubmissionToCalibration } = await import("@/lib/inspections/submissionsApi");
    await expect(
      reclassifySubmissionToCalibration("sub-wrong", "clear-other"),
    ).rejects.toThrow("calibration inspection");
  });
});

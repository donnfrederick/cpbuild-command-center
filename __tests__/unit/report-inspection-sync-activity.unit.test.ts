import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingInspection } from "@/lib/inspections/inspectionOfflineDb";
import {
  buildInspectionSyncFailedActivityBody,
  reportInspectionSyncActivityFailure,
} from "@/lib/inspections/report-inspection-sync-activity";

function pendingRecord(overrides: Partial<PendingInspection> = {}): PendingInspection {
  return {
    localId: "local-abc",
    formId: "form-1",
    projectId: "project-1",
    unitId: "B|2|A-213",
    scopeRowId: "row-1",
    scopeTypeCode: "CAB",
    submittedByName: "Inspector",
    outcome: "PASS",
    deficiencyCount: 0,
    payload: {},
    submittedAt: "2026-06-25T10:00:00.000Z",
    synced: false,
    templateSnapshot: { name: "Clear Inspection", category: "CLEAR_INSPECTION" },
    syncErrorHistory: [
      {
        attempt: 1,
        message: "HTTP 500",
        httpStatus: 500,
        errorKind: "retriable",
        recordedAt: "2026-06-25T10:01:00.000Z",
      },
      {
        attempt: 2,
        message: "HTTP 500 again",
        httpStatus: 500,
        errorKind: "retriable",
        recordedAt: "2026-06-25T10:02:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("buildInspectionSyncFailedActivityBody()", () => {
  it("includes full syncErrors array in POST body", () => {
    const body = buildInspectionSyncFailedActivityBody(pendingRecord());
    expect(body?.offlineMutationId).toBe("local-abc");
    expect(body?.syncErrors).toHaveLength(2);
    expect(body?.syncErrors).toEqual(pendingRecord().syncErrorHistory);
  });

  it("returns null when history is empty", () => {
    expect(buildInspectionSyncFailedActivityBody(pendingRecord({ syncErrorHistory: [] }))).toBeNull();
  });

  it("uses Unknown form when template name is missing", () => {
    const body = buildInspectionSyncFailedActivityBody(
      pendingRecord({ templateSnapshot: { category: "CLEAR_INSPECTION" } }),
    );
    expect(body?.formName).toBe("Unknown form");
  });
});

describe("reportInspectionSyncActivityFailure()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis.navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("POSTs full syncErrors to the upsert route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    reportInspectionSyncActivityFailure(pendingRecord());

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/projects/project-1/activity/inspection-sync-failed");
    expect(init.method).toBe("POST");
    const posted = JSON.parse(String(init.body));
    expect(posted.syncErrors).toHaveLength(2);
    expect(posted.offlineMutationId).toBe("local-abc");
  });
});

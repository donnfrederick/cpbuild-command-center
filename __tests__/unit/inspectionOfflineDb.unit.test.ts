import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { deleteCpbInspectionDbForTests } from "@/lib/inspections/inspectionIndexedDb";
import {
  discardInspection,
  getAllPending,
  getPendingByScope,
  getPendingByUnit,
  markFailed,
  markSynced,
  queueInspection,
  type PendingInspection,
} from "@/lib/inspections/inspectionOfflineDb";
import { deleteDraft, putDraft } from "@/lib/inspections/inspectionDraftDb";
import type { InspectionDraft } from "@/lib/inspections/inspection-draft";

function makePending(scopeRowId: string): Omit<PendingInspection, "localId" | "synced" | "serverId" | "failedAt"> {
  return {
    formId: "form-1",
    templateSnapshot: { sections: [] },
    projectId: "proj-1",
    unitId: "B|2|A-213",
    scopeRowId,
    scopeTypeCode: "CAB",
    submittedByName: "Wesley",
    outcome: "PASS",
    deficiencyCount: 0,
    payload: { notes: { capturedFiles: [{ serverUrl: "https://cdn.example/a.jpg" }] } },
    submittedAt: "2026-06-15T12:00:00.000Z",
  };
}

function makeDraft(scopeRowId: string): InspectionDraft {
  return {
    draftKey: `live:${scopeRowId}:form-1:v1`,
    kind: "live",
    projectId: "proj-1",
    unitId: "B|2|A-213",
    scopeRowId,
    formId: "form-1",
    categorySnapshot: "CLEAR_INSPECTION",
    templateSnapshot: { sections: [] },
    updatedAt: "2026-06-15T12:00:00.000Z",
    answers: { q1: { choice: "pass" } },
  };
}

describe("inspectionOfflineDb", () => {
  let scopeRowId: string;

  beforeEach(async () => {
    await deleteCpbInspectionDbForTests();
    scopeRowId = `scope-cab-${crypto.randomUUID()}`;
  });

  it("queueInspection returns localId and getPendingByScope finds it", async () => {
    const localId = await queueInspection(makePending(scopeRowId));
    expect(localId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const pending = await getPendingByScope(scopeRowId);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.localId).toBe(localId);
    expect(pending[0]?.synced).toBe(false);
  });

  it("getPendingByUnit scopes by projectId for location refs", async () => {
    await queueInspection({ ...makePending(scopeRowId), scopeRowId: undefined });
    await queueInspection({
      ...makePending(scopeRowId),
      projectId: "other-proj",
      scopeRowId: undefined,
    });

    const forProject = await getPendingByUnit("B|2|A-213", "proj-1");
    expect(forProject).toHaveLength(1);
    expect(forProject[0]?.projectId).toBe("proj-1");
  });

  it("markSynced removes the row from pending list", async () => {
    const localId = await queueInspection(makePending(scopeRowId));
    expect((await getAllPending()).some((r) => r.localId === localId)).toBe(true);

    await markSynced(localId, "server-sub-1");
    expect((await getAllPending()).some((r) => r.localId === localId)).toBe(false);
  });

  it("markFailed appends syncErrorHistory on each attempt and sets lastSyncError", async () => {
    const localId = await queueInspection(makePending(scopeRowId));
    await markFailed(localId, {
      message: "HTTP 500",
      httpStatus: 500,
      errorKind: "retriable",
    });
    await markFailed(localId, {
      message: "HTTP 422 invalid id",
      httpStatus: 422,
      errorKind: "rejected",
    });

    const row = (await getAllPending()).find((r) => r.localId === localId);
    expect(row?.syncAttempts).toBe(2);
    expect(row?.syncErrorHistory).toHaveLength(2);
    expect(row?.syncErrorHistory?.[1]?.message).toBe("HTTP 422 invalid id");
    expect(row?.lastSyncError).toBe("HTTP 422 invalid id");
    expect(row?.failedAt).toBeTruthy();
  });

  it("discardInspection removes the queued row", async () => {
    const localId = await queueInspection(makePending(scopeRowId));
    await discardInspection(localId);
    expect((await getAllPending()).some((r) => r.localId === localId)).toBe(false);
  });

  it("submit path: draft delete after queueInspection succeeds under serialized IDB", async () => {
    const draft = makeDraft(scopeRowId);
    await putDraft(draft);
    const localId = await queueInspection(makePending(scopeRowId));
    await deleteDraft(draft.draftKey);

    expect(localId).toBeTruthy();
    expect(await getPendingByScope(scopeRowId)).toHaveLength(1);
    const { getDraft } = await import("@/lib/inspections/inspectionDraftDb");
    expect(await getDraft(draft.draftKey)).toBeUndefined();
  });
});

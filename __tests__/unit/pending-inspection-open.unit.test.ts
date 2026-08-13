import { describe, it, expect, vi } from "vitest";
import {
  minimalScopeFromPending,
  locationPartsFromPending,
  OPEN_PENDING_INSPECTION_EVENT,
  requestOpenPendingInspection,
} from "@/lib/offline/pending-inspection-open";
import type { PendingInspection } from "@/lib/inspections/inspectionOfflineDb";
import { PROJECT_LEVEL_INSPECTION_UNIT_ID } from "@/lib/inspections/unit-inspection-ref";

const basePending: PendingInspection = {
  localId: "local-1",
  formId: "form-1",
  templateSnapshot: { name: "Daily Update", level: "project" },
  projectId: "proj-1",
  unitId: PROJECT_LEVEL_INSPECTION_UNIT_ID,
  submittedByName: "Phil",
  outcome: "COMPLETE",
  deficiencyCount: 0,
  payload: {},
  submittedAt: new Date().toISOString(),
  synced: false,
};

describe("pending-inspection-open", () => {
  it("requestOpenPendingInspection dispatches custom event with localId", () => {
    const handler = vi.fn();
    window.addEventListener(OPEN_PENDING_INSPECTION_EVENT, handler);
    requestOpenPendingInspection("abc-123");
    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]![0] as CustomEvent<{ localId: string }>;
    expect(event.detail.localId).toBe("abc-123");
    window.removeEventListener(OPEN_PENDING_INSPECTION_EVENT, handler);
  });

  it("minimalScopeFromPending returns undefined for project-level forms", () => {
    expect(minimalScopeFromPending(basePending)).toBeUndefined();
  });

  it("minimalScopeFromPending builds scope row from pending scope fields", () => {
    const pending: PendingInspection = {
      ...basePending,
      scopeRowId: "scope-1",
      scopeTypeCode: "GYP",
      unitId: "B1|L2|U209",
    };
    const scope = minimalScopeFromPending(pending);
    expect(scope?.id).toBe("scope-1");
    expect(scope?.scopeType?.code).toBe("GYP");
  });

  it("locationPartsFromPending parses unit ref", () => {
    const pending: PendingInspection = {
      ...basePending,
      unitId: "B1|L2|U209",
    };
    expect(locationPartsFromPending(pending)).toEqual({
      building: "B1",
      level: "L2",
      unit: "U209",
    });
  });

  it("locationPartsFromPending returns undefined for project-level unit id", () => {
    expect(locationPartsFromPending(basePending)).toBeUndefined();
  });
});

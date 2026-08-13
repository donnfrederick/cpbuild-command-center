import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import {
  deleteCpbInspectionDbForTests,
  runCpbInspectionDbTask,
} from "@/lib/inspections/inspectionIndexedDb";
import { putDraft, deleteDraft } from "@/lib/inspections/inspectionDraftDb";
import { queueInspection } from "@/lib/inspections/inspectionOfflineDb";
import type { InspectionDraft } from "@/lib/inspections/inspection-draft";

const draft: InspectionDraft = {
  draftKey: "live:scope-1:form-1:v1",
  kind: "live",
  projectId: "proj-1",
  unitId: "unit-1",
  scopeRowId: "scope-1",
  formId: "form-1",
  categorySnapshot: "CLEAR_INSPECTION",
  templateSnapshot: { sections: [] },
  updatedAt: new Date().toISOString(),
  answers: { q1: { choice: "pass" } },
};

describe("runCpbInspectionDbTask", () => {
  beforeEach(async () => {
    await deleteCpbInspectionDbForTests();
  });

  it("concurrent draft save and queueInspection both succeed", async () => {
    await Promise.all([
      putDraft(draft),
      queueInspection({
        formId: "form-1",
        templateSnapshot: draft.templateSnapshot,
        projectId: "proj-1",
        unitId: "unit-1",
        scopeRowId: "scope-1",
        submittedByName: "Inspector",
        outcome: "PASS",
        deficiencyCount: 0,
        payload: {},
        submittedAt: new Date().toISOString(),
      }),
    ]);

    const { getDraft } = await import("@/lib/inspections/inspectionDraftDb");
    expect(await getDraft(draft.draftKey)).toEqual(draft);
  });

  it("top-level concurrent calls are serialized (second waits for first)", async () => {
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runCpbInspectionDbTask(async () => {
      order.push("first-start");
      await gate;
      order.push("first-end");
    });

    // Yield so the chain starts the first task.
    await Promise.resolve();
    await Promise.resolve();

    const second = runCpbInspectionDbTask(async () => {
      order.push("second");
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);

    releaseFirst?.();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("deleteDraft after queueInspection completes without error", async () => {
    await queueInspection({
      formId: "form-1",
      templateSnapshot: draft.templateSnapshot,
      projectId: "proj-1",
      unitId: "unit-1",
      scopeRowId: "scope-1",
      submittedByName: "Inspector",
      outcome: "PASS",
      deficiencyCount: 0,
      payload: {},
      submittedAt: new Date().toISOString(),
    });
    await putDraft(draft);

    await deleteDraft(draft.draftKey);

    const { getDraft } = await import("@/lib/inspections/inspectionDraftDb");
    expect(await getDraft(draft.draftKey)).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import {
  deleteCpbInspectionDbForTests,
} from "@/lib/inspections/inspectionIndexedDb";
import {
  deleteDraft,
  getDraft,
  listDraftsForScope,
  listDraftsForUnit,
  putDraft,
} from "@/lib/inspections/inspectionDraftDb";
import type { InspectionDraft } from "@/lib/inspections/inspection-draft";

function makeDraft(overrides: Partial<InspectionDraft> = {}): InspectionDraft {
  return {
    draftKey: "live:scope-1:form-1:v1",
    kind: "live",
    projectId: "proj-1",
    unitId: "unit-1",
    scopeRowId: "scope-1",
    formId: "form-1",
    formVersionId: "v1",
    categorySnapshot: "CLEAR_INSPECTION",
    templateSnapshot: { id: "form-1", sections: [] },
    updatedAt: new Date().toISOString(),
    answers: { q1: { choice: "pass" } },
    ...overrides,
  };
}

describe("inspectionDraftDb", () => {
  beforeEach(async () => {
    await deleteCpbInspectionDbForTests();
  });

  it("put/get/delete round-trips a draft", async () => {
    const draft = makeDraft();
    await putDraft(draft);
    expect(await getDraft(draft.draftKey)).toEqual(draft);

    await deleteDraft(draft.draftKey);
    expect(await getDraft(draft.draftKey)).toBeUndefined();
  });

  it("lists drafts for a scope via by_scope index", async () => {
    await putDraft(makeDraft({ draftKey: "live:scope-1:form-1:v1" }));
    await putDraft(
      makeDraft({
        draftKey: "live:scope-1:form-2:v1",
        formId: "form-2",
      }),
    );
    await putDraft(
      makeDraft({
        draftKey: "live:scope-2:form-1:v1",
        scopeRowId: "scope-2",
      }),
    );

    const scopeDrafts = await listDraftsForScope("scope-1");
    expect(scopeDrafts).toHaveLength(2);
    expect(scopeDrafts.map((d) => d.draftKey).sort()).toEqual([
      "live:scope-1:form-1:v1",
      "live:scope-1:form-2:v1",
    ]);
  });

  it("lists drafts for a unit via by_unit index", async () => {
    await putDraft(makeDraft({ draftKey: "live:unit:form-1:v1", scopeRowId: undefined, unitId: "unit-a" }));
    await putDraft(
      makeDraft({
        draftKey: "live:scope-1:form-2:v1",
        unitId: "unit-a",
        scopeRowId: "scope-1",
        formId: "form-2",
      }),
    );
    await putDraft(
      makeDraft({
        draftKey: "live:scope-2:form-1:v1",
        unitId: "unit-b",
        scopeRowId: "scope-2",
      }),
    );

    const unitDrafts = await listDraftsForUnit("unit-a");
    expect(unitDrafts).toHaveLength(2);
    expect(unitDrafts.map((d) => d.draftKey).sort()).toEqual([
      "live:scope-1:form-2:v1",
      "live:unit:form-1:v1",
    ]);
  });
});

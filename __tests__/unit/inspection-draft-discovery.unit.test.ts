import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  draftToStoredForm,
  listResumableLiveDrafts,
} from "@/lib/inspections/inspection-draft-discovery";
import type { InspectionDraft } from "@/lib/inspections/inspection-draft";

vi.mock("@/lib/inspections/inspectionDraftDb", () => ({
  listDraftsForScope: vi.fn(),
  listDraftsForUnit: vi.fn(),
}));

import { listDraftsForScope, listDraftsForUnit } from "@/lib/inspections/inspectionDraftDb";

const LIVE_DRAFT: InspectionDraft = {
  draftKey: "live:scope-1:form-1:latest",
  kind: "live",
  projectId: "proj-1",
  unitId: "unit-key",
  scopeRowId: "scope-1",
  formId: "form-1",
  categorySnapshot: "CLEAR_INSPECTION",
  templateSnapshot: {
    id: "form-1",
    name: "Clear Form",
    description: "",
    status: "published",
    level: "scope",
    category: "CLEAR_INSPECTION",
    scopeTypeCodes: ["CAB"],
    sections: [],
  },
  updatedAt: "2026-06-12T10:00:00.000Z",
};

describe("inspection-draft-discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listResumableLiveDrafts filters by project, unit, scope, and category", async () => {
    vi.mocked(listDraftsForScope).mockResolvedValue([
      LIVE_DRAFT,
      { ...LIVE_DRAFT, draftKey: "live:scope-1:form-2:latest", kind: "retry" as const },
      { ...LIVE_DRAFT, projectId: "other" },
    ]);

    const drafts = await listResumableLiveDrafts({
      projectId: "proj-1",
      unitId: "unit-key",
      scopeRowId: "scope-1",
      category: "CLEAR_INSPECTION",
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.formId).toBe("form-1");
  });

  it("listResumableLiveDrafts uses listDraftsForUnit for unit-level drafts", async () => {
    vi.mocked(listDraftsForUnit).mockResolvedValue([
      { ...LIVE_DRAFT, scopeRowId: undefined, categorySnapshot: "GYPCRETE_MOISTURE_TEST" },
      { ...LIVE_DRAFT, scopeRowId: "scope-1" },
    ]);

    const drafts = await listResumableLiveDrafts({
      projectId: "proj-1",
      unitId: "unit-key",
      category: "GYPCRETE_MOISTURE_TEST",
    });

    expect(listDraftsForUnit).toHaveBeenCalledWith("unit-key");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.scopeRowId).toBeUndefined();
  });

  it("draftToStoredForm rebuilds StoredForm from template snapshot", () => {
    const stored = draftToStoredForm(LIVE_DRAFT);
    expect(stored.id).toBe("form-1");
    expect(stored.template.name).toBe("Clear Form");
    expect(stored.template.category).toBe("CLEAR_INSPECTION");
  });
});

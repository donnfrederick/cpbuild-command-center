import { describe, expect, it } from "vitest";
import type { StoredForm } from "@/lib/forms/formsApi";
import {
  isPublishedProjectLevelForm,
  listPublishedProjectLevelForms,
} from "@/lib/inspections/project-level-form-eligibility";

function makeForm(overrides: Partial<StoredForm["template"]> & { id: string }): StoredForm {
  return {
    id: overrides.id,
    template: {
      id: overrides.id,
      name: overrides.name ?? "Form",
      description: "",
      status: overrides.status ?? "published",
      level: overrides.level ?? "project",
      category: overrides.category ?? "OTHER",
      scopeTypeCodes: [],
      sections: [],
      ...overrides,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("isPublishedProjectLevelForm", () => {
  it("accepts published project-level forms", () => {
    expect(
      isPublishedProjectLevelForm(makeForm({ id: "f1", level: "project" }).template),
    ).toBe(true);
  });

  it("rejects scope/unit forms, drafts, and calibration", () => {
    expect(
      isPublishedProjectLevelForm(makeForm({ id: "f2", level: "scope" }).template),
    ).toBe(false);
    expect(
      isPublishedProjectLevelForm(makeForm({ id: "f3", level: "unit" }).template),
    ).toBe(false);
    expect(
      isPublishedProjectLevelForm(makeForm({ id: "f4", status: "draft" }).template),
    ).toBe(false);
    expect(
      isPublishedProjectLevelForm(
        makeForm({ id: "f5", category: "CALIBRATION_INSPECTION" }).template,
      ),
    ).toBe(false);
  });
});

describe("listPublishedProjectLevelForms", () => {
  it("returns only published project-level forms sorted by name", () => {
    const forms = [
      makeForm({ id: "z", name: "Zebra daily" }),
      makeForm({ id: "a", name: "Alpha daily" }),
      makeForm({ id: "scope", name: "Scope form", level: "scope" }),
      makeForm({ id: "draft", name: "Draft", status: "draft" }),
    ];

    const result = listPublishedProjectLevelForms(forms);
    expect(result.map((f) => f.id)).toEqual(["a", "z"]);
  });
});

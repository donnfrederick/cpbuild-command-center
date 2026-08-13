import { describe, expect, it } from "vitest";
import type { StoredForm } from "@/lib/forms/formsApi";
import {
  getFormListScopeCodes,
  normalizeFormListLevel,
  showCategoryTag,
  storedFormToListItem,
} from "@/lib/forms/forms-list-display";

const BASE_STORED: StoredForm = {
  id: "f1",
  createdAt: "2026-06-01T12:00:00Z",
  updatedAt: "2026-06-02T12:00:00Z",
  template: {
    id: "f1",
    name: "Daily Update",
    description: "",
    status: "published",
    level: "project",
    category: "OTHER",
    formPurpose: "documentation",
    scopeTypeCodes: [],
    sections: [{ id: "s1", title: "", questions: [{ id: "q1" } as never] }],
  },
};

describe("storedFormToListItem()", () => {
  it("maps formPurpose from template", () => {
    expect(storedFormToListItem(BASE_STORED).formPurpose).toBe("documentation");
  });

  it("defaults missing formPurpose to inspection", () => {
    const item = storedFormToListItem({
      ...BASE_STORED,
      template: { ...BASE_STORED.template, formPurpose: undefined },
    });
    expect(item.formPurpose).toBe("inspection");
  });
});

describe("showCategoryTag()", () => {
  it("hides OTHER for documentation forms", () => {
    expect(
      showCategoryTag({ category: "OTHER", formPurpose: "documentation" }),
    ).toBe(false);
  });

  it("shows inspection category tags", () => {
    expect(
      showCategoryTag({ category: "FIELD_VERIFICATION", formPurpose: "inspection" }),
    ).toBe(true);
  });
});

describe("normalizeFormListLevel()", () => {
  it("defaults unknown levels to scope", () => {
    expect(normalizeFormListLevel("")).toBe("scope");
    expect(normalizeFormListLevel("scope")).toBe("scope");
  });

  it("preserves unit and project", () => {
    expect(normalizeFormListLevel("unit")).toBe("unit");
    expect(normalizeFormListLevel("project")).toBe("project");
  });
});

describe("getFormListScopeCodes()", () => {
  const canonical = new Set(["CAB", "TIL", "BTH"]);

  it("returns only selected canonical codes", () => {
    expect(getFormListScopeCodes(["CAB", "TIL", "STALE"], canonical)).toEqual(["CAB", "TIL"]);
  });

  it("returns empty when every canonical scope is selected", () => {
    expect(getFormListScopeCodes(["CAB", "TIL", "BTH"], canonical)).toEqual([]);
  });

  it("returns partial selections", () => {
    expect(getFormListScopeCodes(["CAB"], canonical)).toEqual(["CAB"]);
  });
});

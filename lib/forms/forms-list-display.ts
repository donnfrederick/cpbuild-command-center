import type { FormPurpose } from "@/components/forms/formTypes";
import { normalizeFormPurpose } from "@/components/forms/formTypes";
import type { StoredForm } from "@/lib/forms/formsApi";

export type FormListStatus = "draft" | "published" | "archived";

export interface FormListItem {
  id: string;
  name: string;
  description: string;
  status: FormListStatus;
  questionCount: number;
  updatedAt: string;
  createdAt: string;
  category: string;
  level: string;
  scopeTypeCodes: string[];
  formPurpose: FormPurpose;
}

/** Maps API stored form → row model for the forms list page. */
export function storedFormToListItem(s: StoredForm): FormListItem {
  const t = s.template;
  const status: FormListStatus = t.status === "published" ? "published" : "draft";
  const questionCount = t.sections.reduce((sum, sec) => sum + sec.questions.length, 0);
  return {
    id: s.id,
    name: t.name || "Untitled form",
    description: t.description,
    status,
    questionCount,
    updatedAt: s.updatedAt,
    createdAt: s.createdAt,
    category: t.category ?? "",
    level: t.level ?? "scope",
    scopeTypeCodes: t.scopeTypeCodes ?? [],
    formPurpose: normalizeFormPurpose(t.formPurpose),
  };
}

/** Documentation forms auto-use OTHER — hide that chip on the list card. */
export function showCategoryTag(item: Pick<FormListItem, "category" | "formPurpose">): boolean {
  if (!item.category) return false;
  if (item.formPurpose === "documentation" && item.category === "OTHER") return false;
  return true;
}

export type FormListLevel = "scope" | "unit" | "project";

/** Normalizes stored level string for list-card level pills. */
export function normalizeFormListLevel(level: string): FormListLevel {
  if (level === "unit" || level === "project") return level;
  return "scope";
}

/**
 * Scope chips for list cards — only explicitly selected canonical codes.
 * When every canonical scope is selected, return [] so the card is not
 * flooded with redundant tags (category + scope-level pill are enough).
 */
export function getFormListScopeCodes(
  scopeTypeCodes: string[],
  canonicalCodes: ReadonlySet<string>,
): string[] {
  if (scopeTypeCodes.length === 0) return [];
  const selected = scopeTypeCodes.filter((code) => canonicalCodes.has(code));
  if (canonicalCodes.size > 0 && selected.length >= canonicalCodes.size) {
    return [];
  }
  return selected;
}

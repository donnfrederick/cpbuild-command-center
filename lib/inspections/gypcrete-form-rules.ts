import type { FormLevel, FormTemplate, InspectionCategory } from "@/components/forms/formTypes";

export const GYPCRETE_INSPECTION_CATEGORY: InspectionCategory = "GYPCRETE_MOISTURE_TEST";

export function isGypcreteInspectionCategory(
  category: string | null | undefined,
): boolean {
  return category === GYPCRETE_INSPECTION_CATEGORY;
}

/** Gypcrete forms are always unit-level with no scope type tags. */
export function normalizeGypcreteFormSetup<T extends { category: string; level: FormLevel; scopeTypeCodes: string[] }>(
  input: T,
): T {
  if (!isGypcreteInspectionCategory(input.category)) return input;
  return {
    ...input,
    level: "unit",
    scopeTypeCodes: [],
  };
}

export function isPublishedUnitLevelGypcreteForm(
  template: Pick<FormTemplate, "id" | "status" | "level" | "category">,
): boolean {
  return (
    Boolean(template.id) &&
    template.status === "published" &&
    template.category === GYPCRETE_INSPECTION_CATEGORY &&
    template.level === "unit"
  );
}

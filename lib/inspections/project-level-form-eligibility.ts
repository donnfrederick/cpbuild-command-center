import type { FormTemplate } from "@/components/forms/formTypes";
import type { StoredForm } from "@/lib/forms/formsApi";

/** Published form template eligible for the project hub "Start project form" picker. */
export function isPublishedProjectLevelForm(template: FormTemplate | null | undefined): boolean {
  if (!template || template.status !== "published" || !template.id) return false;
  if (template.level !== "project") return false;
  if (template.category === "CALIBRATION_INSPECTION") return false;
  return true;
}

/** Published project-level forms, sorted alphabetically by name. */
export function listPublishedProjectLevelForms(forms: StoredForm[]): StoredForm[] {
  return forms
    .filter((f) => isPublishedProjectLevelForm(f.template))
    .sort((a, b) => {
      const nameA = a.template?.name?.trim() || "";
      const nameB = b.template?.name?.trim() || "";
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    });
}

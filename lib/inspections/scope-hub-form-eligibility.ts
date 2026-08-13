import type { FormTemplate } from "@/components/forms/formTypes";
import { isFlooringCanonicalCode, unitHasFlooringScope, type ScopeForFlooringCheck } from "@/lib/inspections/flooring-scope-eligibility";
import { isPublishedUnitLevelGypcreteForm } from "@/lib/inspections/gypcrete-form-rules";

/** Published unit-level Gypcrete forms eligible from the unit Inspections "+ Add" flow. */
export function isPublishedGypcreteFormEligibleForUnit(
  template: FormTemplate,
  unitScopes: ScopeForFlooringCheck[],
): boolean {
  if (!isPublishedUnitLevelGypcreteForm(template)) return false;
  return unitHasFlooringScope(unitScopes);
}

/** Whether a published unit-level Gypcrete form appears in a flooring scope's status hub. */
export function isPublishedFormEligibleForScopeHub(
  template: FormTemplate,
  scopeCode: string | null,
): boolean {
  if (template.status !== "published" || !template.id) return false;
  if (template.category === "CALIBRATION_INSPECTION") return false;

  if (template.category === "GYPCRETE_MOISTURE_TEST") {
    return isFlooringCanonicalCode(scopeCode) && isPublishedUnitLevelGypcreteForm(template);
  }

  if (template.level === "project") return false;
  if (template.level !== "scope") return false;
  return scopeCode ? template.scopeTypeCodes.includes(scopeCode) : false;
}

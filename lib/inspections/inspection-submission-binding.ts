import type { FormLevel, FormTemplate, InspectionCategory } from "@/components/forms/formTypes";
import { isUnitLevelInspectionCategory } from "@/components/forms/formTypes";

export interface InspectionSubmissionBinding {
  level: FormLevel;
  scopeRowId: string | undefined;
  scopeTypeCode: string | undefined;
}

/** Resolve POST/insert binding — Gypcrete is always unit-level even from a scope hub entry. */
export function resolveInspectionSubmissionBinding(args: {
  category: InspectionCategory;
  formLevel: FormLevel;
  scopeRowId?: string;
  scopeTypeCode?: string;
}): InspectionSubmissionBinding {
  if (isUnitLevelInspectionCategory(args.category)) {
    return {
      level: "unit",
      scopeRowId: undefined,
      scopeTypeCode: undefined,
    };
  }

  if (args.formLevel === "project") {
    return {
      level: "project",
      scopeRowId: undefined,
      scopeTypeCode: undefined,
    };
  }

  if (args.formLevel === "scope") {
    return {
      level: "scope",
      scopeRowId: args.scopeRowId,
      scopeTypeCode: args.scopeTypeCode,
    };
  }

  return {
    level: "unit",
    scopeRowId: undefined,
    scopeTypeCode: undefined,
  };
}

export function resolveSubmissionBindingFromTemplate(
  template: Pick<FormTemplate, "category" | "level">,
  scope?: {
    id: string;
    scopeType?: {
      code?: string | null;
      canonicalScopeType?: { code?: string | null } | null;
    } | null;
  },
): InspectionSubmissionBinding {
  const scopeCode =
    scope?.scopeType?.canonicalScopeType?.code ?? scope?.scopeType?.code ?? undefined;

  return resolveInspectionSubmissionBinding({
    category: template.category,
    formLevel: template.level,
    scopeRowId: scope?.id,
    scopeTypeCode: scopeCode,
  });
}

import type { FormLevel } from "@/components/forms/formTypes";
import { isUnitLevelInspectionCategory } from "@/components/forms/formTypes";

/** Stored on inspection_submissions.unitId for project-level forms (matches field notes). */
export const PROJECT_LEVEL_INSPECTION_UNIT_ID = "||";

export function isProjectLevelInspectionUnitId(unitId: string | null | undefined): boolean {
  return unitId === PROJECT_LEVEL_INSPECTION_UNIT_ID;
}

/** Location key for unit-level inspections — matches observations / album unitRef. */
export function unitInspectionRef(parts: {
  building?: string | null;
  level?: string | null;
  unit?: string | null;
}): string {
  return `${parts.building ?? ""}|${parts.level ?? ""}|${parts.unit ?? ""}`;
}

/** Validates unitId stored on unit-level submissions (building|level|unit). */
export function isValidUnitInspectionRef(unitId: string): boolean {
  const parts = unitId.split("|");
  if (parts.length !== 3) return false;
  return parts[2].trim().length > 0;
}

/** Parses a unit-level inspection location ref into chip fields. */
export function parseUnitInspectionRef(
  unitId: string,
): { building: string; level: string; unit: string } | null {
  if (!isValidUnitInspectionRef(unitId)) return null;
  const [building = "", level = "", unit = ""] = unitId.split("|");
  return { building, level, unit };
}

/**
 * True when unitId is a database id (e.g. scope row UUID), not a building|level|unit ref.
 * Queue/UI labels must not surface these opaque ids to users.
 */
export function isOpaqueInspectionUnitId(unitId: string | null | undefined): boolean {
  if (!unitId?.trim()) return false;
  if (isProjectLevelInspectionUnitId(unitId)) return false;
  if (isValidUnitInspectionRef(unitId)) return false;
  // Legacy pipe refs without a unit segment (e.g. North|2|) are still location hints.
  if (unitId.includes("|")) return false;
  return true;
}

export type InspectionScopeRowLocation = {
  building: string;
  level: string;
  unit: string;
  scopeType?: { name: string } | null;
};

/** Activity metadata location — scope rows include scopeName; unit-level rows do not. */
export function buildInspectionActivityLocationMetadata(input: {
  scopeRowId?: string | null;
  unitId?: string | null;
  scopeRow?: InspectionScopeRowLocation | null;
  scopeTypeCode?: string | null;
}): {
  building: string;
  level: string;
  unit: string;
  scopeRowId?: string;
  scopeName?: string;
} {
  if (input.scopeRowId && input.scopeRow) {
    const scopeName = input.scopeRow.scopeType?.name ?? input.scopeTypeCode ?? "";
    return {
      building: input.scopeRow.building,
      level: input.scopeRow.level,
      unit: input.scopeRow.unit,
      scopeRowId: input.scopeRowId,
      ...(scopeName ? { scopeName } : {}),
    };
  }

  if (input.scopeRowId) {
    const scopeName = input.scopeTypeCode ?? "";
    return {
      building: "",
      level: "",
      unit: "",
      scopeRowId: input.scopeRowId,
      ...(scopeName ? { scopeName } : {}),
    };
  }

  const parsed = input.unitId ? parseUnitInspectionRef(input.unitId) : null;
  if (isProjectLevelInspectionUnitId(input.unitId ?? null)) {
    return { building: "", level: "", unit: "" };
  }
  return {
    building: parsed?.building ?? "",
    level: parsed?.level ?? "",
    unit: parsed?.unit ?? "",
  };
}

export type FormLevelScopeValidation =
  | { ok: true }
  | { ok: false; status: 422; error: string };

/**
 * Enforces form.level vs scopeRowId/unitId on POST /api/inspection-submissions.
 */
export function validateFormLevelScopeBinding(args: {
  formLevel: FormLevel | string;
  /** When set, Gypcrete always binds at unit level regardless of formLevel in DB. */
  formCategory?: string | null;
  unitId: string;
  scopeRowId?: string;
}): FormLevelScopeValidation {
  const { formLevel, unitId, scopeRowId } = args;
  const effectiveLevel =
    args.formCategory != null &&
    isUnitLevelInspectionCategory(
      args.formCategory as Parameters<typeof isUnitLevelInspectionCategory>[0],
    )
      ? "unit"
      : formLevel;

  if (effectiveLevel === "project") {
    if (scopeRowId) {
      return {
        ok: false,
        status: 422,
        error: "Project-level forms cannot include scopeRowId",
      };
    }
    if (unitId !== PROJECT_LEVEL_INSPECTION_UNIT_ID) {
      return {
        ok: false,
        status: 422,
        error: `unitId must be ${PROJECT_LEVEL_INSPECTION_UNIT_ID} for project-level forms`,
      };
    }
    return { ok: true };
  }

  if (effectiveLevel === "unit") {
    if (scopeRowId) {
      return {
        ok: false,
        status: 422,
        error: "Unit-level forms cannot include scopeRowId",
      };
    }
    if (!isValidUnitInspectionRef(unitId)) {
      return {
        ok: false,
        status: 422,
        error: "unitId must be a building|level|unit location ref with a non-empty unit",
      };
    }
    return { ok: true };
  }

  if (effectiveLevel === "scope") {
    if (!scopeRowId) {
      return {
        ok: false,
        status: 422,
        error: "Scope-level forms require scopeRowId",
      };
    }
    return { ok: true };
  }

  return {
    ok: false,
    status: 422,
    error: `Unknown form level: ${String(formLevel)}`,
  };
}

import type { UnitContext } from "@/components/projects/AddObservationModal";
import { isCustomSiteUnitRef, parseCustomSiteUnitRef } from "@/lib/custom-site-locations";
import type { LocationBuilderTagInput } from "@/lib/field-notes/location-builder-tags";
import { formatProjectLevelBuilderTagDetail } from "@/lib/field-notes/location-builder-tags";

export interface FieldNotesLocationLabels {
  levelHeading: (level: string) => string;
  buildingAndLevel: (building: string, level: string) => string;
  unknown: string;
  projectUnitKey: string;
}

/** True when unitRef matches {@link PROJECT_LEVEL_UNIT_REF_OR} sentinel values. */
export function isProjectLevelUnitRef(unitRef: string | null | undefined): boolean {
  return unitRef == null || unitRef === "" || unitRef === "||";
}

/** Prisma `where` fragment for project-level observations/issues. */
export const PROJECT_LEVEL_UNIT_REF_OR = [
  { unitRef: null },
  { unitRef: "" },
  { unitRef: "||" },
] as const;

export function unitContextFromUnitRef(
  unitRef: string | null | undefined,
  labels: FieldNotesLocationLabels,
): UnitContext {
  if (isProjectLevelUnitRef(unitRef)) {
    return {
      unitKey: labels.projectUnitKey,
      building: "",
      level: "",
      unit: "",
      unitRef: "",
    };
  }
  if (isCustomSiteUnitRef(unitRef)) {
    const parsed = parseCustomSiteUnitRef(unitRef!);
    const name = parsed?.name ?? labels.unknown;
    return {
      unitKey: name,
      building: "",
      level: "",
      unit: name,
      unitRef: unitRef ?? "",
    };
  }
  const parts = unitRef!.split("|");
  const building = parts[0] ?? "";
  const level = parts[1] ?? "";
  const unit = parts[2] ?? "";
  return {
    unitKey: unit || unitRef || labels.unknown,
    building,
    level,
    unit,
    unitRef: unitRef ?? `${building}|${level}|${unit}`,
  };
}

export interface FieldNotesLocationDisplay {
  /** Project name (project-level) or unit identifier (location-scoped). */
  headline: string;
  /** e.g. "Project level" or "Building A, Level 3" — null when no secondary detail. */
  detail: string | null;
}

export function formatFieldNotesLocationDisplay(
  unitRef: string | null | undefined,
  projectName: string,
  projectLevelLabel: string,
  labels: FieldNotesLocationLabels,
  builderTags?: LocationBuilderTagInput,
  builderTagLabels?: {
    buildPhase: (value: string) => string;
    area: (value: string) => string;
  },
): FieldNotesLocationDisplay {
  if (isProjectLevelUnitRef(unitRef)) {
    const detail =
      builderTagLabels && builderTags
        ? formatProjectLevelBuilderTagDetail(projectLevelLabel, builderTags, builderTagLabels)
        : projectLevelLabel;
    return { headline: projectName, detail };
  }
  if (isCustomSiteUnitRef(unitRef)) {
    const parsed = parseCustomSiteUnitRef(unitRef!);
    return {
      headline: parsed?.name ?? labels.unknown,
      detail: null,
    };
  }
  const ctx = unitContextFromUnitRef(unitRef, labels);
  const headline = fieldNotesLocationHeadline(ctx, labels);
  let detail: string | null = null;
  if (ctx.unit && ctx.building && ctx.level) {
    detail = labels.buildingAndLevel(ctx.building, ctx.level);
  } else if (ctx.unit && ctx.building) {
    detail = ctx.building;
  } else if (ctx.unit && ctx.level) {
    detail = labels.levelHeading(ctx.level);
  } else if (!ctx.unit && ctx.building && ctx.level) {
    detail = ctx.building;
  }
  return { headline, detail };
}

/** Primary location label — never falls back to raw pipe-delimited unitRef. */
function fieldNotesLocationHeadline(ctx: UnitContext, labels: FieldNotesLocationLabels): string {
  if (ctx.unit) return ctx.unit;
  if (ctx.level) return labels.levelHeading(ctx.level);
  if (ctx.building) return ctx.building;
  return labels.unknown;
}

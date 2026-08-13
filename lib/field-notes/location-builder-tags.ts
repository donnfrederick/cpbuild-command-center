import type { PrismaClient } from "@prisma/client";
import { isDefinedLocationBuilderField } from "@/lib/location-builder-display";
import { isProjectLevelUnitRef } from "@/lib/field-notes-scope";

export interface LocationBuilderTagOptions {
  buildPhases: string[];
  areas: string[];
}

export interface LocationBuilderTagInput {
  buildPhaseTag?: string | null;
  areaTag?: string | null;
}

function normalizeTag(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function collectLocationBuilderTagOptions(
  rows: ReadonlyArray<{ buildPhase: string; area: string }>,
): LocationBuilderTagOptions {
  const buildPhases = new Set<string>();
  const areas = new Set<string>();
  for (const row of rows) {
    const phase = (row.buildPhase ?? "").trim();
    if (isDefinedLocationBuilderField(phase)) {
      buildPhases.add(phase);
    }
    const area = (row.area ?? "").trim();
    if (isDefinedLocationBuilderField(area)) {
      areas.add(area);
    }
  }
  const sort = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
  return {
    buildPhases: [...buildPhases].sort(sort),
    areas: [...areas].sort(sort),
  };
}

export async function loadLocationBuilderTagOptions(
  db: Pick<PrismaClient, "projectRow">,
  projectId: string,
): Promise<LocationBuilderTagOptions> {
  const rows = await db.projectRow.findMany({
    where: { projectId },
    select: { buildPhase: true, area: true },
  });
  return collectLocationBuilderTagOptions(rows);
}

export function normalizeLocationBuilderTagInput(
  input: LocationBuilderTagInput,
): { buildPhaseTag: string | null; areaTag: string | null } {
  return {
    buildPhaseTag: normalizeTag(input.buildPhaseTag),
    areaTag: normalizeTag(input.areaTag),
  };
}

export const LOCATION_BUILDER_TAG_MAX_LENGTH = 100;

/** Returns an error message when tags are invalid; null when OK. */
export function validateLocationBuilderTags(
  unitRef: string | null | undefined,
  tags: LocationBuilderTagInput,
  options: LocationBuilderTagOptions,
): string | null {
  const normalized = normalizeLocationBuilderTagInput(tags);
  const hasTags = normalized.buildPhaseTag !== null || normalized.areaTag !== null;
  if (!hasTags) return null;

  if (!isProjectLevelUnitRef(unitRef)) {
    return "Build phase and area tags are only allowed for project-level field notes.";
  }

  if (
    normalized.buildPhaseTag !== null &&
    !options.buildPhases.includes(normalized.buildPhaseTag)
  ) {
    return "Selected build phase is not defined on this project.";
  }

  if (normalized.areaTag !== null) {
    if (normalized.areaTag.length > LOCATION_BUILDER_TAG_MAX_LENGTH) {
      return "Area reference is too long.";
    }
    if (options.areas.length > 0 && !options.areas.includes(normalized.areaTag)) {
      return "Selected area is not defined on this project.";
    }
  }

  return null;
}

export function builderTagRequestFields(
  tags: LocationBuilderTagInput,
): { buildPhaseTag?: string; areaTag?: string } {
  const normalized = normalizeLocationBuilderTagInput(tags);
  const fields: { buildPhaseTag?: string; areaTag?: string } = {};
  if (normalized.buildPhaseTag) fields.buildPhaseTag = normalized.buildPhaseTag;
  if (normalized.areaTag) fields.areaTag = normalized.areaTag;
  return fields;
}

export function formatProjectLevelBuilderTagDetail(
  projectLevelLabel: string,
  tags: LocationBuilderTagInput,
  labels: {
    buildPhase: (value: string) => string;
    area: (value: string) => string;
  },
): string {
  const normalized = normalizeLocationBuilderTagInput(tags);
  const parts = [projectLevelLabel];
  if (normalized.buildPhaseTag) {
    parts.push(labels.buildPhase(normalized.buildPhaseTag));
  }
  if (normalized.areaTag) {
    parts.push(labels.area(normalized.areaTag));
  }
  return parts.join(" · ");
}

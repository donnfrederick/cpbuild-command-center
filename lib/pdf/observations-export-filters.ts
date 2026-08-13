import {
  buildFieldLogLocationUnitRefWhere,
} from "@/lib/field-log-location-filter";
import type { Prisma } from "@prisma/client";

export type ObservationsExportDatePreset = "all" | "7d" | "30d" | "custom";

export type ObservationsExportFilterInput = {
  projectId: string;
  observationIds?: string[];
  obsTypes?: string[];
  authors?: string[];
  buildings?: string[];
  levels?: string[];
  datePreset?: ObservationsExportDatePreset;
  dateFrom?: string;
  dateTo?: string;
};

const MS_DAY = 86_400_000;

export function parseObservationsExportDatePreset(value: unknown): ObservationsExportDatePreset {
  if (value === "7d" || value === "30d" || value === "custom") return value;
  return "all";
}

/** @deprecated Prefer buildFieldLogLocationUnitRefWhere — kept for existing tests/callers. */
export function buildObservationsBuildingWhere(
  buildings: string[],
): Prisma.ProjectObservationWhereInput | undefined {
  const where = buildFieldLogLocationUnitRefWhere(buildings);
  return where as Prisma.ProjectObservationWhereInput | undefined;
}

export function buildObservationsLocationWhere(
  buildings: string[] = [],
  levels: string[] = [],
): Prisma.ProjectObservationWhereInput | undefined {
  const where = buildFieldLogLocationUnitRefWhere(buildings, levels);
  return where as Prisma.ProjectObservationWhereInput | undefined;
}

export function buildObservationsDateWhere(
  datePreset: ObservationsExportDatePreset,
  dateFrom?: string,
  dateTo?: string,
): Prisma.ProjectObservationWhereInput | undefined {
  const now = Date.now();
  if (datePreset === "7d") {
    return { createdAt: { gte: new Date(now - 7 * MS_DAY) } };
  }
  if (datePreset === "30d") {
    return { createdAt: { gte: new Date(now - 30 * MS_DAY) } };
  }
  if (datePreset === "custom" && (dateFrom || dateTo)) {
    return {
      createdAt: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(new Date(dateTo).getTime() + MS_DAY - 1) } : {}),
      },
    };
  }
  return undefined;
}

/** Build Prisma where for observations PDF export — always AND-combines every active filter. */
export function buildObservationsExportWhere(
  input: ObservationsExportFilterInput,
): Prisma.ProjectObservationWhereInput {
  const and: Prisma.ProjectObservationWhereInput[] = [{ projectId: input.projectId }];

  if (input.observationIds && input.observationIds.length > 0) {
    and.push({ id: { in: input.observationIds } });
  }
  if (input.obsTypes && input.obsTypes.length > 0) {
    and.push({ observationTypeCode: { in: input.obsTypes } });
  }
  if (input.authors && input.authors.length > 0) {
    and.push({ authorId: { in: input.authors } });
  }

  const locationWhere = buildObservationsLocationWhere(
    input.buildings ?? [],
    input.levels ?? [],
  );
  if (locationWhere) and.push(locationWhere);

  const dateWhere = buildObservationsDateWhere(
    input.datePreset ?? "all",
    input.dateFrom,
    input.dateTo,
  );
  if (dateWhere) and.push(dateWhere);

  return and.length === 1 ? and[0]! : { AND: and };
}

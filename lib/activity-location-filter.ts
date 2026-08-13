import type { Prisma } from "@prisma/client";

interface ActivityLocationFilterInput {
  building?: string;
  level?: string;
  unit?: string;
}

function metadataPathEquals(path: string, value: string): Prisma.ActivityLogWhereInput {
  return { metadata: { path: [path], equals: value } };
}

function unitRefFilter({ building, level, unit }: ActivityLocationFilterInput): Prisma.ActivityLogWhereInput | null {
  if (!building && !level && !unit) return null;
  const unitRef = unit
    ? `${building ?? ""}|${level ?? ""}|${unit}`
    : `${building ?? ""}|${level ?? ""}|`;
  return {
    metadata: {
      path: ["unitRef"],
      string_contains: unitRef,
    },
  };
}

function unitRefsArrayFilter({ building, level, unit }: ActivityLocationFilterInput): Prisma.ActivityLogWhereInput | null {
  if (!unit && !building && !level) return null;
  return {
    metadata: {
      path: ["unitRefs"],
      array_contains: {
        ...(building ? { building } : {}),
        ...(level ? { level } : {}),
        ...(unit ? { unit } : {}),
      },
    },
  };
}

/**
 * Builds the JSON metadata predicate used by project, unit-modal, and PDF
 * activity endpoints. Activity rows store location details in metadata rather
 * than dedicated columns, so every supported metadata shape must be checked.
 */
export function buildActivityLocationWhere({
  building,
  level,
  unit,
}: ActivityLocationFilterInput): Prisma.ActivityLogWhereInput {
  if (!building && !level && !unit) return {};

  const directAnd: Prisma.ActivityLogWhereInput[] = [];
  if (building) directAnd.push(metadataPathEquals("building", building));
  if (level) directAnd.push(metadataPathEquals("level", level));
  if (unit) directAnd.push(metadataPathEquals("unit", unit));

  const or: Prisma.ActivityLogWhereInput[] = [];
  if (directAnd.length > 0) or.push({ AND: directAnd });

  const unitRef = unitRefFilter({ building, level, unit });
  if (unitRef) or.push(unitRef);

  const unitRefs = unitRefsArrayFilter({ building, level, unit });
  if (unitRefs) or.push(unitRefs);

  return or.length > 0 ? { OR: or } : {};
}

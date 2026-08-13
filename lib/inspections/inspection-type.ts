import type { Prisma, PrismaClient } from "@prisma/client";
import {
  categoryToInspectionTypeCode,
  DEFAULT_INSPECTION_TYPE_CODE,
  type InspectionTypeCode,
} from "@/lib/inspections/inspection-type-codes";

export {
  categoryFromSubmissionSnapshot,
  categoryToInspectionTypeCode,
  DEFAULT_INSPECTION_TYPE_CODE,
  inspectionTypeCodeForSubmission,
  INSPECTION_TYPE_DEFINITIONS,
  resolvedSubmissionCategory,
  type InspectionTypeCode,
} from "@/lib/inspections/inspection-type-codes";

/** Prisma nested connect for clearInspection create/upsert. */
export function inspectionTypeConnect(
  category: string | null | undefined
): Prisma.InspectionTypeCreateNestedOneWithoutClearInspectionsInput {
  return { connect: { code: categoryToInspectionTypeCode(category) } };
}

const idByCode = new Map<InspectionTypeCode, string>();

/** Resolve inspection_types.id for createMany (no nested connect). Cached per process. */
export async function getInspectionTypeIdByCode(
  client: Pick<PrismaClient, "inspectionType">,
  code: InspectionTypeCode = DEFAULT_INSPECTION_TYPE_CODE
): Promise<string> {
  const cached = idByCode.get(code);
  if (cached) return cached;
  const row = await client.inspectionType.findUniqueOrThrow({
    where: { code },
    select: { id: true },
  });
  idByCode.set(code, row.id);
  return row.id;
}

/** @internal — test helper */
export function clearInspectionTypeIdCache(): void {
  idByCode.clear();
}

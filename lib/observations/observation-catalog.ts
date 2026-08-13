import { db } from "@/lib/db";

export interface PublicObservationTypeCatalogItem {
  code: string;
  displayName: string;
}

export interface ManageObservationTypeCatalogItem extends PublicObservationTypeCatalogItem {
  sortOrder: number;
  isActive: boolean;
}

export async function fetchActiveObservationCatalog(): Promise<{
  observationTypes: PublicObservationTypeCatalogItem[];
}> {
  const observationTypes = await db.observationTypeCatalog.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    select: { code: true, displayName: true },
  });
  return { observationTypes };
}

export async function fetchManageObservationCatalog(): Promise<{
  observationTypes: ManageObservationTypeCatalogItem[];
}> {
  const observationTypes = await db.observationTypeCatalog.findMany({
    orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    select: {
      code: true,
      displayName: true,
      sortOrder: true,
      isActive: true,
    },
  });
  return { observationTypes };
}

export async function assertActiveObservationTypeCode(code: string): Promise<{
  code: string;
}> {
  const row = await db.observationTypeCatalog.findFirst({
    where: { code, isActive: true },
    select: { code: true },
  });
  if (!row) {
    throw new ObservationCatalogValidationError("Invalid or inactive observation type", "observationType");
  }
  return row;
}

export class ObservationCatalogValidationError extends Error {
  constructor(
    message: string,
    public readonly field: "observationType",
  ) {
    super(message);
    this.name = "ObservationCatalogValidationError";
  }
}

export function observationCatalogValidationStatus(error: unknown): number {
  return error instanceof ObservationCatalogValidationError ? 422 : 500;
}

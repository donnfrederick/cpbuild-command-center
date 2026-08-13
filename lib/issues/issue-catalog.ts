import { db } from "@/lib/db";

export interface PublicIssueTypeCatalogItem {
  code: string;
  displayName: string;
  requiresVisual: boolean;
}

export interface PublicResponsiblePartyCatalogItem {
  code: string;
  displayName: string;
}

export interface ManageIssueTypeCatalogItem extends PublicIssueTypeCatalogItem {
  sortOrder: number;
  isActive: boolean;
}

export interface ManageResponsiblePartyCatalogItem extends PublicResponsiblePartyCatalogItem {
  sortOrder: number;
  isActive: boolean;
}

export async function fetchActiveIssueCatalog(): Promise<{
  issueTypes: PublicIssueTypeCatalogItem[];
  responsibleParties: PublicResponsiblePartyCatalogItem[];
}> {
  const [issueTypes, responsibleParties] = await Promise.all([
    db.issueTypeCatalog.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
      select: { code: true, displayName: true, requiresVisual: true },
    }),
    db.responsiblePartyCatalog.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
      select: { code: true, displayName: true },
    }),
  ]);
  return { issueTypes, responsibleParties };
}

export async function fetchManageIssueCatalog(): Promise<{
  issueTypes: ManageIssueTypeCatalogItem[];
  responsibleParties: ManageResponsiblePartyCatalogItem[];
}> {
  const [issueTypes, responsibleParties] = await Promise.all([
    db.issueTypeCatalog.findMany({
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
      select: {
        code: true,
        displayName: true,
        requiresVisual: true,
        sortOrder: true,
        isActive: true,
      },
    }),
    db.responsiblePartyCatalog.findMany({
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
      select: { code: true, displayName: true, sortOrder: true, isActive: true },
    }),
  ]);
  return { issueTypes, responsibleParties };
}

export async function assertActiveIssueTypeCode(code: string): Promise<{
  code: string;
  requiresVisual: boolean;
}> {
  const row = await db.issueTypeCatalog.findFirst({
    where: { code, isActive: true },
    select: { code: true, requiresVisual: true },
  });
  if (!row) {
    throw new IssueCatalogValidationError("Invalid or inactive issue type", "issueType");
  }
  return row;
}

export async function assertActivePartyCodes(codes: string[]): Promise<string[]> {
  if (codes.length === 0) {
    throw new IssueCatalogValidationError("At least one responsible party is required", "responsibleParties");
  }
  const unique = [...new Set(codes)];
  const rows = await db.responsiblePartyCatalog.findMany({
    where: { code: { in: unique }, isActive: true },
    select: { code: true },
  });
  if (rows.length !== unique.length) {
    throw new IssueCatalogValidationError("Invalid or inactive responsible party", "responsibleParties");
  }
  return unique;
}

export class IssueCatalogValidationError extends Error {
  constructor(
    message: string,
    public readonly field: "issueType" | "responsibleParties" | "responsibleParty",
  ) {
    super(message);
    this.name = "IssueCatalogValidationError";
  }
}

export function catalogValidationStatus(error: unknown): number {
  return error instanceof IssueCatalogValidationError ? 422 : 500;
}

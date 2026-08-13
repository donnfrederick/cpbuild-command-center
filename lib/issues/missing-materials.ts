import { z } from "zod";

export const MISSING_MATERIALS_DESCRIPTION_MAX = 500;
export const MISSING_MATERIALS_QUANTITY_MAX = 999_999.9999;

export interface IssueScopeUom {
  code: string;
  name: string;
}

export interface ScopeWithUom {
  id: string;
  uom?: IssueScopeUom | null;
}

export const missingMaterialDescriptionSchema = z
  .string()
  .trim()
  .min(1, "Missing material description is required")
  .max(MISSING_MATERIALS_DESCRIPTION_MAX);

export const missingMaterialQuantitySchema = z
  .number()
  .positive("Missing material quantity must be a positive number")
  .max(MISSING_MATERIALS_QUANTITY_MAX);

export const missingMaterialUomCodeSchema = z.string().trim().max(20).optional();

export const missingMaterialsPayloadSchema = z.object({
  missingMaterialDescription: z.string().max(MISSING_MATERIALS_DESCRIPTION_MAX).optional(),
  missingMaterialQuantity: z.number().optional(),
  missingMaterialUomCode: missingMaterialUomCodeSchema,
});

export function parseMissingMaterialQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  if (parsed > MISSING_MATERIALS_QUANTITY_MAX) return null;
  return parsed;
}

export function resolveSelectedScopeUom(
  scopes: ScopeWithUom[],
  selectedRowIds: Iterable<string>,
): IssueScopeUom | null {
  const selectedIds = new Set(selectedRowIds);
  const selected = scopes.filter((scope) => selectedIds.has(scope.id));
  const pool = selected.length > 0 ? selected : scopes.length === 1 ? scopes : [];
  for (const scope of pool) {
    if (scope.uom?.code) return scope.uom;
  }
  return null;
}

export function missingMaterialsFieldsComplete(
  issueType: string,
  materialDescription: string,
  materialQuantityRaw: string,
): boolean {
  if (issueType !== "MISSING_MATERIALS") return true;
  const descOk = missingMaterialDescriptionSchema.safeParse(materialDescription).success;
  const qty = parseMissingMaterialQuantity(materialQuantityRaw);
  return descOk && qty != null;
}

export function validateMissingMaterialsForIssueType(
  issueType: string,
  data: {
    missingMaterialDescription?: string;
    missingMaterialQuantity?: number;
  },
): string | null {
  if (issueType !== "MISSING_MATERIALS") return null;

  const descResult = missingMaterialDescriptionSchema.safeParse(data.missingMaterialDescription ?? "");
  if (!descResult.success) return "Missing material description is required";

  const qtyResult = missingMaterialQuantitySchema.safeParse(data.missingMaterialQuantity);
  if (!qtyResult.success) return "Missing material quantity must be a positive number";

  return null;
}

export function formatMissingMaterialQuantityDisplay(
  quantity: number | string | null | undefined,
  uomCode: string | null | undefined,
): string | null {
  if (quantity == null || quantity === "") return null;
  const numeric = typeof quantity === "number" ? quantity : Number(quantity);
  if (!Number.isFinite(numeric)) return null;
  const formatted = Number.isInteger(numeric) ? String(numeric) : String(numeric);
  const uom = uomCode?.trim();
  return uom ? `${formatted} ${uom}` : formatted;
}

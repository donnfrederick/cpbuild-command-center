/**
 * Canonical inspection type rows — keep in sync with migration seed and bootstrap script.
 */
export const INSPECTION_TYPE_DEFINITIONS = [
  { id: "insp_type_clear", code: "CLEAR_INSPECTION", name: "Clear Inspection" },
  { id: "insp_type_calibration", code: "CALIBRATION_INSPECTION", name: "Calibration Inspection" },
  { id: "insp_type_two_area_clear", code: "TWO_AREA_CLEAR", name: "2 Area Clear" },
  { id: "insp_type_field_verification", code: "FIELD_VERIFICATION", name: "Field Verification" },
  { id: "insp_type_gypcrete", code: "GYPCRETE_MOISTURE_TEST", name: "Gypcrete Moisture Test" },
  { id: "insp_type_other", code: "OTHER", name: "Other" },
] as const;

export type InspectionTypeCode = (typeof INSPECTION_TYPE_DEFINITIONS)[number]["code"];

export const DEFAULT_INSPECTION_TYPE_CODE: InspectionTypeCode = "CLEAR_INSPECTION";

const INSPECTION_TYPE_CODE_SET = new Set<string>(
  INSPECTION_TYPE_DEFINITIONS.map((row) => row.code),
);

/** Categories that write scope-level history (all inspection_types codes except none). */
export function isInspectionHistoryCategory(
  category: string | null | undefined,
): category is InspectionTypeCode {
  return typeof category === "string" && INSPECTION_TYPE_CODE_SET.has(category);
}

/** Formal inspections that sync project_rows.inspectionStatus (not calibration). */
export function isScopeInspectionStatusCategory(
  category: string | null | undefined,
): boolean {
  return isInspectionHistoryCategory(category) && category !== "CALIBRATION_INSPECTION";
}

/** Map a stored inspection category string to an inspection_types.code value. */
export function categoryToInspectionTypeCode(
  category: string | null | undefined,
): InspectionTypeCode {
  if (category === "CALIBRATION_INSPECTION") {
    return "CALIBRATION_INSPECTION";
  }
  if (isInspectionHistoryCategory(category)) {
    return category;
  }
  return DEFAULT_INSPECTION_TYPE_CODE;
}

/** Read category from a submission templateSnapshot stub (backfill / scripts only). */
export function categoryFromSubmissionSnapshot(
  templateSnapshot: unknown,
): string | undefined {
  if (!templateSnapshot || typeof templateSnapshot !== "object" || Array.isArray(templateSnapshot)) {
    return undefined;
  }
  const category = (templateSnapshot as Record<string, unknown>).category;
  return typeof category === "string" ? category : undefined;
}

/**
 * Stored submission category: snapshot stub wins over form.category (calibrations
 * reuse CLEAR_INSPECTION forms but persist CALIBRATION_INSPECTION on the stub).
 */
export function resolvedSubmissionCategory(
  templateSnapshot: unknown,
  formCategory: string | null | undefined,
): string | undefined {
  return categoryFromSubmissionSnapshot(templateSnapshot) ?? formCategory ?? undefined;
}

export function inspectionTypeCodeForSubmission(
  templateSnapshot: unknown,
  formCategory: string | null | undefined,
): InspectionTypeCode {
  return categoryToInspectionTypeCode(
    resolvedSubmissionCategory(templateSnapshot, formCategory),
  );
}

export function inspectionTypeNameForCode(code: InspectionTypeCode): string {
  const row = INSPECTION_TYPE_DEFINITIONS.find((def) => def.code === code);
  return row?.name ?? code;
}

/** Report rows: calibration shows the type being calibrated, not CALIBRATION_INSPECTION. */
export function resolveReportInspectionType(input: {
  isCalibration: boolean;
  rowInspectionTypeCode: string | null | undefined;
  calibratedAgainstTypeCode: string | null | undefined;
  templateSnapshot: unknown;
  formCategory: string | null | undefined;
}): { code: InspectionTypeCode; name: string } {
  if (input.isCalibration && input.calibratedAgainstTypeCode) {
    const code = categoryToInspectionTypeCode(input.calibratedAgainstTypeCode);
    return { code, name: inspectionTypeNameForCode(code) };
  }
  if (input.rowInspectionTypeCode && input.rowInspectionTypeCode !== "CALIBRATION_INSPECTION") {
    const code = categoryToInspectionTypeCode(input.rowInspectionTypeCode);
    return { code, name: inspectionTypeNameForCode(code) };
  }
  const code = inspectionTypeCodeForSubmission(input.templateSnapshot, input.formCategory);
  if (code === "CALIBRATION_INSPECTION" && input.calibratedAgainstTypeCode) {
    const targetCode = categoryToInspectionTypeCode(input.calibratedAgainstTypeCode);
    return { code: targetCode, name: inspectionTypeNameForCode(targetCode) };
  }
  return { code, name: inspectionTypeNameForCode(code) };
}

/** Inspection types shown in report filters (calibration is an attempt flag, not a type). */
export const REPORT_INSPECTION_TYPE_DEFINITIONS = INSPECTION_TYPE_DEFINITIONS.filter(
  (row) => row.code !== "CALIBRATION_INSPECTION",
);

export type FieldDailySectionSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export type FieldDailyAggregateSaveStatus = "idle" | "saving" | "saved" | "error";

/** Roll up per-section note save states for the sheet header indicator. */
export function aggregateFieldDailySaveStatus(
  statuses: Iterable<FieldDailySectionSaveStatus>,
): FieldDailyAggregateSaveStatus {
  const values = [...statuses];
  if (values.length === 0) return "idle";
  if (values.some((s) => s === "error")) return "error";
  if (values.some((s) => s === "saving" || s === "dirty")) return "saving";
  if (values.some((s) => s === "saved")) return "saved";
  return "idle";
}

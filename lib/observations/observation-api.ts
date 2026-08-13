/** Serialize observation rows for API clients (observationType alias). */
export function serializeObservationRow<T extends { observationTypeCode: string }>(
  row: T,
): T & { observationType: string } {
  return {
    ...row,
    observationType: row.observationTypeCode,
  };
}

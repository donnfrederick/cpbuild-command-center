export interface BulkInstallerRowRef {
  id: string;
  unitKey: string;
}

/** Unique unit card keys for rows that were updated by bulk installer assignment. */
export function unitKeysForBulkInstallerUpdate(
  rows: BulkInstallerRowRef[],
  updatedIds: readonly string[],
): string[] {
  if (updatedIds.length === 0) return [];
  const updated = new Set(updatedIds);
  const keys = new Set<string>();
  for (const row of rows) {
    if (updated.has(row.id)) keys.add(row.unitKey);
  }
  return Array.from(keys);
}

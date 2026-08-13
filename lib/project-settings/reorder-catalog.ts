/** Reorder a list by moving the item at `from` to index `to`. */
export function reorderByIndex<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (!moved) return items;
  next.splice(to, 0, moved);
  return next;
}

/** Assign sequential sortOrder values (10, 20, 30, …). */
export function assignSequentialSortOrders<T extends { sortOrder: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }));
}

/** Returns items whose sortOrder changed after reassignment. */
export function catalogItemsNeedingSortPatch<T extends { code: string; sortOrder: number }>(
  before: T[],
  after: T[],
): T[] {
  const beforeOrders = new Map(before.map((item) => [item.code, item.sortOrder]));
  return after.filter((item) => beforeOrders.get(item.code) !== item.sortOrder);
}

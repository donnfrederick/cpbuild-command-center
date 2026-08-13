export type ActivityCountSort = "most" | "least";

export interface ActivityCountRow {
  id: string;
  name: string;
  subtitle: string;
  count: number;
}

export function sortActivityCountRows<T extends { count: number; name: string }>(
  rows: T[],
  sort: ActivityCountSort,
): T[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (a.count !== b.count) {
      return sort === "most" ? b.count - a.count : a.count - b.count;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return sorted;
}

export function maxActivityCount(rows: readonly { count: number }[]): number {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((row) => row.count));
}

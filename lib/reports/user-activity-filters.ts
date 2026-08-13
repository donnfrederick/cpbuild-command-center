import type { UserActivityRow } from "@/lib/reports/user-activity-types";

export type { ActivityCountSort as UserActivitySort } from "@/lib/reports/activity-count-shared";
export {
  maxActivityCount,
  sortActivityCountRows as sortUserActivityRows,
} from "@/lib/reports/activity-count-shared";

export function filterUserActivityRows(
  rows: UserActivityRow[],
  options: {
    search: string;
    roleCodes: string[];
  },
): UserActivityRow[] {
  let result = rows;

  if (options.roleCodes.length > 0) {
    const roleSet = new Set(options.roleCodes);
    result = result.filter((row) => roleSet.has(row.role));
  }

  const q = options.search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.role.toLowerCase().includes(q),
    );
  }

  return result;
}

export function uniqueRoleCodes(rows: UserActivityRow[]): string[] {
  const codes = new Set(rows.map((row) => row.role));
  return [...codes].sort((a, b) => a.localeCompare(b));
}

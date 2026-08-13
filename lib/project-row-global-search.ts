/**
 * Server-side "all columns" search for Field Tracker rows (`project_rows`).
 * Matches string fields and related lookup name/code (scope, location, cost, installer, UOM).
 */
import { Prisma } from "@prisma/client";

/** Max length for `?search=` on GET /api/projects/[id]/units — avoids pathological queries. */
export const PROJECT_ROW_GLOBAL_SEARCH_MAX_LEN = 200;

export function normalizeUnitsSearchQuery(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (t.length === 0) return "";
  return t.length > PROJECT_ROW_GLOBAL_SEARCH_MAX_LEN ? t.slice(0, PROJECT_ROW_GLOBAL_SEARCH_MAX_LEN) : t;
}

function fkNameOrCodeContains(
  rel: "scopeType" | "locationType" | "costType" | "installer" | "uom",
  q: string,
  mode: Prisma.QueryMode
): Prisma.ProjectRowWhereInput {
  return {
    [rel]: {
      is: {
        OR: [{ name: { contains: q, mode } }, { code: { contains: q, mode } }],
      },
    },
  } as Prisma.ProjectRowWhereInput;
}

/**
 * `OR` clause across searchable scalar + FK columns. Empty string → `{}` (caller merges with projectId).
 */
export function buildProjectRowGlobalSearchWhere(q: string): Prisma.ProjectRowWhereInput {
  if (!q) return {};
  const mode = Prisma.QueryMode.insensitive;
  return {
    OR: [
      { building: { contains: q, mode } },
      { level: { contains: q, mode } },
      { unit: { contains: q, mode } },
      { area: { contains: q, mode } },
      { shipPhase: { contains: q, mode } },
      { buildPhase: { contains: q, mode } },
      { scheme: { contains: q, mode } },
      { unitType: { contains: q, mode } },
      { description: { contains: q, mode } },
      { csiPrimeCode: { contains: q, mode } },
      { csiDetailCode: { contains: q, mode } },
      fkNameOrCodeContains("scopeType", q, mode),
      fkNameOrCodeContains("locationType", q, mode),
      fkNameOrCodeContains("costType", q, mode),
      fkNameOrCodeContains("installer", q, mode),
      fkNameOrCodeContains("uom", q, mode),
    ],
  };
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "name" in v && "code" in v) {
    const o = v as { name?: string; code?: string };
    return String(o.name ?? o.code ?? "");
  }
  if (typeof v === "number") return String(v);
  return String(v);
}

/** In-memory filter for tour demo rows (shape matches API JSON, nullable fields allowed). */
export function tourDemoRowMatchesGlobalSearch(q: string, row: Record<string, unknown>): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const cols = [
    "building",
    "level",
    "unit",
    "area",
    "shipPhase",
    "buildPhase",
    "scheme",
    "unitType",
    "description",
    "csiPrimeCode",
    "csiDetailCode",
    "scopeType",
    "locationType",
    "costType",
    "installer",
    "uom",
    "qty",
    "unitRate",
    "budgetedManHours",
    "startDate",
    "finishDate",
    "percentComplete",
    "actualManHours",
  ] as const;
  return cols.some((col) => cellStr(row[col]).toLowerCase().includes(query));
}

import { db } from "@/lib/db";
import { resolveSubcontractorLabelFromLookup } from "@/lib/subcontractor-display";
import { getSubcontractorNameLookup } from "@/lib/unifier/subcontractors";
import { unitDedupeKey, unitLocationKey } from "@/lib/field-daily-report/unit-entry-target";
import type {
  FieldDailyReportProjectSnapshot,
  FieldDailyReportStatusGroup,
  FieldDailyReportStatusUnitEntry,
  FieldDailyReportSubcontractorGroup,
} from "@/lib/field-daily-report/types";

export { unitDedupeKey, unitLocationKey } from "@/lib/field-daily-report/unit-entry-target";

/** Canonical stored label when a unit has no assigned subcontractor. */
export const UNASSIGNED_SUBCONTRACTOR_LABEL = "Unassigned";

/** Group status-update units by assigned subcontractor (pure — for tests). */
export function buildTeamsOnSiteRollup(
  statusGroups: FieldDailyReportStatusGroup[],
  options?: { unassignedLabel?: string },
): { summaryGroups: FieldDailyReportSubcontractorGroup[] } {
  const unassignedLabel = options?.unassignedLabel ?? "Unassigned";
  const teamsMap = new Map<string, Map<string, FieldDailyReportStatusUnitEntry>>();
  let idx = 0;

  for (const group of statusGroups) {
    for (const entry of group.unitEntries ?? []) {
      const label = entry.subcontractorLabel?.trim() || unassignedLabel;
      const bucket = teamsMap.get(label) ?? new Map<string, FieldDailyReportStatusUnitEntry>();
      const key = unitDedupeKey(entry);
      if (!bucket.has(key)) bucket.set(key, entry);
      teamsMap.set(label, bucket);
    }
  }

  const summaryGroups = [...teamsMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subcontractorLabel, unitMap]) => ({
      id: `team-${idx++}`,
      subcontractorLabel,
      unitEntries: [...unitMap.values()],
      sourceActivityLogIds: [
        ...new Set([...unitMap.values()].flatMap((u) => u.activityLogIds)),
      ],
    }));

  return { summaryGroups };
}

/** Attach subcontractor labels to status-update unit entries (for per-unit pills in Status updates). */
export async function enrichSnapshotTeamsOnSite(
  projectId: string,
  snapshot: FieldDailyReportProjectSnapshot,
): Promise<FieldDailyReportProjectSnapshot> {
  const statusGroups = snapshot.statusUpdates.summaryGroups;
  if (statusGroups.length === 0) {
    return { ...snapshot, teamsOnSite: { summaryGroups: [] } };
  }

  const entries = statusGroups.flatMap((g) => g.unitEntries ?? []);
  const rowIds = [
    ...new Set(
      entries
        .map((e) => e.rowId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const locationLookups = entries
    .filter((e) => !e.rowId && (e.building || e.level || e.unit))
    .map((e) => ({
      building: e.building ?? "",
      level: e.level ?? "",
      unit: e.unit ?? "",
    }));

  const orClauses: Array<Record<string, unknown>> = [];
  if (rowIds.length > 0) orClauses.push({ id: { in: rowIds } });
  for (const loc of locationLookups) {
    orClauses.push({
      building: loc.building,
      level: loc.level,
      unit: loc.unit,
    });
  }

  const rows =
    orClauses.length > 0
      ? await db.projectRow.findMany({
          where: {
            projectId,
            OR: orClauses,
          },
          select: { id: true, building: true, level: true, unit: true, unifierSubId: true },
        })
      : [];

  const rowById = new Map(rows.map((r) => [r.id, r] as const));
  const rowByLocation = new Map<string, (typeof rows)[number]>(
    rows.map((r) => [`${r.building}|${r.level}|${r.unit}`, r]),
  );

  const nameBySubId = await getSubcontractorNameLookup().catch(() => new Map<string, string>());

  const labelForEntry = (entry: FieldDailyReportStatusUnitEntry): string => {
    const row = entry.rowId
      ? rowById.get(entry.rowId)
      : rowByLocation.get(unitLocationKey(entry));
    return (
      resolveSubcontractorLabelFromLookup(row?.unifierSubId ?? null, nameBySubId) ??
      UNASSIGNED_SUBCONTRACTOR_LABEL
    );
  };

  const enrichedStatusGroups = statusGroups.map((group) => ({
    ...group,
    unitEntries: (group.unitEntries ?? []).map((entry) => ({
      ...entry,
      subcontractorLabel: labelForEntry(entry),
    })),
  }));

  return {
    ...snapshot,
    statusUpdates: {
      ...snapshot.statusUpdates,
      summaryGroups: enrichedStatusGroups,
    },
    teamsOnSite: { summaryGroups: [] },
  };
}

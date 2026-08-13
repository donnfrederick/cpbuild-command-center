import { ActivityEventType } from "@prisma/client";
import { buildActivityEventDescription } from "@/lib/activity-event-summary";
import { isSubcontractorActivityEvent } from "@/lib/activity-event-display";
import {
  formatBulkStatusLocationSummary,
  formatFieldDailyLocationLabel,
  extractLocationParts,
} from "@/lib/field-daily-report/location-label";
import { combinedOptionDisplay } from "@/lib/scope-combined-options";
import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";
import type {
  FieldDailyReportInspectionGroup,
  FieldDailyReportListedItem,
  FieldDailyReportProgressSnapshot,
  FieldDailyReportProjectSnapshot,
  FieldDailyReportStatusGroup,
  FieldDailyReportStatusSourceEvent,
  FieldDailyReportStatusUnitEntry,
  FieldDailyReportSubcontractorGroup,
} from "@/lib/field-daily-report/types";
import { dedupeInspectionEventsForFieldDaily } from "@/lib/field-daily-report/dedupe-inspection-events";
import { dedupeInspectionListedItems } from "@/lib/field-daily-report/dedupe-inspection-listed-items";
import {
  FIELD_DAILY_INSPECTION_EVENT_TYPES,
  FIELD_DAILY_ISSUE_EVENT_TYPES,
  FIELD_DAILY_OBSERVATION_EVENT_TYPES,
  FIELD_DAILY_STATUS_EVENT_TYPES,
} from "@/lib/field-daily-report/event-sets";

export interface ActivityLogRow {
  id: string;
  eventType: ActivityEventType;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

function formatDestLabel(stage: unknown, status: unknown): string {
  if (!stage && !status) return "Status updated";
  if (!stage || !status) return [stage, status].filter(Boolean).join(" / ") as string;
  return combinedOptionDisplay(stage as ScopeStage, status as ScopeStatus).label;
}

function unitEntryFromMetadata(
  metadata: Record<string, unknown>,
  activityLogId: string,
): FieldDailyReportStatusUnitEntry {
  const scopeName = String(metadata.scopeName ?? "").trim() || undefined;
  const { building, level, unit } = extractLocationParts(metadata);
  return {
    locationLabel: formatFieldDailyLocationLabel(metadata, { omitScope: true }) || "Project level",
    building,
    level,
    unit,
    scopeName,
    rowId: typeof metadata.rowId === "string" ? metadata.rowId : undefined,
    activityLogIds: [activityLogId],
  };
}

function unitEntriesFromBulkRefs(
  metadata: Record<string, unknown>,
  activityLogId: string,
): FieldDailyReportStatusUnitEntry[] {
  const refs = metadata.unitRefs;
  const scopeName = String(metadata.scopeName ?? "").trim() || undefined;

  if (Array.isArray(refs) && refs.length > 0) {
    return refs.map((ref) => {
      if (ref && typeof ref === "object") {
        const r = ref as Record<string, unknown>;
        const parts = {
          building: String(r.building ?? "").trim() || undefined,
          level: String(r.level ?? "").trim() || undefined,
          unit: String(r.unit ?? "").trim() || undefined,
        };
        const segments: string[] = [];
        if (parts.building) segments.push(`Bldg ${parts.building}`);
        if (parts.level) segments.push(`L${parts.level}`);
        if (parts.unit) segments.push(`Unit ${parts.unit}`);
        return {
          locationLabel: segments.join(" · ") || "Project level",
          building: parts.building,
          level: parts.level,
          unit: parts.unit,
          scopeName,
          activityLogIds: [activityLogId],
        };
      }
      return unitEntryFromMetadata(metadata, activityLogId);
    });
  }

  const summary = formatBulkStatusLocationSummary(metadata);
  if (summary) {
    return [{ locationLabel: summary, scopeName, activityLogIds: [activityLogId] }];
  }

  return [unitEntryFromMetadata(metadata, activityLogId)];
}

function resolveStatusGroupLabel(event: ActivityLogRow): string {
  const m = event.metadata;

  if (event.eventType === ActivityEventType.SUB_SCOPE_INSTANCE_UPDATED) {
    return formatDestLabel(m.toStage, m.toStatus);
  }
  if (event.eventType === ActivityEventType.SCOPE_STATUS_BULK_UNDONE) {
    return formatDestLabel(m.fromStage ?? m.scopeStage, m.fromStatus ?? m.scopeStatus) || "Status reverted";
  }
  if (event.eventType === ActivityEventType.SCOPE_STATUS_BULK_UPDATED) {
    return formatDestLabel(m.scopeStage, m.scopeStatus);
  }
  return formatDestLabel(m.toStage ?? m.scopeStage, m.toStatus ?? m.scopeStatus);
}

function resolveScopeStageStatus(event: ActivityLogRow): { stage?: string; status?: string } {
  const m = event.metadata;
  if (event.eventType === ActivityEventType.SCOPE_STATUS_BULK_UPDATED) {
    return { stage: String(m.scopeStage ?? ""), status: String(m.scopeStatus ?? "") };
  }
  if (event.eventType === ActivityEventType.SCOPE_STATUS_BULK_UNDONE) {
    return {
      stage: String(m.fromStage ?? m.scopeStage ?? ""),
      status: String(m.fromStatus ?? m.scopeStatus ?? ""),
    };
  }
  return {
    stage: String(m.toStage ?? m.scopeStage ?? ""),
    status: String(m.toStatus ?? m.scopeStatus ?? ""),
  };
}

function appendToStatusGroup(
  groups: Map<string, FieldDailyReportStatusGroup>,
  statusLabel: string,
  unitEntries: FieldDailyReportStatusUnitEntry[],
  activityLogId: string,
  groupIndex: { value: number },
  scope?: { stage?: string; status?: string },
): void {
  const key = statusLabel;
  const existing = groups.get(key);
  if (existing) {
    existing.unitEntries.push(...unitEntries);
    if (!existing.sourceActivityLogIds.includes(activityLogId)) {
      existing.sourceActivityLogIds.push(activityLogId);
    }
    return;
  }

  groups.set(key, {
    id: `status-${groupIndex.value++}`,
    statusLabel,
    scopeStage: scope?.stage || undefined,
    scopeStatus: scope?.status || undefined,
    headline: statusLabel,
    unitEntries: [...unitEntries],
    sourceActivityLogIds: [activityLogId],
  });
}

function metadataRecord(metadata: unknown): Record<string, unknown> {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function isInstallComplete(stage: unknown, status: unknown): boolean {
  return stage === "INSTALL" && status === "COMPLETE";
}

/** Count individual unit status changes — bulk events count each unit in the batch. */
export function countStatusChangeUnitsForEvent(event: ActivityLogRow): number {
  if (!FIELD_DAILY_STATUS_EVENT_TYPES.includes(event.eventType)) return 0;

  const m = event.metadata;
  if (
    event.eventType === ActivityEventType.SCOPE_STATUS_BULK_UPDATED ||
    event.eventType === ActivityEventType.SCOPE_STATUS_BULK_UNDONE
  ) {
    const refs = m.unitRefs;
    if (Array.isArray(refs) && refs.length > 0) return refs.length;
    const count = Number(m.count);
    if (Number.isFinite(count) && count > 0) return count;
    return 1;
  }

  return 1;
}

export function countStatusChangeUnitsForEvents(events: ActivityLogRow[]): number {
  return events.reduce((sum, event) => sum + countStatusChangeUnitsForEvent(event), 0);
}

/** Net unit-scopes that moved to or from Install Complete-Verified on the report day. */
export function countInstallCompleteVerifiedUnitDeltaForEvent(event: ActivityLogRow): number {
  if (!FIELD_DAILY_STATUS_EVENT_TYPES.includes(event.eventType)) return 0;

  const units = countStatusChangeUnitsForEvent(event);
  const m = event.metadata;

  if (event.eventType === ActivityEventType.SCOPE_STATUS_BULK_UPDATED) {
    return isInstallComplete(m.scopeStage, m.scopeStatus) ? units : 0;
  }

  if (event.eventType === ActivityEventType.SCOPE_STATUS_BULK_UNDONE) {
    const stage = m.fromStage ?? m.scopeStage;
    const status = m.fromStatus ?? m.scopeStatus;
    return isInstallComplete(stage, status) ? -units : 0;
  }

  const toStage = m.toStage ?? m.scopeStage;
  const toStatus = m.toStatus ?? m.scopeStatus;
  const fromStage = m.fromStage;
  const fromStatus = m.fromStatus;
  const toComplete = isInstallComplete(toStage, toStatus);
  const fromComplete =
    fromStage != null && fromStatus != null && isInstallComplete(fromStage, fromStatus);

  if (toComplete && !fromComplete) return units;
  if (fromComplete && !toComplete) return -units;
  return 0;
}

export function countInstallCompleteVerifiedUnitDelta(events: ActivityLogRow[]): number {
  return events.reduce((sum, event) => sum + countInstallCompleteVerifiedUnitDeltaForEvent(event), 0);
}

function issueActionLabel(eventType: ActivityEventType): string {
  switch (eventType) {
    case ActivityEventType.ISSUE_CREATED:
    case ActivityEventType.ISSUE_BULK_CREATED:
      return "Reported";
    case ActivityEventType.ISSUE_RESOLVED:
      return "Resolved";
    case ActivityEventType.ISSUE_REOPENED:
      return "Reopened";
    case ActivityEventType.ISSUE_UPDATED:
      return "Updated";
    default:
      return "Issue";
  }
}

function observationActionLabel(eventType: ActivityEventType): string {
  switch (eventType) {
    case ActivityEventType.OBSERVATION_CREATED:
    case ActivityEventType.OBSERVATION_BULK_CREATED:
      return "Logged";
    case ActivityEventType.OBSERVATION_UPDATED:
      return "Updated";
    default:
      return "Observation";
  }
}

function scopeDetailSubline(m: Record<string, unknown>): string | undefined {
  const scope = String(m.scopeName ?? "").trim();
  const location = formatFieldDailyLocationLabel(m);
  if (!scope) return undefined;
  if (location.includes(scope)) return undefined;
  return scope;
}

export function buildStatusRollup(events: ActivityLogRow[]): {
  summaryGroups: FieldDailyReportStatusGroup[];
  sourceEvents: FieldDailyReportStatusSourceEvent[];
} {
  const statusEvents = events.filter((e) => FIELD_DAILY_STATUS_EVENT_TYPES.includes(e.eventType));

  const sourceEvents: FieldDailyReportStatusSourceEvent[] = statusEvents.map((e) => ({
    activityLogId: e.id,
    createdAt: e.createdAt.toISOString(),
    description: buildActivityEventDescription({
      eventType: e.eventType,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
    }),
    locationLabel: formatFieldDailyLocationLabel(e.metadata),
  }));

  const groups = new Map<string, FieldDailyReportStatusGroup>();
  const groupIndex = { value: 0 };

  for (const event of statusEvents) {
    const statusLabel = resolveStatusGroupLabel(event);
    const unitEntries =
      event.eventType === ActivityEventType.SCOPE_STATUS_BULK_UPDATED ||
      event.eventType === ActivityEventType.SCOPE_STATUS_BULK_UNDONE
        ? unitEntriesFromBulkRefs(event.metadata, event.id)
        : [unitEntryFromMetadata(event.metadata, event.id)];

    appendToStatusGroup(groups, statusLabel, unitEntries, event.id, groupIndex, resolveScopeStageStatus(event));
  }

  return { summaryGroups: [...groups.values()], sourceEvents };
}

function resolveSubcontractorGroupLabel(metadata: Record<string, unknown>): string {
  const to = metadata.toUnifierSubId;
  if (to === null || to === "" || to === undefined) {
    return "Subcontractor cleared";
  }
  const name = String(metadata.subcontractorName ?? "").trim();
  if (name && name !== "Unassigned") return name;
  return "Subcontractor assigned";
}

function appendToSubcontractorGroup(
  groups: Map<string, FieldDailyReportSubcontractorGroup>,
  subcontractorLabel: string,
  unitEntry: FieldDailyReportStatusUnitEntry,
  activityLogId: string,
  groupIndex: { value: number },
): void {
  const existing = groups.get(subcontractorLabel);
  if (existing) {
    existing.unitEntries.push(unitEntry);
    if (!existing.sourceActivityLogIds.includes(activityLogId)) {
      existing.sourceActivityLogIds.push(activityLogId);
    }
    return;
  }

  groups.set(subcontractorLabel, {
    id: `sub-${groupIndex.value++}`,
    subcontractorLabel,
    unitEntries: [unitEntry],
    sourceActivityLogIds: [activityLogId],
  });
}

export function buildSubcontractorRollup(events: ActivityLogRow[]): {
  summaryGroups: FieldDailyReportSubcontractorGroup[];
} {
  const groups = new Map<string, FieldDailyReportSubcontractorGroup>();
  const groupIndex = { value: 0 };

  for (const event of events) {
    if (!isSubcontractorActivityEvent(event.eventType, event.metadata)) continue;
    const label = resolveSubcontractorGroupLabel(event.metadata);
    const unitEntry = unitEntryFromMetadata(event.metadata, event.id);
    appendToSubcontractorGroup(groups, label, unitEntry, event.id, groupIndex);
  }

  return { summaryGroups: [...groups.values()] };
}

export function buildInspectionRollup(items: FieldDailyReportListedItem[]): {
  summaryGroups: FieldDailyReportInspectionGroup[];
} {
  const bucket = new Map<string, FieldDailyReportListedItem[]>();
  for (const item of items) {
    const outcome = (item.badge ?? "UNKNOWN").toUpperCase();
    const list = bucket.get(outcome) ?? [];
    list.push(item);
    bucket.set(outcome, list);
  }

  let idx = 0;
  return {
    summaryGroups: [...bucket.entries()].map(([outcome, groupItems]) => ({
      id: `insp-${idx++}`,
      outcome,
      items: dedupeInspectionListedItems(groupItems),
    })),
  };
}

function buildListedItems(
  events: ActivityLogRow[],
  kind: "inspection" | "issue" | "observation",
): FieldDailyReportListedItem[] {
  return events.map((event) => {
    const m = event.metadata;
    const locationLabel = formatFieldDailyLocationLabel(m);
    const subline = scopeDetailSubline(m);
    if (kind === "inspection") {
      if (event.eventType === ActivityEventType.SCOPE_INSPECTION_UPDATED) {
        const toStatus = String(m.toInspectionStatus ?? "").trim();
        const fromStatus = String(m.fromInspectionStatus ?? "").trim();
        const headline = toStatus
          ? `Inspection → ${toStatus}`
          : fromStatus
            ? `Inspection updated (${fromStatus})`
            : "Inspection updated";
        return {
          itemKey: event.id,
          activityLogId: event.id,
          createdAt: event.createdAt.toISOString(),
          headline,
          locationLabel,
          subline,
          badge: toStatus || undefined,
        };
      }
      if (event.eventType === ActivityEventType.SCOPE_INSPECTION_BULK_UPDATED) {
        const count = Number(m.count) || 0;
        const status = String(m.inspectionStatus ?? "").trim() || "updated";
        return {
          itemKey: event.id,
          activityLogId: event.id,
          createdAt: event.createdAt.toISOString(),
          headline: `Bulk inspection → ${status}`,
          locationLabel: count > 0 ? `${count} units` : locationLabel,
          subline,
          badge: status,
        };
      }
      const formName = String(m.formName ?? "Inspection");
      const outcome = String(m.outcome ?? "").trim();
      return {
        itemKey: event.id,
        activityLogId: event.id,
        createdAt: event.createdAt.toISOString(),
        headline: formName,
        locationLabel,
        subline,
        badge: outcome || undefined,
        submissionId: typeof m.submissionId === "string" ? m.submissionId : undefined,
        entityId: typeof m.submissionId === "string" ? m.submissionId : undefined,
      };
    }
    if (kind === "issue") {
      const desc = String(m.shortDescription ?? "Issue");
      const issueType = String(m.issueType ?? "").trim();
      const blocking = m.isBlockingWork ? "Blocking" : undefined;
      const typeLabel = issueType ? issueType.replace(/_/g, " ") : undefined;
      return {
        itemKey: event.id,
        activityLogId: event.id,
        createdAt: event.createdAt.toISOString(),
        headline: desc,
        locationLabel,
        subline: [issueActionLabel(event.eventType), typeLabel, subline].filter(Boolean).join(" · "),
        badge: blocking,
        issueId: typeof m.issueId === "string" ? m.issueId : undefined,
        entityId: typeof m.issueId === "string" ? m.issueId : undefined,
      };
    }
    const title = String(m.title ?? m.shortDescription ?? "Observation");
    const observationType = String(m.observationType ?? "").trim();
    const typeLabel = observationType ? observationType.replace(/_/g, " ") : undefined;
    return {
      itemKey: event.id,
      activityLogId: event.id,
      createdAt: event.createdAt.toISOString(),
      headline: title,
      locationLabel,
      subline: [observationActionLabel(event.eventType), typeLabel].filter(Boolean).join(" · "),
      observationId: typeof m.observationId === "string" ? m.observationId : undefined,
      entityId: typeof m.observationId === "string" ? m.observationId : undefined,
    };
  });
}

function buildProgress(events: ActivityLogRow[]): FieldDailyReportProgressSnapshot {
  let installCompleteCount = 0;
  let installCompleteQtyToday = 0;
  for (const e of events) {
    if (!FIELD_DAILY_STATUS_EVENT_TYPES.includes(e.eventType)) continue;
    const m = e.metadata;
    if (e.eventType === ActivityEventType.SCOPE_STATUS_BULK_UPDATED) {
      const count = Number(m.count) || 0;
      if (isInstallComplete(m.scopeStage, m.scopeStatus)) {
        installCompleteCount += 1;
        installCompleteQtyToday += count;
      }
      continue;
    }
    const stage = m.toStage ?? m.scopeStage;
    const status = m.toStatus ?? m.scopeStatus;
    if (isInstallComplete(stage, status)) {
      installCompleteCount += 1;
      const qty = Number(m.qty);
      installCompleteQtyToday += Number.isFinite(qty) && qty > 0 ? qty : 1;
    }
  }

  return {
    statusChangeCount: countStatusChangeUnitsForEvents(events),
    installCompleteCount,
    installCompleteQtyToday,
    installCompleteVerifiedUnitDelta: countInstallCompleteVerifiedUnitDelta(events),
    inspectionSubmittedCount: dedupeInspectionEventsForFieldDaily(
      events.filter((e) => FIELD_DAILY_INSPECTION_EVENT_TYPES.includes(e.eventType)),
    ).length,
    issuesCreatedCount: events.filter(
      (e) =>
        e.eventType === ActivityEventType.ISSUE_CREATED ||
        e.eventType === ActivityEventType.ISSUE_BULK_CREATED,
    ).length,
    issuesResolvedCount: events.filter((e) => e.eventType === ActivityEventType.ISSUE_RESOLVED).length,
    observationsCreatedCount: events.filter(
      (e) =>
        e.eventType === ActivityEventType.OBSERVATION_CREATED ||
        e.eventType === ActivityEventType.OBSERVATION_BULK_CREATED,
    ).length,
  };
}

export function buildProjectSnapshot(events: ActivityLogRow[]): FieldDailyReportProjectSnapshot {
  const statusEvents = events.filter((e) => FIELD_DAILY_STATUS_EVENT_TYPES.includes(e.eventType));
  const subcontractorEvents = events.filter((e) => isSubcontractorActivityEvent(e.eventType, e.metadata));
  const inspectionEvents = dedupeInspectionEventsForFieldDaily(
    events.filter((e) => FIELD_DAILY_INSPECTION_EVENT_TYPES.includes(e.eventType)),
  );
  const issueEvents = events.filter((e) => FIELD_DAILY_ISSUE_EVENT_TYPES.includes(e.eventType));
  const observationEvents = events.filter((e) =>
    FIELD_DAILY_OBSERVATION_EVENT_TYPES.includes(e.eventType),
  );

  const statusUpdates = buildStatusRollup(statusEvents);
  const subcontractors = buildSubcontractorRollup(subcontractorEvents);
  const inspectionItems = buildListedItems(inspectionEvents, "inspection");
  const inspections = buildInspectionRollup(inspectionItems);

  return {
    progress: buildProgress(events),
    statusUpdates,
    subcontractors,
    teamsOnSite: { summaryGroups: [] },
    inspections,
    issues: { items: buildListedItems(issueEvents, "issue") },
    observations: { items: buildListedItems(observationEvents, "observation") },
  };
}

export function parseActivityLogRows(
  rows: { id: string; eventType: ActivityEventType; metadata: unknown; createdAt: Date }[],
): ActivityLogRow[] {
  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    metadata: metadataRecord(r.metadata),
    createdAt: r.createdAt,
  }));
}

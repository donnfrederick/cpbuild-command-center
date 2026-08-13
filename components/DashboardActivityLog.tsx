"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRightLeft,
  Package2,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Users,
  ClipboardCheck,
  Eye,
  X,
  MapPin,
  Filter,
  FileDown,
  ShieldAlert,
  FolderKanban,
  ExternalLink,
  Pencil,
  FlaskConical,
  Copy,
  Database,
  Search,
  Camera,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SearchInput } from "@/components/shared/SearchInput";
import { ActivityListCountSummary } from "@/components/shared/ActivityListCountSummary";
import { ActivityMediaStrip } from "@/components/shared/ActivityMediaStrip";
import { ActivityLocationSection } from "@/components/shared/ActivityLocationSection";
import { ActivityLocationOutcomeFilterSection } from "@/components/shared/ActivityLocationOutcomeFilterSection";
import type { SerializedActivityLocation } from "@/lib/activity/activity-location-schema";
import type { LocationOutcome } from "@/lib/activity/activity-location-schema";
import { locationOutcomeParam } from "@/lib/activity/activity-filter-location-outcomes";
import { ActivityHeatmapModal } from "@/components/reports/ActivityHeatmapModal";
import { shouldShowFilteredActivityCount } from "@/lib/activity-list-count-label";
import {
  FilterPanelFooterActions,
  FilterPanelSection,
  FilterPanelShell,
  FilterPill,
  FilterPillGroup,
  filterPanelInputClass,
} from "@/components/shared/filterPanel";
import { getPendingActivityEvents } from "@/lib/offline/pending-activity";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import {
  ACTIVITY_PENDING_SYNC_CHIP_STYLE,
  ACTIVITY_SYNC_FAILED_CHIP_STYLE,
  ACTIVITY_UNIT_CHIP_STYLE,
  getActivityEventColors,
} from "@/lib/activity-event-styles";
import { activityLocationChipParts } from "@/lib/activity-unit-chip";
import { buildActivityEventDescription } from "@/lib/activity-event-summary";
import { FILTERABLE_ACTIVITY_EVENT_TYPES } from "@/lib/activity-filter-event-types";
import {
  isInspectionSyncFailureEvent,
  isMutationSyncFailureEvent,
  isOfflineSyncFailureEvent,
} from "@/lib/activity/activity-sync-failure";
import { dedupeActivityEventsForDisplay } from "@/lib/activity/display-dedup";
import { prepareActivityFeedForDisplay } from "@/lib/activity/prepare-activity-feed";
import { InspectionSyncErrorDetailModal } from "@/components/projects/inspections/InspectionSyncErrorDetailModal";
import { ActivityOfflineReplayBadge } from "@/components/shared/ActivityOfflineReplayBadge";
import {
  syncedFromCacheBadgeLabel,
  syncedFromCacheBadgeTitle,
} from "@/lib/activity/offline-cache-duration-label";
import {
  isSubcontractorActivityEvent,
  subcontractorActivityBadgeForEvent,
} from "@/lib/activity-event-display";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityEventType =
  | "SCOPE_STATUS_UPDATED"
  | "SCOPE_STATUS_BULK_UPDATED"
  | "SCOPE_STATUS_BULK_UNDONE"
  | "SCOPE_INSPECTION_BULK_UPDATED"
  | "SCOPE_INSPECTION_UPDATED"
  | "ISSUE_CREATED"
  | "ISSUE_BULK_CREATED"
  | "ISSUE_UPDATED"
  | "ISSUE_DELETED"
  | "ISSUE_RESOLVED"
  | "ISSUE_REOPENED"
  | "CLEAR_INSPECTION_SET"
  | "CLEAR_INSPECTION_DELETED"
  | "INSPECTION_BACKFILL_SET"
  | "INSPECTION_BACKFILL_DELETED"
  | "INSPECTION_SUBMITTED"
  | "INSPECTION_SYNC_FAILED"
  | "MUTATION_SYNC_FAILED"
  | "OBSERVATION_CREATED"
  | "OBSERVATION_BULK_CREATED"
  | "OBSERVATION_UPDATED"
  | "UNIT_ROW_CREATED"
  | "UNIT_ROW_DELETED"
  | "UNIT_ROWS_BULK_DELETED"
  | "UNIT_INSTALLER_BULK_UPDATED"
  | "SCOPE_SUBCONTRACTOR_UPDATED"
  | "UPM_ROW_UPDATED"
  | "SUB_SCOPE_INSTANCE_UPDATED"
  | "FIELD_MEDIA_UPLOAD_RATE_LIMITED"
  | "PROJECT_CLONED_AS_TEST"
  | "PROJECT_TEST_DATA_SEEDED"
  | "PROJECT_TEST_DATA_BATCH_REMOVED"
  | "CUSTOM_SITE_LOCATION_CREATED"
  | "CUSTOM_SITE_LOCATION_DELETED"
  | "UNIT_PHOTO_UPLOADED"
  | "FIELD_DAILY_DAILY_MANPOWER_SET";

interface ActivityEvent {
  id: string;
  projectId: string;
  eventType: ActivityEventType;
  userId: string | null;
  userName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  activityLocation?: SerializedActivityLocation;
}

export interface DashboardProject {
  id: string;
  name: string;
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type DatePreset = "all" | "7d" | "14d" | "30d" | "custom";

interface DateRange {
  preset: DatePreset;
  customFrom: string;
  customTo: string;
}

interface DashboardFilters {
  eventTypes: ActivityEventType[];
  dateRange: DateRange;
  locationOutcomes: LocationOutcome[];
}

const EMPTY_FILTERS: DashboardFilters = {
  eventTypes: [],
  dateRange: { preset: "all", customFrom: "", customTo: "" },
  locationOutcomes: [],
};

function activeFilterCount(f: DashboardFilters, projectIds: string[]): number {
  let n = 0;
  if (f.eventTypes.length) n++;
  if (f.dateRange.preset !== "all") n++;
  if (projectIds.length > 0) n++;
  if (f.locationOutcomes.length) n++;
  return n;
}

function applyClientFilters(events: ActivityEvent[], f: DashboardFilters): ActivityEvent[] {
  if (f.eventTypes.length === 0) return events;
  return events.filter((e) => f.eventTypes.includes(e.eventType));
}

function presetToDateStrings(dr: DateRange): { from: string; to: string } {
  if (dr.preset === "all") return { from: "", to: "" };
  if (dr.preset === "custom") return { from: dr.customFrom, to: dr.customTo };
  const now = new Date();
  const days = dr.preset === "7d" ? 7 : dr.preset === "14d" ? 14 : 30;
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from: from.toISOString().split("T")[0], to: "" };
}

// ─── Event config ─────────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<
  ActivityEventType,
  { label: string; icon: React.ReactNode }
> = {
  SCOPE_STATUS_UPDATED: {
    label: "Status Updated",
    icon: <ArrowRightLeft size={14} />,
  },
  SCOPE_STATUS_BULK_UPDATED: {
    label: "Bulk Status Update",
    icon: <Package2 size={14} />,
  },
  SCOPE_STATUS_BULK_UNDONE: {
    label: "Bulk Status Undo",
    icon: <RotateCcw size={14} />,
  },
  SCOPE_INSPECTION_BULK_UPDATED: {
    label: "Bulk Inspection Update",
    icon: <ClipboardCheck size={14} />,
  },
  SCOPE_INSPECTION_UPDATED: {
    label: "Inspection Updated",
    icon: <ClipboardCheck size={14} />,
  },
  ISSUE_CREATED: {
    label: "Issue Reported",
    icon: <AlertTriangle size={14} />,
  },
  ISSUE_BULK_CREATED: {
    label: "Bulk Issues",
    icon: <Users size={14} />,
  },
  ISSUE_UPDATED: {
    label: "Issue Updated",
    icon: <Pencil size={14} />,
  },
  ISSUE_DELETED: {
    label: "Issue Deleted",
    icon: <X size={14} />,
  },
  ISSUE_RESOLVED: {
    label: "Issue Resolved",
    icon: <CheckCircle2 size={14} />,
  },
  ISSUE_REOPENED: {
    label: "Issue Reopened",
    icon: <RotateCcw size={14} />,
  },
  CLEAR_INSPECTION_SET: {
    label: "Inspection Set",
    icon: <ClipboardCheck size={14} />,
  },
  CLEAR_INSPECTION_DELETED: {
    label: "Inspection Deleted",
    icon: <X size={14} />,
  },
  INSPECTION_BACKFILL_SET: {
    label: "Inspection Backfilled",
    icon: <ClipboardCheck size={14} />,
  },
  INSPECTION_BACKFILL_DELETED: {
    label: "Backfill Removed",
    icon: <RotateCcw size={14} />,
  },
  INSPECTION_SUBMITTED: {
    label: "Inspection Submitted",
    icon: <ClipboardCheck size={14} />,
  },
  INSPECTION_SYNC_FAILED: {
    label: "Sync Failed",
    icon: <ClipboardCheck size={14} />,
  },
  MUTATION_SYNC_FAILED: {
    label: "Upload Failed",
    icon: <AlertTriangle size={14} />,
  },
  OBSERVATION_CREATED: {
    label: "Observation",
    icon: <Eye size={14} />,
  },
  OBSERVATION_BULK_CREATED: {
    label: "Bulk Observations",
    icon: <Users size={14} />,
  },
  OBSERVATION_UPDATED: {
    label: "Obs. Updated",
    icon: <Eye size={14} />,
  },
  UNIT_ROW_CREATED: {
    label: "Rows Added",
    icon: <Package2 size={14} />,
  },
  UNIT_ROW_DELETED: {
    label: "Row Deleted",
    icon: <X size={14} />,
  },
  UNIT_ROWS_BULK_DELETED: {
    label: "Rows Deleted",
    icon: <X size={14} />,
  },
  UNIT_INSTALLER_BULK_UPDATED: {
    label: "Installer Updated",
    icon: <Users size={14} />,
  },
  SCOPE_SUBCONTRACTOR_UPDATED: {
    label: "Subcontractor Updated",
    icon: <Users size={14} />,
  },
  UPM_ROW_UPDATED: {
    label: "Builder Updated",
    icon: <FolderKanban size={14} />,
  },
  SUB_SCOPE_INSTANCE_UPDATED: {
    label: "Sub-scope Updated",
    icon: <FolderKanban size={14} />,
  },
  FIELD_MEDIA_UPLOAD_RATE_LIMITED: {
    label: "Upload limit",
    icon: <ShieldAlert size={14} />,
  },
  PROJECT_CLONED_AS_TEST: {
    label: "Project Cloned as Test",
    icon: <Copy size={14} />,
  },
  PROJECT_TEST_DATA_SEEDED: {
    label: "Test Data Seeded",
    icon: <Database size={14} />,
  },
  PROJECT_TEST_DATA_BATCH_REMOVED: {
    label: "Test Data Batch Removed",
    icon: <Database size={14} />,
  },
  CUSTOM_SITE_LOCATION_CREATED: {
    label: "Custom Location Added",
    icon: <MapPin size={14} />,
  },
  CUSTOM_SITE_LOCATION_DELETED: {
    label: "Custom Location Removed",
    icon: <MapPin size={14} />,
  },
  UNIT_PHOTO_UPLOADED: {
    label: "Photo Uploaded",
    icon: <Camera size={14} />,
  },
  FIELD_DAILY_DAILY_MANPOWER_SET: {
    label: "Daily Manpower Set",
    icon: <Users size={14} />,
  },
};

const FALLBACK_EVENT_CONFIG = {
  label: "Activity",
  icon: <FolderKanban size={14} />,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLocationLabel(event: ActivityEvent): string | null {
  const m = event.metadata;
  switch (event.eventType) {
    case "SCOPE_STATUS_UPDATED":
    case "SCOPE_INSPECTION_UPDATED":
    case "CLEAR_INSPECTION_SET":
    case "CLEAR_INSPECTION_DELETED":
    case "INSPECTION_BACKFILL_SET":
    case "INSPECTION_BACKFILL_DELETED":
    case "INSPECTION_SUBMITTED":
    case "INSPECTION_SYNC_FAILED":
    case "MUTATION_SYNC_FAILED":
    case "SCOPE_SUBCONTRACTOR_UPDATED":
    case "UNIT_ROW_DELETED":
    case "UPM_ROW_UPDATED":
    case "SUB_SCOPE_INSTANCE_UPDATED":
    case "UNIT_PHOTO_UPLOADED": {
      const chip = activityLocationChipParts(m);
      if (chip.length) return chip.join(" · ");
      const parts = [m.building, m.level, m.unit].filter(Boolean) as string[];
      return parts.length ? parts.join(" · ") : null;
    }
    case "ISSUE_CREATED":
    case "ISSUE_UPDATED":
    case "ISSUE_DELETED":
    case "ISSUE_RESOLVED":
    case "ISSUE_REOPENED":
    case "OBSERVATION_CREATED":
    case "OBSERVATION_UPDATED": {
      const ref = m.unitRef as string | null;
      if (!ref) return null;
      return ref.replace(/\|/g, " · ");
    }
    case "SCOPE_STATUS_BULK_UPDATED":
    case "SCOPE_STATUS_BULK_UNDONE":
    case "SCOPE_INSPECTION_BULK_UPDATED":
    case "ISSUE_BULK_CREATED":
    case "OBSERVATION_BULK_CREATED":
    case "UNIT_ROW_CREATED":
    case "UNIT_ROWS_BULK_DELETED":
    case "UNIT_INSTALLER_BULK_UPDATED": {
      const count = m.count as number | undefined;
      return count != null ? `${count} scope${count !== 1 ? "s" : ""}` : null;
    }
    default:
      return null;
  }
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSearchableText(event: ActivityEvent, projectName: string): string {
  const m = event.metadata;
  return [
    buildActivityEventDescription({ ...event, createdAt: event.createdAt }),
    event.userName ?? "",
    (m.building as string) ?? "",
    (m.level as string) ?? "",
    (m.unit as string) ?? "",
    (m.scopeName as string) ?? "",
    ((m.unitRef as string) ?? "").replace(/\|/g, " "),
    (m.shortDescription as string) ?? "",
    projectName,
  ]
    .join(" ")
    .toLowerCase();
}

// ─── Dashboard Activity Card ──────────────────────────────────────────────────

function DashboardActivityCard({
  event,
  projectName,
  canViewLocationTracking = false,
}: {
  event: ActivityEvent;
  projectName: string;
  canViewLocationTracking?: boolean;
}) {
  const t = useTranslations("dashboardActivity");
  const tActivityLog = useTranslations("activityLog");
  const [syncErrorDetailOpen, setSyncErrorDetailOpen] = useState(false);
  const isSyncFailure = isOfflineSyncFailureEvent(event.eventType, event.metadata);
  const isMutationSyncFailure = isMutationSyncFailureEvent(event.eventType);
  const isCalibrationEvent =
    (event.eventType === "INSPECTION_SUBMITTED" || event.eventType === "INSPECTION_SYNC_FAILED") &&
    event.metadata.category === "CALIBRATION_INSPECTION";
  const eventMeta = isCalibrationEvent
    ? {
        label: isSyncFailure
          ? tActivityLog("eventTypeInspectionSyncFailed")
          : tActivityLog("eventTypeCalibrationInspection"),
        shortLabel: isSyncFailure ? tActivityLog("syncFailedBadge") : tActivityLog("calibrationBadge"),
        icon: <FlaskConical size={14} />,
      }
    : isMutationSyncFailure
      ? {
          label: tActivityLog("eventTypeMutationSyncFailed"),
          shortLabel: tActivityLog("syncFailedBadge"),
          icon: <AlertTriangle size={14} />,
        }
    : isInspectionSyncFailureEvent(event.eventType, event.metadata)
      ? {
          label: tActivityLog("eventTypeInspectionSyncFailed"),
          shortLabel: tActivityLog("syncFailedBadge"),
          icon: <ClipboardCheck size={14} />,
        }
      : (EVENT_CONFIG[event.eventType] ?? FALLBACK_EVENT_CONFIG);
  const cfg = {
    ...eventMeta,
    ...getActivityEventColors(event.eventType, {
      isCalibration: isCalibrationEvent && !isSyncFailure,
    }),
  };
  const subcontractorBadgeKind = isSubcontractorActivityEvent(event.eventType, event.metadata)
    ? subcontractorActivityBadgeForEvent(event.eventType, event.metadata)
    : null;
  const eventTypeLabel =
    subcontractorBadgeKind === "assigned"
      ? t("eventTypeScopeSubcontractorAssigned")
      : subcontractorBadgeKind === "cleared"
        ? t("eventTypeScopeSubcontractorCleared")
        : subcontractorBadgeKind === "updated"
          ? t("eventTypeScopeSubcontractorUpdated")
          : cfg.label;

  const summary = buildActivityEventDescription({ ...event, createdAt: event.createdAt });
  const locationLabel = getLocationLabel(event);
  const isPendingSync = Boolean(event.metadata.pendingSync);

  return (
    <>
    <div
      role={isSyncFailure ? "button" : undefined}
      tabIndex={isSyncFailure ? 0 : undefined}
      aria-label={isSyncFailure ? tActivityLog("syncErrorCardAria") : undefined}
      onClick={isSyncFailure ? () => setSyncErrorDetailOpen(true) : undefined}
      onKeyDown={
        isSyncFailure
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSyncErrorDetailOpen(true);
              }
            }
          : undefined
      }
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 16px",
        borderBottom: "1px solid var(--neutral-200)",
        alignItems: "flex-start",
        ...(isSyncFailure ? { cursor: "pointer" } : {}),
      }}
    >
      {/* Event type icon */}
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 32,
          height: 32,
          borderRadius: "50%",
          backgroundColor: cfg.bg,
          color: cfg.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        }}
      >
        {cfg.icon}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top row: unit chip first, then event type badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 5,
          }}
        >
          {locationLabel && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: ACTIVITY_UNIT_CHIP_STYLE.fontSize,
                fontWeight: ACTIVITY_UNIT_CHIP_STYLE.fontWeight,
                color: ACTIVITY_UNIT_CHIP_STYLE.color,
                backgroundColor: ACTIVITY_UNIT_CHIP_STYLE.backgroundColor,
                border: ACTIVITY_UNIT_CHIP_STYLE.border,
                borderRadius: ACTIVITY_UNIT_CHIP_STYLE.borderRadius,
                padding: ACTIVITY_UNIT_CHIP_STYLE.padding,
                flexShrink: 0,
              }}
            >
              <MapPin size={11} style={{ flexShrink: 0 }} />
              {locationLabel}
            </span>
          )}

          <span
            style={{
              display: "inline-block",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: cfg.color,
              backgroundColor: cfg.bg,
              borderRadius: 4,
              padding: "2px 6px",
              flexShrink: 0,
            }}
          >
            {eventTypeLabel}
          </span>

          {isSyncFailure && (
            <span
              style={{
                display: "inline-block",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: ACTIVITY_SYNC_FAILED_CHIP_STYLE.color,
                backgroundColor: ACTIVITY_SYNC_FAILED_CHIP_STYLE.backgroundColor,
                borderRadius: 4,
                padding: "2px 6px",
                flexShrink: 0,
              }}
            >
              {tActivityLog("syncFailedBadge")}
            </span>
          )}

          {isPendingSync && (
            <span
              style={{
                display: "inline-block",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: ACTIVITY_PENDING_SYNC_CHIP_STYLE.color,
                backgroundColor: ACTIVITY_PENDING_SYNC_CHIP_STYLE.backgroundColor,
                borderRadius: 4,
                padding: "2px 6px",
                flexShrink: 0,
              }}
            >
              {t("pendingSyncBadge")}
            </span>
          )}
          <ActivityOfflineReplayBadge
            metadata={event.metadata}
            label={syncedFromCacheBadgeLabel(event.metadata, event.createdAt, tActivityLog)}
            title={syncedFromCacheBadgeTitle(event.metadata, event.createdAt, tActivityLog)}
          />
        </div>

        {/* Summary */}
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--neutral-900)",
            lineHeight: 1.45,
            wordBreak: "break-word",
          }}
        >
          {summary}
        </p>

        <ActivityMediaStrip metadata={event.metadata} />

        {canViewLocationTracking ? (
          <ActivityLocationSection activityLocation={event.activityLocation} />
        ) : null}

        {/* Meta row: time · user · project pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "4px 8px",
            marginTop: 5,
          }}
        >
          <span
            style={{ fontSize: 11, color: "var(--neutral-500)" }}
            title={absoluteTime(event.createdAt)}
          >
            {relativeTime(event.createdAt)}
          </span>
          {event.userName && (
            <span style={{ fontSize: 11, color: "var(--neutral-500)" }}>
              · {event.userName}
            </span>
          )}
          {/* Project pill — links to that project's activity log */}
          <Link
            href={`/projects/${event.projectId}/log/activity` as `/projects/${string}/log/activity`}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
              color: "var(--neutral-700)",
              backgroundColor: "var(--neutral-100)",
              border: "1px solid var(--neutral-300)",
              borderRadius: 12,
              padding: "2px 8px 2px 6px",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <FolderKanban size={10} style={{ flexShrink: 0, color: "var(--neutral-500)" }} />
            {projectName}
            <ExternalLink size={9} style={{ flexShrink: 0, color: "var(--neutral-400)" }} />
          </Link>
          {/* Hidden accessible label for screen readers */}
          <span className="sr-only">{t("viewInProject")}</span>
        </div>
      </div>
    </div>
    {syncErrorDetailOpen && (
      <InspectionSyncErrorDetailModal
        metadata={event.metadata}
        createdAt={event.createdAt}
        eventType={event.eventType}
        onClose={() => setSyncErrorDetailOpen(false)}
      />
    )}
    </>
  );
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────

const FILTERABLE_EVENT_TYPES = [...FILTERABLE_ACTIVITY_EVENT_TYPES] as ActivityEventType[];

function DashboardFilterPanel({
  filters,
  selectedProjectIds,
  projects,
  onChange,
  onProjectsChange,
  onClose,
  onClear,
  canViewLocationTracking = false,
}: {
  filters: DashboardFilters;
  selectedProjectIds: string[];
  projects: DashboardProject[];
  onChange: (f: DashboardFilters) => void;
  onProjectsChange: (ids: string[]) => void;
  onClose: () => void;
  onClear: () => void;
  canViewLocationTracking?: boolean;
}) {
  const t = useTranslations("dashboardActivity");
  const tActivityLog = useTranslations("activityLog");
  const tHeatmap = useTranslations("activityHeatmap");
  const tCapture = useTranslations("captureMetadata");
  const toggle = <T extends string>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  const locationOutcomeLabel = (outcome: LocationOutcome): string => {
    if (outcome === "on_map") return tHeatmap("outcomeOnMap");
    if (outcome === "denied") return tCapture("locationNotRecordedDenied");
    if (outcome === "timeout") return tCapture("locationNotRecordedTimeout");
    if (outcome === "unavailable") return tCapture("locationNotRecordedUnavailable");
    if (outcome === "no_capture") return tHeatmap("outcomeNoCapture");
    return tHeatmap("outcomeLegacy");
  };

  const [projectSearch, setProjectSearch] = useState("");
  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  const selectedSet = useMemo(() => new Set(selectedProjectIds), [selectedProjectIds]);

  // "Select all" operates on the currently visible (filtered) set — this is
  // what users expect when a search is active; it only checks the matches.
  const selectAllVisible = () => {
    if (filteredProjects.length === 0) return;
    const next = new Set(selectedSet);
    for (const p of filteredProjects) next.add(p.id);
    onProjectsChange(Array.from(next));
  };

  const clearSelection = () => onProjectsChange([]);

  const DATE_PRESETS: { label: string; value: DatePreset }[] = [
    { label: t("dateAll"), value: "all" },
    { label: t("date7d"), value: "7d" },
    { label: t("date14d"), value: "14d" },
    { label: t("date30d"), value: "30d" },
    { label: t("dateCustom"), value: "custom" },
  ];

  const filterCount = activeFilterCount(filters, selectedProjectIds);

  return (
    <FilterPanelShell
      title={t("filterActivity")}
      closeAriaLabel={t("closeFilterPanel")}
      onClose={onClose}
      footer={(close) => (
        <FilterPanelFooterActions
          clearLabel={t("filterClearAll")}
          applyLabel={t("filterDone")}
          onClear={onClear}
          onApply={close}
          clearDisabled={filterCount === 0}
        />
      )}
    >
          {/* ── Project ── */}
          {projects.length > 1 && (
            <FilterPanelSection label={t("filterProject")}>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "flex-end",
                  margin: "-6px 0 10px",
                }}
              >
                <button
                  type="button"
                  onClick={selectAllVisible}
                  disabled={filteredProjects.length === 0}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color:
                      filteredProjects.length === 0
                        ? "var(--neutral-300)"
                        : "var(--primary-600)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: filteredProjects.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {t("filterProjectSelectAll")}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selectedProjectIds.length === 0}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color:
                      selectedProjectIds.length === 0
                        ? "var(--neutral-300)"
                        : "var(--neutral-600)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor:
                      selectedProjectIds.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {t("filterProjectClear")}
                </button>
              </div>

              <div style={{ position: "relative", marginBottom: 8 }}>
                <Search
                  size={13}
                  style={{
                    position: "absolute",
                    left: 9,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--neutral-400)",
                    pointerEvents: "none",
                  }}
                  aria-hidden
                />
                <input
                  type="search"
                  placeholder={t("filterProjectSearchPlaceholder")}
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  aria-label={t("filterProjectSearchPlaceholder")}
                  className={filterPanelInputClass}
                  style={{ paddingLeft: 28 }}
                />
              </div>

              {/* Checkbox list */}
              <div
                style={{
                  maxHeight: 220,
                  overflowY: "auto",
                  border: "1px solid var(--neutral-200)",
                  borderRadius: 8,
                }}
              >
                {filteredProjects.length === 0 ? (
                  <p
                    style={{
                      margin: 0,
                      padding: "14px 12px",
                      fontSize: 12,
                      color: "var(--neutral-500)",
                      textAlign: "center",
                    }}
                  >
                    {t("filterProjectNoMatches")}
                  </p>
                ) : (
                  filteredProjects.map((p) => {
                    const checked = selectedSet.has(p.id);
                    return (
                      <label
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 10px",
                          borderBottom: "1px solid var(--neutral-100)",
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            flexShrink: 0,
                            border: checked ? "none" : "1.5px solid var(--neutral-300)",
                            background: checked ? "var(--primary-600)" : "var(--neutral-0)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {checked && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path
                                d="M1 4L3.5 6.5L9 1"
                                stroke="white"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <FolderKanban
                          size={14}
                          style={{ flexShrink: 0, color: "var(--neutral-500)" }}
                          aria-hidden
                        />
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--neutral-800)",
                            fontWeight: checked ? 600 : 400,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                          }}
                        >
                          {p.name}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onProjectsChange(toggle(selectedProjectIds, p.id))}
                          style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
                          aria-label={p.name}
                        />
                      </label>
                    );
                  })
                )}
              </div>
            </FilterPanelSection>
          )}

          <FilterPanelSection label={t("filterDateRange")}>
            <FilterPillGroup>
              {DATE_PRESETS.map(({ label, value }) => (
                <FilterPill
                  key={value}
                  label={label}
                  active={filters.dateRange.preset === value}
                  onClick={() =>
                    onChange({
                      ...filters,
                      dateRange: { ...filters.dateRange, preset: value },
                    })
                  }
                />
              ))}
            </FilterPillGroup>
            {filters.dateRange.preset === "custom" && (
              <div className="filter-panel-field-grid" style={{ marginTop: 10 }}>
                <input
                  type="date"
                  className={filterPanelInputClass}
                  value={filters.dateRange.customFrom}
                  onChange={(e) =>
                    onChange({
                      ...filters,
                      dateRange: { ...filters.dateRange, customFrom: e.target.value },
                    })
                  }
                />
                <span style={{ color: "var(--neutral-400)", fontSize: 12, alignSelf: "center" }}>
                  {t("dateTo")}
                </span>
                <input
                  type="date"
                  className={filterPanelInputClass}
                  value={filters.dateRange.customTo}
                  onChange={(e) =>
                    onChange({
                      ...filters,
                      dateRange: { ...filters.dateRange, customTo: e.target.value },
                    })
                  }
                />
              </div>
            )}
          </FilterPanelSection>

          <FilterPanelSection label={t("filterEventType")}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {FILTERABLE_EVENT_TYPES.filter(
                (type): type is ActivityEventType => Boolean(type) && type in EVENT_CONFIG,
              ).map((type) => {
                const meta = EVENT_CONFIG[type];
                const cfg = { ...meta, ...getActivityEventColors(type) };
                const checked = filters.eventTypes.includes(type);
                return (
                  <label
                    key={type}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 4px",
                      borderBottom: "1px solid var(--neutral-100)",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        flexShrink: 0,
                        border: checked ? "none" : "1.5px solid var(--neutral-300)",
                        background: checked ? "var(--primary-600)" : "var(--neutral-0)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {checked && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="white"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: cfg.bg,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: cfg.color,
                      }}
                    >
                      {cfg.icon}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--neutral-800)",
                        fontWeight: checked ? 600 : 400,
                      }}
                    >
                      {cfg.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        onChange({
                          ...filters,
                          eventTypes: toggle(filters.eventTypes, type),
                        })
                      }
                      style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
                    />
                  </label>
                );
              })}
            </div>
          </FilterPanelSection>

          {canViewLocationTracking ? (
            <FilterPanelSection label={tActivityLog("gpsSection.filterSection")}>
              <ActivityLocationOutcomeFilterSection
                selected={filters.locationOutcomes}
                onChange={(locationOutcomes) => onChange({ ...filters, locationOutcomes })}
                outcomeLabel={locationOutcomeLabel}
              />
            </FilterPanelSection>
          ) : null}
    </FilterPanelShell>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface DashboardActivityLogProps {
  projects: DashboardProject[];
  /** When false, hides GPS blocks, GPS filters, and the activity heat map. */
  canViewLocationTracking?: boolean;
}

export function DashboardActivityLog({
  projects,
  canViewLocationTracking = false,
}: DashboardActivityLogProps) {
  const t = useTranslations("dashboardActivity");
  const tHeatmap = useTranslations("activityHeatmap");

  const projectNameMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exportStep, setExportStep] = useState<
    null | "generating" | "done" | "empty" | "error"
  >(null);
  const [exportFormat, setExportFormat] = useState<"pdf" | "xlsx" | null>(null);
  const [exportErrorMsg, setExportErrorMsg] = useState("");
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Export success timers call setState after a delay; clear them on unmount so
  // vitest teardown (window gone) never hits "window is not defined".
  const exportTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const exportCleanupsRef = useRef<Array<() => void>>([]);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      exportCleanupsRef.current.forEach((cleanup) => cleanup());
      exportCleanupsRef.current = [];
      exportTimersRef.current.forEach(clearTimeout);
      exportTimersRef.current = [];
    };
  }, []);

  const totalFilterCount = activeFilterCount(filters, selectedProjectIds);
  const hasActiveFilters = !!search || totalFilterCount > 0;

  // Join project IDs into a stable key for the useCallback/useEffect deps so
  // toggling the array identity doesn't refetch when the set hasn't changed.
  const projectIdsKey = useMemo(
    () => [...selectedProjectIds].sort().join(","),
    [selectedProjectIds]
  );

  const buildUrl = useCallback(
    (cursor?: string) => {
      const p = new URLSearchParams();
      if (projectIdsKey) p.set("projectIds", projectIdsKey);
      const { from: dateFrom, to: dateTo } = presetToDateStrings(filters.dateRange);
      if (dateFrom) {
        const [y, m, d] = dateFrom.split("-").map(Number);
        p.set("dateFrom", new Date(y, m - 1, d, 0, 0, 0, 0).toISOString());
      }
      if (dateTo) {
        const [y, m, d] = dateTo.split("-").map(Number);
        p.set("dateTo", new Date(y, m - 1, d, 23, 59, 59, 999).toISOString());
      }
      if (filters.eventTypes.length > 0) {
        p.set("eventType", filters.eventTypes.join(","));
      }
      if (canViewLocationTracking && filters.locationOutcomes.length > 0) {
        p.set("locationOutcome", locationOutcomeParam(filters.locationOutcomes));
      }
      if (cursor) p.set("cursor", cursor);
      return `/api/activity?${p.toString()}`;
    },
    [projectIdsKey, filters.dateRange, filters.eventTypes, filters.locationOutcomes, canViewLocationTracking]
  );

  // Merge search + eventType client-side filter
  const filteredEvents = useMemo(() => {
    let result = applyClientFilters(events, filters);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((e) =>
        getSearchableText(e, projectNameMap.get(e.projectId) ?? "").includes(q)
      );
    }
    return result;
  }, [events, filters, search, projectNameMap]);

  const displayTotal = totalCount ?? events.length;
  const activityCountLabel = shouldShowFilteredActivityCount({
    search,
    loadedCount: events.length,
    filteredCount: filteredEvents.length,
    totalCount: displayTotal,
  })
    ? t("eventCountFilteredSummary", { filtered: filteredEvents.length, total: displayTotal })
    : t("eventCountSummary", { count: displayTotal });

  // Fetch first page on mount and when server-side params change
  const fetchRef = useRef(0);
  useEffect(() => {
    const id = ++fetchRef.current;
    setLoading(true);
    setError(null);
    fetch(buildUrl())
      .then((r) => r.json())
      .then(async (data) => {
        if (id !== fetchRef.current) return;
        const pendingProjectIds = projectIdsKey ? projectIdsKey.split(",").filter(Boolean) : undefined;
        const pending = await getPendingActivityEvents({
          projectIds: pendingProjectIds,
        });
        if (id !== fetchRef.current) return;
        const serverEvents = ((data.events as ActivityEvent[]) ?? []);
        const displayEvents = prepareActivityFeedForDisplay(
          pending as ActivityEvent[],
          serverEvents,
        );
        const serverTotal = typeof data.totalCount === "number" ? data.totalCount : 0;
        setTotalCount(serverTotal);
        setEvents(displayEvents);
        setNextCursor((data.nextCursor as string | null) ?? null);
      })
      .catch(() => {
        if (id !== fetchRef.current) return;
        setError(t("error"));
      })
      .finally(() => {
        if (id !== fetchRef.current) return;
        setLoading(false);
      });
  }, [buildUrl, projectIdsKey, t]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(nextCursor));
      const data = await res.json() as { events: ActivityEvent[]; nextCursor: string | null };
      setEvents((prev) =>
        dedupeActivityEventsForDisplay([
          ...prev,
          ...(data.events ?? []),
        ]),
      );
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setSelectedProjectIds([]);
  };

  const handleProjectsChange = useCallback((ids: string[]) => {
    setSelectedProjectIds(ids);
  }, []);

  const handleExport = async (exportDateRange: DateRange, format: "pdf" | "xlsx") => {
    setExportFormat(format);
    setExportStep("generating");
    setExportErrorMsg("");
    try {
      const { from: dateFrom, to: dateTo } = presetToDateStrings(exportDateRange);

      // Human-readable filter summary for the PDF cover.
      const parts: string[] = [];
      if (exportDateRange.preset !== "all") {
        if (exportDateRange.preset === "custom") {
          parts.push(`${dateFrom || "—"} to ${dateTo || "present"}`);
        } else {
          parts.push(
            exportDateRange.preset === "7d"
              ? t("date7d")
              : exportDateRange.preset === "14d"
              ? t("date14d")
              : t("date30d")
          );
        }
      }
      if (filters.eventTypes.length > 0) {
        const typeLabels = filters.eventTypes.map(
          (type) => EVENT_CONFIG[type]?.label ?? type
        );
        parts.push(`${t("exportEventTypesLabel")}: ${typeLabels.join(", ")}`);
      }
      if (selectedProjectIds.length > 0) {
        const names = selectedProjectIds
          .map((id) => projectNameMap.get(id) ?? id)
          .join(", ");
        parts.push(`${t("exportProjectsLabel")}: ${names}`);
      }
      const filterSummary = parts.join(" · ");

      // Date constructor months are 0-indexed; split gives 1-indexed month.
      const toStartOfDay = (yyyyMmDd: string): string => {
        const [y, m, d] = yyyyMmDd.split("-").map(Number);
        return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
      };
      const toEndOfDay = (yyyyMmDd: string): string => {
        const [y, m, d] = yyyyMmDd.split("-").map(Number);
        return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
      };

      // Label for the cover title ("All Projects" / "<Name>" / "<N> projects").
      const scopeLabel =
        selectedProjectIds.length === 0
          ? t("exportScopeAll")
          : selectedProjectIds.length === 1
          ? projectNameMap.get(selectedProjectIds[0]) ?? selectedProjectIds[0]
          : t("filterProjectCount", { count: selectedProjectIds.length });

      const body = {
        eventTypes: filters.eventTypes,
        locationOutcomes:
          canViewLocationTracking && filters.locationOutcomes.length > 0
            ? filters.locationOutcomes
            : undefined,
        projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
        ...(dateFrom ? { dateFrom: toStartOfDay(dateFrom) } : {}),
        ...(dateTo ? { dateTo: toEndOfDay(dateTo) } : {}),
        scopeLabel,
        filterSummary,
      };

      const exportPath = format === "pdf" ? "export-pdf" : "export-xlsx";
      const res = await fetch(`/api/activity/${exportPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!isMountedRef.current) return;

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (!isMountedRef.current) return;
        const msg = formatPdfExportErrorToast(errBody, t("exportFailed"));
        if (res.status === 404) {
          setExportStep("empty");
          setExportErrorMsg(msg);
          return;
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      if (!isMountedRef.current) return;
      if (blob.size === 0) {
        throw new Error(t("exportEmptyResponse"));
      }

      // Wrap the bytes in an `application/octet-stream` blob before creating
      // the object URL. For PDF exports, Chrome's built-in viewer can hijack
      // `<a download>` when the blob is typed `application/pdf`. Using
      // octet-stream forces a save-to-disk for both PDF and XLSX; file
      // extensions on the `download` attribute keep apps associating correctly.
      const downloadBlob = new Blob([blob], { type: "application/octet-stream" });
      const url = URL.createObjectURL(downloadBlob);
      const ext = format === "pdf" ? "pdf" : "xlsx";
      const filename = `activity-log-${new Date().toISOString().split("T")[0]}.${ext}`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();

      const cleanupAnchor = () => {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
      };
      exportCleanupsRef.current.push(cleanupAnchor);

      // Keep the anchor attached for ~3 s so Chrome's download queue can
      // process it before the DOM node and blob URL are torn down.
      const anchorTimer = setTimeout(() => {
        exportTimersRef.current = exportTimersRef.current.filter((id) => id !== anchorTimer);
        cleanupAnchor();
        exportCleanupsRef.current = exportCleanupsRef.current.filter((fn) => fn !== cleanupAnchor);
      }, 3000);
      exportTimersRef.current.push(anchorTimer);

      setExportStep("done");
      const doneTimer = setTimeout(() => {
        exportTimersRef.current = exportTimersRef.current.filter((id) => id !== doneTimer);
        if (!isMountedRef.current) return;
        setExportStep(null);
        setExportFormat(null);
        setShowExportConfirm(false);
      }, 1500);
      exportTimersRef.current.push(doneTimer);
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("[DashboardActivityLog] export failed:", err);
      setExportErrorMsg(err instanceof Error ? err.message : t("exportFailed"));
      setExportStep("error");
    }
  };

  return (
    <div
      data-testid="activity-log-root"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: "var(--neutral-0)",
      }}
    >
      {/* ── Page header ── */}
      <div
        style={{
          padding: "16px 20px 12px",
          borderBottom: "1px solid var(--neutral-200)",
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-heading)",
            fontWeight: 700,
            color: "var(--neutral-900)",
            letterSpacing: "-0.01em",
          }}
        >
          {t("pageTitle")}
        </h1>
        <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--neutral-500)" }}>
          {t("pageSubtitle")}
        </p>
      </div>

      {/* ── Toolbar ── */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--neutral-200)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
        }}
      >
        {canViewLocationTracking ? (
          <button
            type="button"
            onClick={() => setShowHeatmap(true)}
            aria-label={tHeatmap("openButtonAria")}
            title={tHeatmap("openButton")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--neutral-300)",
              background: "var(--neutral-0)",
              color: "var(--neutral-800)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            <MapPin size={14} aria-hidden />
            {tHeatmap("openButton")}
          </button>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ flex: "1 1 160px", minWidth: 0 }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
            height={34}
            fontSize={13}
          />
        </div>

        {/* Filter button */}
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          aria-label={t("filterActivity")}
          title={t("filterActivity")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 34,
            width: 34,
            borderRadius: 14,
            border: "none",
            backgroundColor: totalFilterCount > 0 ? "#FFF4ED" : "#F0F1F5",
            color: totalFilterCount > 0 ? "#F55F00" : "#737891",
            cursor: "pointer",
            position: "relative",
            flexShrink: 0,
            transition: "all 0.12s",
          }}
        >
          <Filter size={14} aria-hidden />
          {totalFilterCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -5,
                right: -5,
                minWidth: 16,
                height: 16,
                borderRadius: 99,
                backgroundColor: "var(--error-600)",
                color: "var(--neutral-0)",
                fontSize: 10,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 4px",
              }}
            >
              {totalFilterCount}
            </span>
          )}
        </button>

        {/* Export button */}
        <button
          type="button"
          onClick={() => {
            setShowExportConfirm(true);
            setExportStep(null);
          }}
          aria-label={t("exportActivity")}
          title={t("exportActivity")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 34,
            padding: "0 12px",
            borderRadius: 14,
            border: "none",
            backgroundColor: "#F0F1F5",
            color: "#737891",
            cursor: "pointer",
            flexShrink: 0,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <FileDown size={14} aria-hidden />
          {t("exportLog")}
        </button>

        {/* Project pill (when any projects are selected) — quick-clear */}
        {selectedProjectIds.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedProjectIds([])}
            aria-label={t("filterProjectClear")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 8px",
              borderRadius: 99,
              border: "1.5px solid var(--primary-300)",
              background: "var(--primary-50)",
              color: "var(--primary-700)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
              maxWidth: 180,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            <FolderKanban size={11} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {selectedProjectIds.length === 1
                ? projectNameMap.get(selectedProjectIds[0]) ?? selectedProjectIds[0]
                : t("filterProjectCount", { count: selectedProjectIds.length })}
            </span>
            <X size={11} style={{ flexShrink: 0 }} />
          </button>
        )}

        {/* Clear all */}
        {hasActiveFilters && selectedProjectIds.length === 0 && (
          <button
            onClick={resetFilters}
            aria-label={t("clearFilters")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--neutral-500)",
              fontSize: 12,
              padding: "4px 2px",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            <X size={12} />
            {t("clearFilters")}
          </button>
        )}
        </div>
      </div>

      {/* ── Filter panel ── */}
      {showFilters && (
        <DashboardFilterPanel
          filters={filters}
          selectedProjectIds={selectedProjectIds}
          projects={projects}
          onChange={setFilters}
          onProjectsChange={handleProjectsChange}
          onClose={() => setShowFilters(false)}
          canViewLocationTracking={canViewLocationTracking}
          onClear={() => {
            setFilters(EMPTY_FILTERS);
            setSelectedProjectIds([]);
            setShowFilters(false);
          }}
        />
      )}

      {/* ── Export confirm dialog ── */}
      {showExportConfirm && (
        <DashboardActivityExportDialog
          activeFilters={filters}
          selectedProjectIds={selectedProjectIds}
          projectNameMap={projectNameMap}
          exportStep={exportStep}
          exportFormat={exportFormat}
          exportErrorMsg={exportErrorMsg}
          onExport={handleExport}
          onClose={() => {
            setShowExportConfirm(false);
            setExportStep(null);
            setExportFormat(null);
            setExportErrorMsg("");
          }}
        />
      )}

      {/* ── Event list ── */}
      {!loading && !error && displayTotal > 0 && (
        <ActivityListCountSummary
          filtered={filteredEvents.length}
          total={displayTotal}
          label={activityCountLabel}
        />
      )}
      <div data-testid="activity-log-event-list" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {loading && (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: "var(--neutral-500)",
              fontSize: 13,
            }}
          >
            {t("loading")}
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: "var(--error-600)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && filteredEvents.length === 0 && (
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: "var(--neutral-400)",
              fontSize: 14,
            }}
          >
            {hasActiveFilters ? t("emptyFiltered") : t("empty")}
          </div>
        )}

        {!loading &&
          !error &&
          filteredEvents.map((event) => (
            <DashboardActivityCard
              key={event.id}
              event={event}
              projectName={projectNameMap.get(event.projectId) ?? event.projectId}
              canViewLocationTracking={canViewLocationTracking}
            />
          ))}

        {/* Load more */}
        {nextCursor && !loading && (
          <div style={{ padding: "16px", textAlign: "center" }}>
            <button
              onClick={loadMore}
              disabled={loadingMore}
              style={{
                padding: "9px 20px",
                border: "1.5px solid var(--neutral-300)",
                borderRadius: 8,
                background: "var(--neutral-0)",
                color: "var(--neutral-700)",
                cursor: loadingMore ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 600,
                opacity: loadingMore ? 0.6 : 1,
              }}
            >
              {loadingMore ? t("loadingMore") : t("loadMore")}
            </button>
          </div>
        )}
      </div>

      {canViewLocationTracking ? (
        <ActivityHeatmapModal
          open={showHeatmap}
          onClose={() => setShowHeatmap(false)}
          projectIds={
            selectedProjectIds.length > 0
              ? selectedProjectIds
              : projects.map((p) => p.id)
          }
          scope="dashboard"
        />
      ) : null}
    </div>
  );
}

// ─── Export confirm dialog ────────────────────────────────────────────────────

function DashboardActivityExportDialog({
  activeFilters,
  selectedProjectIds,
  projectNameMap,
  exportStep,
  exportFormat,
  exportErrorMsg,
  onExport,
  onClose,
}: {
  activeFilters: DashboardFilters;
  selectedProjectIds: string[];
  projectNameMap: Map<string, string>;
  exportStep: null | "generating" | "done" | "empty" | "error";
  exportFormat: "pdf" | "xlsx" | null;
  exportErrorMsg: string;
  onExport: (dateRange: DateRange, format: "pdf" | "xlsx") => void;
  onClose: () => void;
}) {
  const t = useTranslations("dashboardActivity");

  const [dateRange, setDateRange] = useState<DateRange>(
    activeFilters.dateRange.preset !== "all"
      ? activeFilters.dateRange
      : { preset: "all", customFrom: "", customTo: "" }
  );

  const activeEventTypeLabels = activeFilters.eventTypes.map(
    (type) => EVENT_CONFIG[type]?.label ?? type
  );

  const activeProjectLabels = selectedProjectIds.map(
    (id) => projectNameMap.get(id) ?? id
  );

  const isRunning = exportStep === "generating";
  const isPdf = exportFormat !== "xlsx";

  const exportButtons = (
    <>
      <button
        onClick={() => onExport(dateRange, "pdf")}
        disabled={
          isRunning ||
          (dateRange.preset === "custom" && !dateRange.customFrom && !dateRange.customTo)
        }
        style={{
          flex: 1,
          padding: "10px",
          border: "none",
          borderRadius: 8,
          background: "var(--primary-700)",
          color: "var(--neutral-0)",
          fontSize: 13,
          fontWeight: 600,
          cursor: isRunning ? "default" : "pointer",
          opacity: isRunning ? 0.7 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <FileDown size={14} aria-hidden />
        {isRunning && exportFormat === "pdf" ? t("exportGeneratingShort") : t("exportSubmit")}
      </button>
      <button
        onClick={() => onExport(dateRange, "xlsx")}
        disabled={
          isRunning ||
          (dateRange.preset === "custom" && !dateRange.customFrom && !dateRange.customTo)
        }
        style={{
          flex: 1,
          padding: "10px",
          border: "1.5px solid var(--primary-600)",
          borderRadius: 8,
          background: "var(--neutral-0)",
          color: "var(--primary-700)",
          fontSize: 13,
          fontWeight: 600,
          cursor: isRunning ? "default" : "pointer",
          opacity: isRunning ? 0.7 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <FileDown size={14} aria-hidden />
        {isRunning && exportFormat === "xlsx" ? t("exportGeneratingShort") : t("exportSubmitExcel")}
      </button>
    </>
  );

  const DATE_PRESETS: { label: string; value: DatePreset }[] = [
    { label: t("dateAll"), value: "all" },
    { label: t("date7d"), value: "7d" },
    { label: t("date14d"), value: "14d" },
    { label: t("date30d"), value: "30d" },
    { label: t("dateCustom"), value: "custom" },
  ];

  return createPortal(
    <>
      <div
        onClick={!isRunning ? onClose : undefined}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 600 }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: "min(440px, 94vw)",
          background: "var(--neutral-0)",
          borderRadius: 14,
          boxShadow: "var(--shadow-2)",
          zIndex: 601,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "18px 20px 14px",
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--neutral-900)" }}>
              {t("exportDialogTitle")}
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--neutral-500)" }}>
              {t("exportDialogSubtitle")}
            </p>
          </div>
          {!isRunning && (
            <button
              onClick={onClose}
              aria-label={t("exportDialogClose")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                color: "var(--neutral-400)",
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Date range selector */}
          <div>
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "var(--neutral-500)",
              }}
            >
              {t("dateRange")}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {DATE_PRESETS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setDateRange({ ...dateRange, preset: value })}
                  disabled={isRunning}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    border: "1.5px solid",
                    borderColor:
                      dateRange.preset === value
                        ? "var(--primary-600)"
                        : "var(--neutral-300)",
                    background:
                      dateRange.preset === value ? "var(--primary-50)" : "var(--neutral-0)",
                    color:
                      dateRange.preset === value ? "var(--primary-700)" : "var(--neutral-600)",
                    fontSize: 13,
                    fontWeight: dateRange.preset === value ? 600 : 400,
                    cursor: isRunning ? "default" : "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {dateRange.preset === "custom" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                <input
                  type="date"
                  value={dateRange.customFrom}
                  disabled={isRunning}
                  onChange={(e) => setDateRange({ ...dateRange, customFrom: e.target.value })}
                  style={{
                    flex: 1,
                    padding: "7px 8px",
                    border: "1.5px solid var(--neutral-300)",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <span style={{ color: "var(--neutral-400)", fontSize: 12 }}>
                  {t("dateTo")}
                </span>
                <input
                  type="date"
                  value={dateRange.customTo}
                  disabled={isRunning}
                  onChange={(e) => setDateRange({ ...dateRange, customTo: e.target.value })}
                  style={{
                    flex: 1,
                    padding: "7px 8px",
                    border: "1.5px solid var(--neutral-300)",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
              </div>
            )}
          </div>

          {/* Active filters notice */}
          {(activeEventTypeLabels.length > 0 || activeProjectLabels.length > 0) && (
            <div
              style={{
                background: "var(--primary-50)",
                border: "1px solid var(--primary-200)",
                borderRadius: 8,
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--primary-700)",
                }}
              >
                {t("exportActiveFiltersNotice")}
              </p>
              {activeProjectLabels.length > 0 && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--primary-600)" }}>
                  <strong>{t("exportProjectsLabel")}:</strong> {activeProjectLabels.join(", ")}
                </p>
              )}
              {activeEventTypeLabels.length > 0 && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--primary-600)" }}>
                  <strong>{t("exportEventTypesLabel")}:</strong>{" "}
                  {activeEventTypeLabels.join(", ")}
                </p>
              )}
            </div>
          )}

          {/* Status feedback */}
          {exportStep === "generating" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                background: "var(--neutral-50)",
                borderRadius: 8,
                border: "1px solid var(--neutral-200)",
              }}
            >
              <span
                className="animate-spin"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: "2px solid var(--primary-600)",
                  borderTopColor: "transparent",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 13, color: "var(--neutral-700)", fontWeight: 500 }}>
                {isPdf ? t("exportGeneratingPdf") : t("exportGeneratingExcel")}
              </span>
            </div>
          )}
          {exportStep === "done" && (
            <div
              style={{
                padding: "10px 12px",
                background: "var(--success-50)",
                borderRadius: 8,
                border: "1px solid var(--success-200)",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--success-700)", fontWeight: 600 }}>
                {isPdf ? t("exportDonePdf") : t("exportDoneExcel")}
              </span>
            </div>
          )}
          {exportStep === "empty" && (
            <div
              style={{
                padding: "10px 12px",
                background: "var(--neutral-50)",
                borderRadius: 8,
                border: "1px solid var(--neutral-200)",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-700)", fontWeight: 600 }}>
                {t("exportEmptyTitle")}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--neutral-500)" }}>
                {t("exportEmptyHelp")}
              </p>
            </div>
          )}
          {exportStep === "error" && (
            <div
              style={{
                padding: "10px 12px",
                background: "var(--error-50)",
                borderRadius: 8,
                border: "1px solid var(--error-200)",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: "var(--error-700)", fontWeight: 600 }}>
                {t("exportFailed")}
              </p>
              {exportErrorMsg && (
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--error-600)" }}>
                  {exportErrorMsg}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          {exportStep !== "done" && exportStep !== "empty" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={onClose}
                disabled={isRunning}
                style={{
                  padding: "10px",
                  border: "1.5px solid var(--neutral-300)",
                  borderRadius: 8,
                  background: "var(--neutral-0)",
                  color: "var(--neutral-600)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isRunning ? "default" : "pointer",
                  opacity: isRunning ? 0.5 : 1,
                }}
              >
                {t("exportCancel")}
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                {exportButtons}
              </div>
            </div>
          )}
          {exportStep === "empty" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={onClose}
                style={{
                  padding: "10px",
                  border: "1.5px solid var(--neutral-300)",
                  borderRadius: 8,
                  background: "var(--neutral-0)",
                  color: "var(--neutral-600)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t("exportClose")}
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                {exportButtons}
              </div>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

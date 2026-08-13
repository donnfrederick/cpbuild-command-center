"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  MobileUnitDetailModal,
  EMPTY_ISSUE_META,
  type UnitCard,
  type ScopeRow,
} from "@/components/projects/UnitCards";
import {
  Activity,
  ArrowRightLeft,
  Package2,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Users,
  ClipboardCheck,
  Eye,
  Pencil,
  ChevronDown,
  X,
  MapPin,
  ExternalLink,
  Search,
  ShieldAlert,
  Filter,
  FileDown,
  FlaskConical,
  Copy,
  Database,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { getPendingActivityEvents } from "@/lib/offline/pending-activity";
import { readSnapshotActivityPage } from "@/lib/offline/snapshot-project-reads";
import { useRegisterOfflineCacheView } from "@/hooks/use-register-offline-cache-view";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import {
  ACTIVITY_PENDING_SYNC_CHIP_STYLE,
  ACTIVITY_SYNC_FAILED_CHIP_STYLE,
  ACTIVITY_UNIT_CHIP_STYLE,
  getActivityEventColors,
} from "@/lib/activity-event-styles";
import { activityLocationChipParts, formatActivityActor } from "@/lib/activity-unit-chip";
import { buildActivityEventDescription } from "@/lib/activity-event-summary";
import { ActivityLocationSection } from "@/components/shared/ActivityLocationSection";
import { ActivityLocationOutcomeFilterSection } from "@/components/shared/ActivityLocationOutcomeFilterSection";
import type { SerializedActivityLocation } from "@/lib/activity/activity-location-schema";
import type { LocationOutcome } from "@/lib/activity/activity-location-schema";
import { locationOutcomeParam } from "@/lib/activity/activity-filter-location-outcomes";
import { ActivityHeatmapModal } from "@/components/reports/ActivityHeatmapModal";
import { FILTERABLE_ACTIVITY_EVENT_TYPES } from "@/lib/activity-filter-event-types";
import {
  filterPendingInspectionEventsDeduped,
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
import { ActivityListCountSummary } from "@/components/shared/ActivityListCountSummary";
import { ActivityMediaStrip } from "@/components/shared/ActivityMediaStrip";
import { shouldShowFilteredActivityCount } from "@/lib/activity-list-count-label";

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
  | "ISSUE_ANNOTATION_UPDATED"
  | "OBSERVATION_ANNOTATION_UPDATED"
  | "OBSERVATION_IMAGE_VERSION_ADDED"
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
  eventType: ActivityEventType;
  userId: string | null;
  userName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  activityLocation?: SerializedActivityLocation;
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type DatePreset = "all" | "7d" | "14d" | "30d" | "custom";

interface DateRange {
  preset: DatePreset;
  customFrom: string;
  customTo: string;
}

interface ActivityFilters {
  eventTypes: ActivityEventType[];
  dateRange: DateRange;
  locationOutcomes: LocationOutcome[];
}

const EMPTY_FILTERS: ActivityFilters = {
  eventTypes: [],
  dateRange: { preset: "all", customFrom: "", customTo: "" },
  locationOutcomes: [],
};

function activeFilterCount(f: ActivityFilters): number {
  let n = 0;
  if (f.eventTypes.length) n++;
  if (f.dateRange.preset !== "all") n++;
  if (f.locationOutcomes.length) n++;
  return n;
}

function dateRangeBounds(dr: DateRange): { from: number | null; to: number | null } {
  const { from, to } = presetToDateStrings(dr);
  const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
  return { from: fromMs, to: toMs };
}

function applyActivityFilters(events: ActivityEvent[], f: ActivityFilters): ActivityEvent[] {
  const { from, to } = dateRangeBounds(f.dateRange);
  return events.filter((e) => {
    if (f.eventTypes.length > 0 && !f.eventTypes.includes(e.eventType)) return false;
    const createdAt = new Date(e.createdAt).getTime();
    if (from != null && createdAt < from) return false;
    if (to != null && createdAt > to) return false;
    return true;
  });
}

/** Convert a DateRange preset to YYYY-MM-DD from/to strings for the API. */
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
  { label: string; shortLabel?: string; icon: React.ReactNode }
> = {
  SCOPE_STATUS_UPDATED: {
    label: "Status Updated",
    shortLabel: "Status",
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
    label: "Bulk Issues Reported",
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
  ISSUE_ANNOTATION_UPDATED: {
    label: "Issue Markup",
    icon: <Pencil size={14} />,
  },
  OBSERVATION_ANNOTATION_UPDATED: {
    label: "Markup Updated",
    icon: <Pencil size={14} />,
  },
  OBSERVATION_IMAGE_VERSION_ADDED: {
    label: "Image Marked",
    icon: <Pencil size={14} />,
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
    shortLabel: "Sync failed",
    icon: <ClipboardCheck size={14} />,
  },
  MUTATION_SYNC_FAILED: {
    label: "Upload Failed",
    shortLabel: "Upload failed",
    icon: <AlertTriangle size={14} />,
  },
  OBSERVATION_CREATED: {
    label: "Observation Added",
    icon: <Eye size={14} />,
  },
  OBSERVATION_BULK_CREATED: {
    label: "Bulk Observations",
    icon: <Users size={14} />,
  },
  OBSERVATION_UPDATED: {
    label: "Observation Updated",
    icon: <Eye size={14} />,
  },
  UNIT_ROW_CREATED: {
    label: "Location Rows Added",
    icon: <Package2 size={14} />,
  },
  UNIT_ROW_DELETED: {
    label: "Location Row Deleted",
    icon: <X size={14} />,
  },
  UNIT_ROWS_BULK_DELETED: {
    label: "Location Rows Deleted",
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
    label: "Location Builder Updated",
    icon: <Pencil size={14} />,
  },
  SUB_SCOPE_INSTANCE_UPDATED: {
    label: "Sub-scope Updated",
    icon: <Pencil size={14} />,
  },
  FIELD_MEDIA_UPLOAD_RATE_LIMITED: {
    label: "Upload limit",
    shortLabel: "Upload limit",
    icon: <ShieldAlert size={14} />,
  },
  PROJECT_CLONED_AS_TEST: {
    label: "Project Cloned as Test",
    shortLabel: "Test clone",
    icon: <Copy size={14} />,
  },
  PROJECT_TEST_DATA_SEEDED: {
    label: "Test Data Seeded",
    shortLabel: "Test seed",
    icon: <Database size={14} />,
  },
  PROJECT_TEST_DATA_BATCH_REMOVED: {
    label: "Test Data Batch Removed",
    shortLabel: "Seed removed",
    icon: <Database size={14} />,
  },
  CUSTOM_SITE_LOCATION_CREATED: {
    label: "Custom Location Added",
    shortLabel: "Custom location",
    icon: <MapPin size={14} />,
  },
  CUSTOM_SITE_LOCATION_DELETED: {
    label: "Custom Location Removed",
    shortLabel: "Custom location",
    icon: <MapPin size={14} />,
  },
  UNIT_PHOTO_UPLOADED: {
    label: "Photo Uploaded",
    shortLabel: "Photo",
    icon: <Camera size={14} />,
  },
  FIELD_DAILY_DAILY_MANPOWER_SET: {
    label: "Daily Manpower Set",
    shortLabel: "Manpower",
    icon: <Users size={14} />,
  },
};

const FALLBACK_EVENT_CONFIG = {
  label: "Activity",
  shortLabel: "Activity",
  icon: <Activity size={14} />,
} as const;

// ─── Unit Preview Panel ───────────────────────────────────────────────────────
// Reuses MobileUnitDetailModal (desktopPanel mode) — same UI as the units page.

/** A unit to preview — either by an existing rowId or by building/level/unit location. */
interface UnitPreviewTarget {
  /** rowId present for single-event entries (SCOPE_STATUS_UPDATED, CLEAR_INSPECTION_SET, etc.) */
  rowId?: string;
  /** Structured location present for bulk-update entries */
  building?: string;
  level?: string;
  unit?: string;
  projectId: string;
  label: string;
}

interface NavList {
  items: { building: string; level: string; unit: string }[];
  index: number;
  onNav: (idx: number) => void;
}

function UnitPreviewPanel({
  target,
  nav,
  canManageStatus,
  currentUserId,
  currentUserRole,
  onClose,
}: {
  target: UnitPreviewTarget;
  nav?: NavList;
  canManageStatus: boolean;
  currentUserId?: string;
  currentUserRole?: string;
  onClose: () => void;
}) {
  // `card` is never cleared during navigation — we keep showing the previous unit
  // while the next one loads so the modal never unmounts/re-animates.
  const [card, setCard] = useState<UnitCard | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetching(true);
    // Do NOT setCard(null) here — keep previous card visible during navigation.
    let cancelled = false;

    let url: string;
    if (target.rowId) {
      url = `/api/projects/${target.projectId}/units/${target.rowId}`;
    } else {
      const qs = new URLSearchParams({
        ...(target.building ? { building: target.building } : {}),
        ...(target.level ? { level: target.level } : {}),
        unit: target.unit ?? "",
      });
      url = `/api/projects/${target.projectId}/units/lookup?${qs}`;
    }

    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { building: string; level: string; unit: string; area: string; buildPhase: string; unitType: string; scopes: ScopeRow[] }) => {
        if (cancelled) return;
        setCard({
          key: `${d.building}|${d.level}|${d.unit}`,
          building: d.building,
          level: d.level,
          unit: d.unit,
          area: d.area ?? "",
          buildPhase: d.buildPhase ?? "",
          unitType: d.unitType ?? "",
          scopes: d.scopes,
          issueMeta: EMPTY_ISSUE_META,
          locationType: null,
        });
        setFetching(false);
      })
      .catch(() => { if (!cancelled) setFetching(false); });

    return () => { cancelled = true; };
  }, [target.rowId, target.building, target.level, target.unit, target.projectId]);

  const hasPrev = nav ? nav.index > 0 : false;
  const hasNext = nav ? nav.index < nav.items.length - 1 : false;

  // Initial open with no card yet: show only the backdrop so the modal can slide
  // in cleanly once data arrives — no loading panel that would pop in and be replaced.
  if (!card) {
    return createPortal(
      <div
        aria-hidden
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 600, backgroundColor: "rgba(0,0,0,0.35)" }}
      />,
      document.body
    );
  }

  // Card is ready. A thin progress bar at the top of the panel signals when a
  // navigation fetch is in-flight — the modal itself never unmounts or re-animates.
  // onPrev/onNext/unitIndex/unitTotal wire into the modal's built-in footer nav
  // so it matches the Prev / N of M / Next layout on the units page exactly.
  return createPortal(
    <>
      <MobileUnitDetailModal
        card={card}
        projectId={target.projectId}
        onSaved={(scopeId, updates) => {
          setCard((prev) =>
            prev
              ? { ...prev, scopes: prev.scopes.map((s) => (s.id === scopeId ? ({ ...s, ...updates } as ScopeRow) : s)) }
              : prev
          );
        }}
        onInstanceSaved={() => {}}
        onClose={onClose}
        canManageStatus={canManageStatus}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        desktopPanel={true}
        onPrev={hasPrev && nav ? () => nav.onNav(nav.index - 1) : undefined}
        onNext={hasNext && nav ? () => nav.onNav(nav.index + 1) : undefined}
        unitIndex={nav ? nav.index : undefined}
        unitTotal={nav ? nav.items.length : undefined}
      />
      {/* Thin loading bar during navigation — never unmounts the modal */}
      {fetching && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: "min(480px, 100vw)",
            height: 3,
            zIndex: 702,
            background: "linear-gradient(90deg, var(--primary-400), var(--primary-600))",
            animation: "activityPanelProgress 0.8s ease-in-out infinite alternate",
          }}
        />
      )}
    </>,
    document.body
  );
}

// ─── Unit location extractor ──────────────────────────────────────────────────

type UnitLocation =
  | { kind: "single"; building: string; level: string; unit: string }
  | { kind: "bulk"; count: number };

function getUnitLocation(event: ActivityEvent): UnitLocation | null {
  const m = event.metadata;
  switch (event.eventType) {
    case "SCOPE_STATUS_UPDATED":
    case "SCOPE_INSPECTION_UPDATED":
    case "CLEAR_INSPECTION_SET":
    case "CLEAR_INSPECTION_DELETED":
    case "INSPECTION_BACKFILL_SET":
    case "INSPECTION_BACKFILL_DELETED":
    case "INSPECTION_SUBMITTED":
    case "SCOPE_SUBCONTRACTOR_UPDATED":
    case "UNIT_ROW_DELETED":
    case "UPM_ROW_UPDATED":
    case "SUB_SCOPE_INSTANCE_UPDATED":
    case "UNIT_PHOTO_UPLOADED":
      return {
        kind: "single",
        building: (m.building as string) || "",
        level: (m.level as string) || "",
        unit: (m.unit as string) || "",
      };
    case "SCOPE_STATUS_BULK_UPDATED":
    case "SCOPE_STATUS_BULK_UNDONE":
    case "SCOPE_INSPECTION_BULK_UPDATED":
    case "OBSERVATION_BULK_CREATED":
    case "UNIT_ROW_CREATED":
    case "UNIT_ROWS_BULK_DELETED":
    case "UNIT_INSTALLER_BULK_UPDATED":
      return { kind: "bulk", count: m.count as number };
    case "ISSUE_CREATED":
    case "ISSUE_UPDATED":
    case "ISSUE_DELETED":
    case "ISSUE_RESOLVED":
    case "ISSUE_REOPENED":
    case "OBSERVATION_CREATED":
    case "OBSERVATION_UPDATED":
    case "ISSUE_ANNOTATION_UPDATED":
    case "OBSERVATION_ANNOTATION_UPDATED":
    case "OBSERVATION_IMAGE_VERSION_ADDED": {
      const ref = m.unitRef as string | null;
      if (!ref) return null; // project-level event
      const parts = ref.split("|");
      return {
        kind: "single",
        building: parts[0] ?? "",
        level: parts[1] ?? "",
        unit: parts[2] ?? "",
      };
    }
    case "ISSUE_BULK_CREATED":
      return { kind: "bulk", count: m.count as number };
    default:
      return null;
  }
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

// ─── Activity Card ────────────────────────────────────────────────────────────

function ActivityCard({
  event,
  projectId,
  canManageStatus,
  currentUserId,
  currentUserDisplayName,
  currentUserRole,
  disableUnitPreview = false,
  canViewLocationTracking = false,
}: {
  event: ActivityEvent;
  projectId: string;
  canManageStatus: boolean;
  currentUserId?: string;
  currentUserDisplayName?: string;
  currentUserRole?: string;
  /** When true, unit chips are non-interactive (used inside UnitActivityModal). */
  disableUnitPreview?: boolean;
  canViewLocationTracking?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<UnitPreviewTarget | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [syncErrorDetailOpen, setSyncErrorDetailOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>([]);
  const tActivityLog = useTranslations("activityLog");
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
    event.eventType === "FIELD_MEDIA_UPLOAD_RATE_LIMITED"
      ? tActivityLog("eventTypeLabelFieldMedia")
      : subcontractorBadgeKind === "assigned"
        ? tActivityLog("eventTypeScopeSubcontractorAssigned")
        : subcontractorBadgeKind === "cleared"
          ? tActivityLog("eventTypeScopeSubcontractorCleared")
          : subcontractorBadgeKind === "updated"
            ? tActivityLog("eventTypeScopeSubcontractorUpdated")
            : cfg.label;

  const summary =
    event.eventType === "FIELD_MEDIA_UPLOAD_RATE_LIMITED"
      ? tActivityLog("fieldMediaRateLimited", {
          windowLabel:
            (event.metadata.windowKey as string) === "per_ten_minute"
              ? tActivityLog("fieldMediaRateWindowTenMin")
              : tActivityLog("fieldMediaRateWindowPerMinute"),
          count: event.metadata.count as number,
          limit: event.metadata.limit as number,
          uploadType: (event.metadata.uploadType as string) || "",
        })
      : buildActivityEventDescription({ ...event, createdAt: event.createdAt });
  const location = getUnitLocation(event);
  const isPendingSync = Boolean(event.metadata.pendingSync);

  // rowId is present on SCOPE_STATUS_UPDATED and CLEAR_INSPECTION_SET events.
  const rowId = (event.metadata.rowId as string | undefined) ?? null;

  // For bulk status updates, extract all structured unit refs for the expandable list.
  // New entries store objects { building, level, unit }; old entries stored flat strings "South 1 S100".
  // Normalise both into the same shape so the expandable list always renders.
  const rawRefs = [
    "SCOPE_STATUS_BULK_UPDATED",
    "SCOPE_STATUS_BULK_UNDONE",
    "SCOPE_INSPECTION_BULK_UPDATED",
    "OBSERVATION_BULK_CREATED",
    "UNIT_ROW_CREATED",
    "UNIT_ROWS_BULK_DELETED",
    "UNIT_INSTALLER_BULK_UPDATED",
  ].includes(event.eventType) && Array.isArray(event.metadata.unitRefs)
    ? (event.metadata.unitRefs as unknown[])
    : null;
  const bulkUnitRefs: { building: string; level: string; unit: string }[] | null =
    rawRefs && rawRefs.length > 0
      ? rawRefs.map((r) => {
          if (typeof r === "object" && r !== null) {
            return r as { building: string; level: string; unit: string };
          }
          // Old flat-string format: "South 2 S200" → { building:"South", level:"2", unit:"S200" }
          const str = String(r);
          const parts = str.split(" ");
          if (parts.length >= 3) {
            const unit = parts[parts.length - 1];
            const level = parts[parts.length - 2];
            const building = parts.slice(0, parts.length - 2).join(" ");
            return { building, level, unit };
          } else if (parts.length === 2) {
            return { building: parts[0], level: "", unit: parts[1] };
          }
          return { building: "", level: "", unit: str };
        })
      : null;

  // Open a unit from the bulk list by index and keep previewIdx in sync
  const openBulkPreview = useCallback((idx: number) => {
    if (!bulkUnitRefs) return;
    const ref = bulkUnitRefs[idx];
    if (!ref) return;
    setPreviewIdx(idx);
    setPreviewTarget({
      building: ref.building || undefined,
      level: ref.level || undefined,
      unit: ref.unit,
      projectId,
      label: ref.unit,
    });
  }, [bulkUnitRefs, projectId]);

  // Auto-scroll the highlighted chip into view whenever previewIdx changes
  useEffect(() => {
    if (previewIdx === null || !listRef.current) return;
    const el = itemRefs.current[previewIdx];
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [previewIdx]);

  // Build location chip content
  let locationChip: React.ReactNode = null;
  if (location?.kind === "single") {
    const locationParts = activityLocationChipParts(event.metadata);
    const chipLabelParts =
      locationParts.length > 0
        ? locationParts
        : [location.building, location.level, location.unit].filter(Boolean);
    // Any event with a known unit is previewable — unless we're already inside a unit modal
    const canPreview = !!location.unit && !disableUnitPreview;
    const chipContent = (
      <>
        <MapPin size={11} style={{ flexShrink: 0 }} />
        {chipLabelParts.length ? chipLabelParts.join(" · ") : location.unit || "—"}
        {canPreview && <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.7 }} />}
      </>
    );
    const chipStyle: React.CSSProperties = {
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
      textDecoration: "none",
      flexShrink: 0,
      maxWidth: "100%",
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
      cursor: canPreview ? "pointer" : "default",
    };
    locationChip = canPreview ? (
      <button
        type="button"
        style={chipStyle}
        title="Preview unit"
        onClick={(e) => {
          e.stopPropagation();
          setPreviewTarget({
            rowId: rowId ?? undefined,
            building: location.building || undefined,
            level: location.level || undefined,
            unit: location.unit,
            projectId,
            label: location.unit,
          });
        }}
      >
        {chipContent}
      </button>
    ) : (
      <span style={chipStyle}>{chipContent}</span>
    );
  } else if (location?.kind === "bulk") {
    locationChip = (
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
        <Package2 size={10} style={{ flexShrink: 0 }} />
        {location.count} scope{location.count !== 1 ? "s" : ""}
        {bulkUnitRefs && (
          <span style={{ opacity: 0.7 }}>
            &nbsp;·&nbsp;{bulkUnitRefs.length} unit{bulkUnitRefs.length !== 1 ? "s" : ""}
          </span>
        )}
      </span>
    );
  }

  return (
    <>
    <div
      className="activity-card"
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
        ...(isSyncFailure
          ? { cursor: "pointer", background: "var(--neutral-0)" }
          : {}),
      }}
    >
      {/* Icon badge */}
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
          marginTop: 1,
        }}
      >
        {cfg.icon}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top row: unit chip first, then event type badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
          {locationChip}
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
              {tActivityLog("pendingSyncBadge")}
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

        {/* Meta row */}
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--neutral-500)" }}>
          <span title={absoluteTime(event.createdAt)}>{relativeTime(event.createdAt)}</span>
          {(() => {
            const footerActor = formatActivityActor(
              event,
              currentUserId,
              tActivityLog("pendingSyncBadge"),
              currentUserDisplayName,
            );
            return footerActor && footerActor !== "Someone" ? (
              <>
                {" · "}
                <span>{footerActor}</span>
              </>
            ) : null;
          })()}
        </p>

        {/* Expandable unit list for bulk status updates */}
        {bulkUnitRefs && bulkUnitRefs.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--primary-700)",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <ChevronDown
                size={13}
                style={{
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.18s ease",
                }}
              />
              {expanded ? "Hide" : "Show"} {bulkUnitRefs.length} unit{bulkUnitRefs.length !== 1 ? "s" : ""}
            </button>

            {expanded && (
              <div
                ref={listRef}
                style={{
                  marginTop: 8,
                  maxHeight: 220,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: "8px 10px",
                  backgroundColor: "var(--neutral-50)",
                  borderRadius: 8,
                  border: "1px solid var(--neutral-200)",
                }}
              >
                {bulkUnitRefs.map((ref, i) => {
                  const unitNum = ref.unit;
                  const sublabel = [ref.building, ref.level].filter(Boolean).join(" · ");
                  const isActive = previewIdx === i;

                  const chipStyle: React.CSSProperties = {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 500,
                    borderRadius: 20,
                    padding: "3px 10px 3px 7px",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    alignSelf: "flex-start",
                    cursor: "pointer",
                    border: isActive
                      ? "1.5px solid var(--primary-500)"
                      : "1px solid var(--primary-200)",
                    color: isActive ? "var(--neutral-0)" : "var(--primary-700)",
                    background: isActive ? "var(--primary-600)" : "var(--primary-50)",
                    transition: "background-color 0.1s, color 0.1s",
                  };

                  return (
                    <button
                      key={i}
                      type="button"
                      ref={(el) => { itemRefs.current[i] = el; }}
                      style={{ ...chipStyle, cursor: disableUnitPreview ? "default" : "pointer" }}
                      title={disableUnitPreview ? unitNum : `Preview unit ${unitNum}`}
                      onClick={disableUnitPreview ? undefined : () => openBulkPreview(i)}
                    >
                      <MapPin size={10} style={{ flexShrink: 0 }} />
                      <span style={{ fontWeight: 700 }}>{unitNum || "—"}</span>
                      {sublabel && (
                        <span style={{ opacity: isActive ? 0.85 : 0.7 }}>&nbsp;·&nbsp;{sublabel}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {previewTarget && (
      <UnitPreviewPanel
        target={previewTarget}
        nav={bulkUnitRefs && previewIdx !== null ? {
          items: bulkUnitRefs,
          index: previewIdx,
          onNav: openBulkPreview,
        } : undefined}
        canManageStatus={canManageStatus}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        onClose={() => { setPreviewTarget(null); setPreviewIdx(null); }}
      />
    )}
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


// ─── Main client component ────────────────────────────────────────────────────

interface ActivityLogClientProps {
  projectId: string;
  projectName?: string;
  canManageStatus?: boolean;
  canViewLocationTracking?: boolean;
  currentUserId?: string;
  currentUserDisplayName?: string;
  currentUserRole?: string;
}

export function ActivityLogClient({
  projectId,
  projectName = "Project",
  canManageStatus = false,
  canViewLocationTracking = false,
  currentUserId,
  currentUserDisplayName,
  currentUserRole,
}: ActivityLogClientProps) {
  const tActivityLog = useTranslations("activityLog");
  const tHeatmap = useTranslations("activityHeatmap");
  const tOffline = useTranslations("offlineIndicator");
  const { isOnline } = useOfflineStatus();

  function requireOnline(): boolean {
    if (isOnline) return true;
    toast.error(tOffline("offlineActionUnavailable"));
    return false;
  }
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cacheDate, setCacheDate] = useState<string | null>(null);
  useRegisterOfflineCacheView(isFromCache, cacheDate);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ActivityFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [exportStep, setExportStep] = useState<null | "generating" | "done" | "empty" | "error">(null);
  const [exportFormat, setExportFormat] = useState<"pdf" | "xlsx" | null>(null);
  const [exportErrorMsg, setExportErrorMsg] = useState("");
  const [showHeatmap, setShowHeatmap] = useState(false);

  const filterCount = activeFilterCount(filters);
  const hasActiveFilters = !!search || filterCount > 0;

  const buildUrl = useCallback(
    (cursor?: string) => {
      const p = new URLSearchParams();
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
      const query = p.toString();
      return query
        ? `/api/projects/${projectId}/activity?${query}`
        : `/api/projects/${projectId}/activity`;
    },
    [projectId, filters.dateRange, filters.eventTypes, filters.locationOutcomes, canViewLocationTracking],
  );

  // Build a single searchable string from everything visible on an activity card.
  function getSearchableText(event: ActivityEvent): string {
    const m = event.metadata;
    const parts: string[] = [
      buildActivityEventDescription({ ...event, createdAt: event.createdAt }),
      event.userName ?? "",
      // Separate location fields (SCOPE_STATUS_UPDATED, CLEAR_INSPECTION_SET, etc.)
      (m.building as string) ?? "",
      (m.level as string) ?? "",
      (m.unit as string) ?? "",
      (m.scopeName as string) ?? "",
      // unitRef is "Building|Level|Unit" (issue / observation events)
      ((m.unitRef as string) ?? "").replace(/\|/g, " "),
      // shortDescription (issue events)
      (m.shortDescription as string) ?? "",
    ];
    // Bulk unitRefs — include every unit's building/level/unit
    if (Array.isArray(m.unitRefs)) {
      for (const r of m.unitRefs as unknown[]) {
        if (typeof r === "object" && r !== null) {
          parts.push(Object.values(r as Record<string, string>).join(" "));
        } else {
          parts.push(String(r));
        }
      }
    }
    if (event.eventType === "FIELD_MEDIA_UPLOAD_RATE_LIMITED") {
      parts.push(String(m.uploadType ?? ""), String(m.windowKey ?? ""));
    }
    return parts.join(" ").toLowerCase();
  }

  // Client-side filters: event type + text search
  const filteredEvents = useMemo(() => {
    let result = applyActivityFilters(events, filters);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((e) => getSearchableText(e).includes(q));
    }
    return result;
  }, [events, filters, search]);

  const displayTotal = totalCount ?? events.length;
  const activityCountLabel = shouldShowFilteredActivityCount({
    search,
    loadedCount: events.length,
    filteredCount: filteredEvents.length,
    totalCount: displayTotal,
  })
    ? tActivityLog("eventCountFilteredSummary", {
        filtered: filteredEvents.length,
        total: displayTotal,
      })
    : tActivityLog("eventCountSummary", { count: displayTotal });

  // Fetch first page whenever filters change
  const fetchRef = useRef(0);
  useEffect(() => {
    const id = ++fetchRef.current;
    setLoading(true);
    setError(null);
    setIsFromCache(false);
    setCacheDate(null);
    fetch(buildUrl())
      .then((r) => r.json())
      .then(async (data) => {
        if (id !== fetchRef.current) return;
        const pending = await getPendingActivityEvents({ projectId });
        if (id !== fetchRef.current) return;
        const serverEvents = ((data.events ?? []) as ActivityEvent[]);
        const displayEvents = prepareActivityFeedForDisplay(
          pending as ActivityEvent[],
          serverEvents,
        );
        const serverTotal = typeof data.totalCount === "number" ? data.totalCount : 0;
        setTotalCount(serverTotal);
        setEvents(displayEvents);
        setNextCursor(data.nextCursor ?? null);
      })
      .catch(async () => {
        if (id !== fetchRef.current) return;
        try {
          const pending = await getPendingActivityEvents({ projectId });
          const dedupedPending = filterPendingInspectionEventsDeduped(
            pending as ActivityEvent[],
            [],
          );

          if (!hasActiveFilters) {
            const cached = await readSnapshotActivityPage(projectId);
            if (cached) {
              const serverEvents = cached.data.events as ActivityEvent[];
              const displayEvents = prepareActivityFeedForDisplay(
                pending as ActivityEvent[],
                serverEvents,
              );
              setTotalCount(cached.data.totalCount);
              setEvents(displayEvents);
              setNextCursor(cached.data.nextCursor);
              setIsFromCache(true);
              setCacheDate(cached.generatedAt);
              setError(null);
              return;
            }
          }

          if (dedupedPending.length > 0) {
            setTotalCount(dedupedPending.length);
            setEvents(dedupeActivityEventsForDisplay(dedupedPending as ActivityEvent[]));
            setNextCursor(null);
            setError(null);
            return;
          }
        } catch {
          // fall through to error state
        }
        setError("Failed to load activity.");
      })
      .finally(() => {
        if (id !== fetchRef.current) return;
        setLoading(false);
      });
  }, [buildUrl, projectId, hasActiveFilters]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    if (!requireOnline()) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(nextCursor));
      const data = await res.json();
      setEvents((prev) =>
        dedupeActivityEventsForDisplay([
          ...prev,
          ...((data.events ?? []) as ActivityEvent[]),
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
  };

  const handleExport = async (exportDateRange: DateRange, format: "pdf" | "xlsx") => {
    if (!requireOnline()) return;
    setExportFormat(format);
    setExportStep("generating");
    setExportErrorMsg("");
    try {
      const { from: dateFrom, to: dateTo } = presetToDateStrings(exportDateRange);

      // Build a human-readable filter summary for the export cover
      const parts: string[] = [];
      if (exportDateRange.preset !== "all") {
        if (exportDateRange.preset === "custom") {
          parts.push(`${dateFrom || "—"} ${tActivityLog("dateTo")} ${dateTo || tActivityLog("exportCustomRangeOpen")}`);
        } else {
          parts.push(
            exportDateRange.preset === "7d"
              ? tActivityLog("date7d")
              : exportDateRange.preset === "14d"
              ? tActivityLog("date14d")
              : tActivityLog("date30d"),
          );
        }
      }
      if (filters.eventTypes.length > 0) {
        const typeLabels = filters.eventTypes.map((type) => EVENT_CONFIG[type]?.label ?? type);
        parts.push(`${tActivityLog("exportEventTypesLabel")}: ${typeLabels.join(", ")}`);
      }
      const filterSummary = parts.join(" · ");

      // Fix: Date constructor months are 0-indexed; split gives 1-indexed month
      function toStartOfDay(yyyyMmDd: string): string {
        const [y, m, d] = yyyyMmDd.split("-").map(Number);
        return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
      }
      function toEndOfDay(yyyyMmDd: string): string {
        const [y, m, d] = yyyyMmDd.split("-").map(Number);
        return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
      }

      const body = {
        eventTypes: filters.eventTypes,
        locationOutcomes:
          canViewLocationTracking && filters.locationOutcomes.length > 0
            ? filters.locationOutcomes
            : undefined,
        ...(dateFrom ? { dateFrom: toStartOfDay(dateFrom) } : {}),
        ...(dateTo   ? { dateTo:   toEndOfDay(dateTo)     } : {}),
        projectName,
        filterSummary,
      };

      const exportPath = format === "pdf" ? "export-pdf" : "export-xlsx";
      const res = await fetch(`/api/projects/${projectId}/activity/${exportPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = formatPdfExportErrorToast(errBody, tActivityLog("exportFailed"));
        // 404 = no matching events — friendly non-error state
        if (res.status === 404) {
          setExportStep("empty");
          setExportErrorMsg(msg);
          return;
        }
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const ext = format === "pdf" ? "pdf" : "xlsx";
      const filename = `activity-log-${new Date().toISOString().split("T")[0]}.${ext}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      setExportStep("done");
      setTimeout(() => { setExportStep(null); setExportFormat(null); setShowExportConfirm(false); }, 1500);
    } catch (err) {
      console.error("[ActivityLog] export failed:", err);
      setExportErrorMsg(err instanceof Error ? err.message : tActivityLog("exportFailed"));
      setExportStep("error");
    }
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--neutral-0)" }}>

        {/* Page heading */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "14px 16px 12px",
            borderBottom: "1px solid var(--neutral-200)",
            flexShrink: 0,
            backgroundColor: "var(--neutral-0)",
          }}
        >
          <Activity size={17} style={{ color: "var(--neutral-600)", flexShrink: 0 }} aria-hidden />
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--neutral-900)", flex: 1 }}>
            {tActivityLog("pageTitle")}
          </h1>
        </div>

        {/* ── Toolbar ── */}
        <style>{`
          .al-toolbar { padding: 8px var(--page-padding-x); border-bottom: 1px solid var(--neutral-100); display: flex; flex-direction: column; gap: 8px; }
          .al-controls { display: flex; align-items: center; gap: 8px; }
          .al-search { position: relative; flex: 1 1 160px; min-width: 0; }
        `}</style>
        <div className="al-toolbar">
          <button
            type="button"
            onClick={() => setShowHeatmap(true)}
            aria-label={tHeatmap("openButtonAria")}
            title={tHeatmap("openButton")}
            style={{
              display: canViewLocationTracking ? "inline-flex" : "none",
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
          <div className="al-controls">
            {/* Search */}
            <div className="al-search">
              <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--neutral-400)", pointerEvents: "none" }} />
              <input
                type="search"
                placeholder="Search activity…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%", padding: "8px 8px 8px 30px", border: "1.5px solid var(--neutral-300)", borderRadius: 8, fontSize: 13, color: "var(--neutral-900)", background: "var(--neutral-0)", boxSizing: "border-box", outline: "none" }}
              />
            </div>

            {/* Filter button — matches issues/observations log style */}
            <button
              type="button"
              onClick={() => setShowFilters(true)}
              aria-label={tActivityLog("filterActivity")}
              title={tActivityLog("filterActivity")}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                height: 34, width: 34,
                borderRadius: "var(--radius-sm)",
                border: filterCount > 0 ? "1.5px solid var(--primary-500)" : "1px solid var(--neutral-300)",
                backgroundColor: filterCount > 0 ? "var(--primary-500)" : "var(--neutral-0)",
                color: filterCount > 0 ? "var(--neutral-0)" : "var(--neutral-700)",
                cursor: "pointer",
                position: "relative",
                flexShrink: 0,
                transition: "all 0.12s",
              }}
            >
              <Filter size={14} aria-hidden />
              {filterCount > 0 && (
                <span style={{
                  position: "absolute", top: -5, right: -5,
                  minWidth: 16, height: 16, borderRadius: 99,
                  backgroundColor: "var(--error-600)", color: "var(--neutral-0)",
                  fontSize: 10, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 4px",
                }}>
                  {filterCount}
                </span>
              )}
            </button>

            {/* Export button */}
            <button
              type="button"
              onClick={() => { setShowExportConfirm(true); setExportStep(null); }}
              aria-label="Export activity log"
              title="Export activity log"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                height: 34, padding: "0 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--neutral-300)",
                backgroundColor: "var(--neutral-0)",
                color: "var(--neutral-700)",
                cursor: "pointer",
                flexShrink: 0,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <FileDown size={14} aria-hidden />
              Export Log
            </button>

            {/* Clear all */}
            {hasActiveFilters && (
              <button onClick={resetFilters} aria-label="Clear filters" style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", color: "var(--neutral-500)", fontSize: 12, padding: "4px 2px", flexShrink: 0, whiteSpace: "nowrap" }}>
                <X size={12} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <ActivityFilterPanel
            filters={filters}
            onChange={setFilters}
            onClose={() => setShowFilters(false)}
            onClear={() => { setFilters(EMPTY_FILTERS); setShowFilters(false); }}
            canViewLocationTracking={canViewLocationTracking}
          />
        )}

        {/* Export confirm dialog */}
        {showExportConfirm && (
          <ActivityExportDialog
            activeFilters={filters}
            exportStep={exportStep}
            exportFormat={exportFormat}
            exportErrorMsg={exportErrorMsg}
            onExport={handleExport}
            onClose={() => { setShowExportConfirm(false); setExportStep(null); setExportFormat(null); setExportErrorMsg(""); }}
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
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--neutral-500)", fontSize: 13 }}>
              Loading activity…
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--error-600)", fontSize: 13 }}>
              {error}
            </div>
          )}

          {!loading && !error && filteredEvents.length === 0 && (
            <div style={{ padding: 48, textAlign: "center", color: "var(--neutral-400)", fontSize: 14 }}>
              {hasActiveFilters ? "No activity matches your search." : "No activity yet. Actions taken in this project will appear here."}
            </div>
          )}

          {!loading && filteredEvents.map((event) => (
            <ActivityCard
              key={event.id}
              event={event}
              projectId={projectId}
              canManageStatus={canManageStatus}
              currentUserId={currentUserId}
              currentUserDisplayName={currentUserDisplayName}
              currentUserRole={currentUserRole}
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
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>

      {canViewLocationTracking ? (
        <ActivityHeatmapModal
          open={showHeatmap}
          onClose={() => setShowHeatmap(false)}
          projectIds={[projectId]}
          scope="project"
        />
      ) : null}

    </>
  );
}

// ─── Activity Export Confirm Dialog ───────────────────────────────────────────

function ActivityExportDialog({
  activeFilters,
  exportStep,
  exportFormat,
  exportErrorMsg,
  onExport,
  onClose,
}: {
  activeFilters: ActivityFilters;
  exportStep: null | "generating" | "done" | "empty" | "error";
  exportFormat: "pdf" | "xlsx" | null;
  exportErrorMsg: string;
  onExport: (dateRange: DateRange, format: "pdf" | "xlsx") => void;
  onClose: () => void;
}) {
  const t = useTranslations("activityLog");
  const [dateRange, setDateRange] = useState<DateRange>(
    // Default to the current filter's date range, fall back to "all"
    activeFilters.dateRange.preset !== "all"
      ? activeFilters.dateRange
      : { preset: "all", customFrom: "", customTo: "" }
  );

  const activeEventTypeLabels = activeFilters.eventTypes.map((t) => {
    const cfg = EVENT_CONFIG[t];
    return cfg?.label ?? t;
  });

  const isRunning = exportStep === "generating";
  const isPdf = exportFormat !== "xlsx";

  const datePresets: { label: string; value: DatePreset }[] = [
    { label: t("dateAll"), value: "all" },
    { label: t("date7d"), value: "7d" },
    { label: t("date14d"), value: "14d" },
    { label: t("date30d"), value: "30d" },
    { label: t("dateCustom"), value: "custom" },
  ];

  const exportButtons = (
    <>
      <button
        onClick={() => onExport(dateRange, "pdf")}
        disabled={isRunning || (dateRange.preset === "custom" && !dateRange.customFrom && !dateRange.customTo)}
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
        {isRunning && exportFormat === "pdf" ? t("exportGeneratingShort") : t("exportSubmitPdf")}
      </button>
      <button
        onClick={() => onExport(dateRange, "xlsx")}
        disabled={isRunning || (dateRange.preset === "custom" && !dateRange.customFrom && !dateRange.customTo)}
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

  return createPortal(
    <>
      <div onClick={!isRunning ? onClose : undefined} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 600 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(440px, 94vw)", background: "var(--neutral-0)", borderRadius: 14,
        boxShadow: "var(--shadow-2)", zIndex: 601, overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "18px 20px 14px" }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--neutral-900)" }}>{t("exportDialogTitle")}</p>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--neutral-500)" }}>{t("exportDialogSubtitle")}</p>
          </div>
          {!isRunning && (
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--neutral-400)" }}>
              <X size={18} />
            </button>
          )}
        </div>

        <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Date range selector */}
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--neutral-500)" }}>{t("dateRange")}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {datePresets.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setDateRange({ ...dateRange, preset: value })}
                  disabled={isRunning}
                  style={{
                    padding: "5px 12px", borderRadius: 999, border: "1.5px solid",
                    borderColor: dateRange.preset === value ? "var(--primary-600)" : "var(--neutral-300)",
                    background: dateRange.preset === value ? "var(--primary-50)" : "var(--neutral-0)",
                    color: dateRange.preset === value ? "var(--primary-700)" : "var(--neutral-600)",
                    fontSize: 13, fontWeight: dateRange.preset === value ? 600 : 400, cursor: isRunning ? "default" : "pointer",
                  }}
                >{label}</button>
              ))}
            </div>
            {dateRange.preset === "custom" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                <input type="date" value={dateRange.customFrom} disabled={isRunning}
                  onChange={(e) => setDateRange({ ...dateRange, customFrom: e.target.value })}
                  style={{ flex: 1, padding: "7px 8px", border: "1.5px solid var(--neutral-300)", borderRadius: 8, fontSize: 13 }} />
                <span style={{ color: "var(--neutral-400)", fontSize: 12 }}>{t("dateTo")}</span>
                <input type="date" value={dateRange.customTo} disabled={isRunning}
                  onChange={(e) => setDateRange({ ...dateRange, customTo: e.target.value })}
                  style={{ flex: 1, padding: "7px 8px", border: "1.5px solid var(--neutral-300)", borderRadius: 8, fontSize: 13 }} />
              </div>
            )}
          </div>

          {/* Active filter notice */}
          {activeEventTypeLabels.length > 0 && (
            <div style={{ background: "var(--primary-50)", border: "1px solid var(--primary-200)", borderRadius: 8, padding: "10px 12px" }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--primary-700)" }}>{t("exportActiveFiltersNotice")}</p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--primary-600)" }}>{activeEventTypeLabels.join(", ")}</p>
            </div>
          )}

          {/* Status feedback */}
          {exportStep === "generating" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--neutral-50)", borderRadius: 8, border: "1px solid var(--neutral-200)" }}>
              <span className="animate-spin" style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--primary-600)", borderTopColor: "transparent", display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "var(--neutral-700)", fontWeight: 500 }}>
                {isPdf ? t("exportGeneratingPdf") : t("exportGeneratingExcel")}
              </span>
            </div>
          )}
          {exportStep === "done" && (
            <div style={{ padding: "10px 12px", background: "var(--success-50)", borderRadius: 8, border: "1px solid var(--success-200)" }}>
              <span style={{ fontSize: 13, color: "var(--success-700)", fontWeight: 600 }}>
                {isPdf ? t("exportDonePdf") : t("exportDoneExcel")}
              </span>
            </div>
          )}
          {exportStep === "empty" && (
            <div style={{ padding: "10px 12px", background: "var(--neutral-50)", borderRadius: 8, border: "1px solid var(--neutral-200)" }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-700)", fontWeight: 600 }}>{t("exportEmptyTitle")}</p>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--neutral-500)" }}>{t("exportEmptyHelp")}</p>
            </div>
          )}
          {exportStep === "error" && (
            <div style={{ padding: "10px 12px", background: "var(--error-50)", borderRadius: 8, border: "1px solid var(--error-200)" }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--error-700)", fontWeight: 600 }}>{t("exportFailed")}</p>
              {exportErrorMsg && <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--error-600)" }}>{exportErrorMsg}</p>}
            </div>
          )}

          {/* Actions — normal / error state */}
          {exportStep !== "done" && exportStep !== "empty" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onClose} disabled={isRunning}
                  style={{ flex: 1, padding: "10px", border: "1.5px solid var(--neutral-300)", borderRadius: 8, background: "var(--neutral-0)", color: "var(--neutral-600)", fontSize: 13, fontWeight: 600, cursor: isRunning ? "default" : "pointer", opacity: isRunning ? 0.5 : 1 }}>
                  {t("exportCancel")}
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {exportButtons}
              </div>
            </div>
          )}
          {exportStep === "empty" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={onClose}
                style={{ padding: "10px", border: "1.5px solid var(--neutral-300)", borderRadius: 8, background: "var(--neutral-0)", color: "var(--neutral-600)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
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

// ─── Activity Filter Panel ────────────────────────────────────────────────────

// Only the event types that are meaningful to filter on.
const FILTERABLE_EVENT_TYPES = [...FILTERABLE_ACTIVITY_EVENT_TYPES] as ActivityEventType[];

function ActivityFilterPanel({
  filters,
  onChange,
  onClose,
  onClear,
  canViewLocationTracking = false,
}: {
  filters: ActivityFilters;
  onChange: (f: ActivityFilters) => void;
  onClose: () => void;
  onClear: () => void;
  canViewLocationTracking?: boolean;
}) {
  const t = useTranslations("activityLog");
  const tHeatmap = useTranslations("activityHeatmap");
  const tCapture = useTranslations("captureMetadata");
  const datePresets: { label: string; value: DatePreset }[] = [
    { label: t("dateAll"), value: "all" },
    { label: t("date7d"), value: "7d" },
    { label: t("date14d"), value: "14d" },
    { label: t("date30d"), value: "30d" },
    { label: t("dateCustom"), value: "custom" },
  ];

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

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 400 }}
      />
      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(420px, 100vw)",
          background: "var(--neutral-0)",
          boxShadow: "var(--shadow-2)",
          zIndex: 401,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--neutral-200)", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Filter Activity</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--neutral-500)" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* ── Date Range ── */}
          <div>
            <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--neutral-500)" }}>{t("dateRange")}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {datePresets.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => onChange({ ...filters, dateRange: { ...filters.dateRange, preset: value } })}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    border: "1.5px solid",
                    borderColor: filters.dateRange.preset === value ? "var(--primary-600)" : "var(--neutral-300)",
                    background: filters.dateRange.preset === value ? "var(--primary-50)" : "var(--neutral-0)",
                    color: filters.dateRange.preset === value ? "var(--primary-700)" : "var(--neutral-600)",
                    fontSize: 13,
                    fontWeight: filters.dateRange.preset === value ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {filters.dateRange.preset === "custom" && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                <input
                  type="date"
                  value={filters.dateRange.customFrom}
                  onChange={(e) => onChange({ ...filters, dateRange: { ...filters.dateRange, customFrom: e.target.value } })}
                  style={{ flex: 1, padding: "7px 8px", border: "1.5px solid var(--neutral-300)", borderRadius: 8, fontSize: 13 }}
                />
                <span style={{ color: "var(--neutral-400)", fontSize: 12 }}>to</span>
                <input
                  type="date"
                  value={filters.dateRange.customTo}
                  onChange={(e) => onChange({ ...filters, dateRange: { ...filters.dateRange, customTo: e.target.value } })}
                  style={{ flex: 1, padding: "7px 8px", border: "1.5px solid var(--neutral-300)", borderRadius: 8, fontSize: 13 }}
                />
              </div>
            )}
          </div>

          {/* ── Event Type ── */}
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--neutral-500)" }}>Event Type</p>
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
                    {/* Checkbox */}
                    <span
                      style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: checked ? "none" : "1.5px solid var(--neutral-300)",
                        background: checked ? "var(--primary-600)" : "var(--neutral-0)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {checked && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {/* Icon */}
                    <span style={{
                      width: 28, height: 28, borderRadius: 7, background: cfg.bg, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: cfg.color,
                    }}>
                      {cfg.icon}
                    </span>
                    {/* Label */}
                    <span style={{ fontSize: 13, color: "var(--neutral-800)", fontWeight: checked ? 600 : 400 }}>
                      {cfg.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onChange({ ...filters, eventTypes: toggle(filters.eventTypes, type) })}
                      style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {canViewLocationTracking ? (
            <div>
              <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--neutral-500)" }}>{t("gpsSection.filterSection")}</p>
              <ActivityLocationOutcomeFilterSection
                selected={filters.locationOutcomes}
                onChange={(locationOutcomes) => onChange({ ...filters, locationOutcomes })}
                outcomeLabel={locationOutcomeLabel}
              />
            </div>
          ) : null}

        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--neutral-200)", display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={onClear}
            style={{ flex: 1, padding: "9px", border: "1.5px solid var(--neutral-300)", borderRadius: 8, background: "var(--neutral-0)", color: "var(--neutral-600)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Clear all
          </button>
          <button
            onClick={onClose}
            style={{ flex: 2, padding: "9px", border: "none", borderRadius: 8, background: "var(--primary-700)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Unit Activity Modal ──────────────────────────────────────────────────────
// Opened from the "View Activity" button inside MobileUnitDetailModal.
// Shows all activity for a specific unit in a centered dialog.

export function UnitActivityModal({
  projectId,
  unit,
  building,
  level,
  onClose,
  canViewLocationTracking = false,
}: {
  projectId: string;
  unit: string;
  building?: string;
  level?: string;
  onClose: () => void;
  canViewLocationTracking?: boolean;
}) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const tDashboardActivity = useTranslations("dashboardActivity");
  const tOffline = useTranslations("offlineIndicator");
  const { isOnline } = useOfflineStatus();

  function requireOnline(): boolean {
    if (isOnline) return true;
    toast.error(tOffline("offlineActionUnavailable"));
    return false;
  }

  const buildUrl = useCallback((cursor?: string) => {
    const p = new URLSearchParams({ unit, limit: "100" });
    if (building) p.set("building", building);
    if (level) p.set("level", level);
    if (cursor) p.set("cursor", cursor);
    return `/api/projects/${projectId}/activity?${p}`;
  }, [projectId, unit, building, level]);

  const refetchEvents = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const d = await fetch(buildUrl()).then((r) => r.json());
      const pending = await getPendingActivityEvents({ projectId, building, level, unit });
      const serverEvents = (d.events ?? []) as ActivityEvent[];
      setEvents(prepareActivityFeedForDisplay(pending as ActivityEvent[], serverEvents));
      setNextCursor(d.nextCursor ?? null);
    } catch {
      try {
        const pending = await getPendingActivityEvents({ projectId, building, level, unit });
        const dedupedPending = filterPendingInspectionEventsDeduped(pending as ActivityEvent[], []);
        if (dedupedPending.length > 0) {
          setEvents(dedupeActivityEventsForDisplay(dedupedPending as ActivityEvent[]));
          setNextCursor(null);
          setError(false);
          return;
        }
      } catch {
        // fall through
      }
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [buildUrl, projectId, building, level, unit]);

  useEffect(() => {
    void refetchEvents();
  }, [refetchEvents]);

  useEffect(() => {
    const onInspectionsUpdated = () => {
      void refetchEvents();
    };
    window.addEventListener("inspections:updated", onInspectionsUpdated);
    return () => window.removeEventListener("inspections:updated", onInspectionsUpdated);
  }, [refetchEvents]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    if (!requireOnline()) return;
    setLoadingMore(true);
    try {
      const d = await fetch(buildUrl(nextCursor)).then((r) => r.json());
      setEvents((prev) =>
        dedupeActivityEventsForDisplay([
          ...prev,
          ...((d.events ?? []) as ActivityEvent[]),
        ]),
      );
      setNextCursor(d.nextCursor ?? null);
    } catch { /* silent */ } finally { setLoadingMore(false); }
  };

  const handleExport = async () => {
    if (exporting) return;
    if (!requireOnline()) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/activity/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit,
          building,
          level,
          projectName: "Project",
          filterSummary: locationLabel,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = formatPdfExportErrorToast(errBody, tDashboardActivity("exportFailed"));
        console.error("[UnitActivity] export failed:", msg);
        toast.error(msg);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `unit-activity-${unit}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : tDashboardActivity("exportFailed");
      console.error("[UnitActivity] export error:", err);
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  const locationLabel = [building, level, unit].filter(Boolean).join(" · ");

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 800, backgroundColor: "rgba(0,0,0,0.45)" }}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Activity for unit ${unit}`}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 801,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "min(600px, 100%)",
            maxHeight: "min(720px, calc(100dvh - 32px))",
            backgroundColor: "var(--neutral-0)",
            borderRadius: 16,
            boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            pointerEvents: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--neutral-200)",
            flexShrink: 0,
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--neutral-900)" }}>
                Unit Activity
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--neutral-500)" }}>
                {locationLabel}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {events.length > 0 && (
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  title="Export as PDF"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    border: "1.5px solid var(--neutral-300)",
                    borderRadius: 8,
                    background: "var(--neutral-0)",
                    color: exporting ? "var(--neutral-400)" : "var(--neutral-700)",
                    cursor: exporting ? "default" : "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    opacity: exporting ? 0.7 : 1,
                  }}
                >
                  <FileDown size={13} />
                  {exporting ? "Generating…" : "Export PDF"}
                </button>
              )}
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--neutral-500)", padding: 4, display: "flex", alignItems: "center" }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && (
              <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "var(--neutral-400)" }}>
                Loading activity…
              </div>
            )}
            {!loading && error && (
              <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: "var(--error-600)" }}>
                Failed to load activity.
              </div>
            )}
            {!loading && !error && events.length === 0 && (
              <div style={{ padding: 48, textAlign: "center", fontSize: 14, color: "var(--neutral-400)" }}>
                No activity recorded for this unit yet.
              </div>
            )}
            {!loading && events.map((event) => (
              <ActivityCard
                key={event.id}
                event={event}
                projectId={projectId}
                canManageStatus={false}
                disableUnitPreview
                canViewLocationTracking={canViewLocationTracking}
              />
            ))}
            {nextCursor && !loading && (
              <div style={{ padding: 16, textAlign: "center" }}>
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{
                    padding: "8px 20px",
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
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

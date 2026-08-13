"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, useId, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronsDown, ChevronsUp, Loader2, Building2, MapPin, Layers,
  UnfoldVertical, FoldVertical,
  CircleAlert, AlertCircle, AlertTriangle, CheckCircle2, XCircle, Activity,
  Plus, MessageSquare, ClipboardCheck, Clipboard, Hammer, Copy, Package, X, Circle, ChevronUp, Paperclip,
  FlaskConical,
  CheckSquare2, Square, Minus, Pencil, Trash2, Clock, WifiOff, Image as ImageIcon, Eye, RotateCcw, FileCheck,
} from "lucide-react";
import { ScopeInspectionShieldIcon } from "@/components/projects/ScopeInspectionShieldIcon";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useIsBrowser } from "@/hooks/use-is-browser";
import { useDesktopDetailPanel } from "@/hooks/use-desktop-detail-panel";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { useRegisterOfflineCacheView } from "@/hooks/use-register-offline-cache-view";
import { OFFLINE_SNAPSHOT_SYNCED_EVENT, OFFLINE_SYNC_COMPLETE_EVENT } from "@/lib/offline/events";
import { enrichBodyWithActivityLocation } from "@/lib/activity/enrich-body-with-activity-location";
import { markUnitAlbumTouched } from "@/lib/offline/album-warm-session";
import { UNIT_ALBUM_UPDATED_EVENT } from "@/lib/media/unit-album-client-cache";
import {
  isInspectionOverlayChromeSuppressed,
  subscribeInspectionOverlayChrome,
} from "@/lib/inspections/inspection-overlay-chrome";
import {
  effectiveBoolean,
  nextPinnedBoolean,
} from "@/lib/projects/preserve-mobile-unit-chrome";
import { UnitActivityModal } from "@/components/projects/ActivityLogClient";
import type { AnomalyRow } from "@/components/ai/AIAnomalyBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  unitInstallCompletePercent,
  unitQtyInstallSubPercent,
  countInstallCompleteScopes,
  type ScopeStage,
  type ScopeStatus,
} from "@/lib/unit-scope-progress";
import { SCOPE_STATUS_DOT_COLOR } from "@/lib/scope-square-style";
import type { InspectionStatus, ScopeTileInspectionCategory } from "@/lib/scope-square-style";
import {
  type CombinedScopeOption,
  getScopeCombinedOptions,
  scopeTypeSkipsAssemblyStage,
  combinedOptionDisplay,
  isCombinedMatch,
  isInstallCompleteCombinedOptionKey,
} from "@/lib/scope-combined-options";
import {
  statusPickRequiresSubcontractorAssignment,
  isTransitionToInstallCompleteScope,
} from "@/lib/scope-install-complete-gate";
import { isFieldLeadershipRole } from "@/lib/permissions";
import { useObservationCatalog } from "@/lib/observations/use-observation-catalog";
import { resolveObservationTypeBadgeMeta } from "@/lib/observations/observationDisplay";
import { ScopeStatusSquare } from "@/components/projects/ScopeStatusSquare";
import { getScopeSquareStyle } from "@/lib/scope-square-style";
import { AddObservationModal } from "@/components/projects/AddObservationModal";
import { AddIssueModal } from "@/components/projects/AddIssueModal";
import { CustomSiteLocationsSection } from "@/components/projects/CustomSiteLocationsSection";
import { CustomSiteLocationsProvider } from "@/components/projects/CustomSiteLocationsProvider";
import {
  LevelLocationSections,
  LevelCustomSiteLocationsStrip,
  LevelScopeBreakdownPanel,
} from "@/components/projects/LevelLocationSections";
import { BuildingCustomSiteLocationsStrip } from "@/components/projects/BuildingCustomSiteLocationsStrip";
import { LocationBuilderMeta } from "@/components/projects/LocationBuilderMeta";
import { shouldShowCustomSiteLocations, cardMatchesLocationKindFilters } from "@/lib/location-kind-filter";
import {
  cardLocationBuilderFields,
  isDefinedLocationBuilderField,
  joinLocationBuilderMetaParts,
  labeledLocationBuilderMetaParts,
  sharedLocationBuilderFields,
} from "@/lib/location-builder-display";
import { AddLocationIssueModal } from "@/components/projects/AddLocationIssueModal";
import { AddLocationObservationModal } from "@/components/projects/AddLocationObservationModal";
import { ObservationDetailModal } from "@/components/projects/ObservationDetailModal";
import { IssueDetailModal } from "@/components/projects/IssueDetailModal";
import { IssueLogRow } from "@/components/projects/issues/IssueLogRow";
import { UnitPhotoAlbum } from "@/components/projects/UnitPhotoAlbum";
import { StatusUpdatePhotoPrompt, type StatusUpdatePhotoAssignment } from "@/components/projects/StatusUpdatePhotoPrompt";
import { SubcontractorPicker } from "@/components/projects/SubcontractorPicker";
import type { BurnLocation } from "@/lib/image-utils";
import {
  FIELD_TRACKER_SEARCH_DEBOUNCE_MS,
  FIELD_TRACKER_UNITS_PAGE_LIMIT,
} from "@/lib/field-tracker-units";
import { LoadingRowsToast } from "@/components/ui/LoadingRowsToast";
import { toast } from "sonner";
import {
  BLOCKING_ISSUE_OPEN_CODE,
} from "@/lib/blocking-issue-code";
import { ScopeInspectionsBand } from "@/components/projects/inspections/ScopeInspectionsBand";
import {
  ScopeInspectionProvider,
  useScopeInspection,
} from "@/components/projects/inspections/ScopeInspectionProvider";
import { fetchUnitsWithGridInspection } from "@/lib/inspections/fetch-units-with-grid-inspection";
import {
  mergeGridInspectionFromSubmissions,
  localScopeUpdatesFromSubmission,
} from "@/lib/inspections/scope-grid-inspection-display";
import { listByProject, type InspectionSubmission } from "@/lib/inspections/submissionsApi";
import { ProjectInspectionSubmissionsProvider } from "@/components/projects/inspections/ProjectInspectionSubmissionsContext";
import {
  attemptNumberForSubmission,
  describeCategoryLabel,
  latestScopeInspectionStatusSubmission,
  resolveScopeInspectionHubDisplay,
  scopeInspectionHubRetryEligible,
  submissionAuthoritativeForScopeInspectionStatus,
  scopeInstallLockedByClearInspection,
  scopeStatusHubInstallOptionsLocked,
  scopeStatusHubTriggerDisabled,
} from "@/lib/inspections/scope-inspection-display";
import { UnitInspectionsSummary } from "@/components/projects/inspections/UnitInspectionsSummary";
import { StartInspectionSheet } from "@/components/projects/inspections/StartInspectionSheet";
import { unitHasFlooringScope } from "@/lib/inspections/flooring-scope-eligibility";
import { mergeUnitGypcreteOntoCards } from "@/lib/inspections/unit-gypcrete-grid-display";
import type { UnitGypcreteGridStatus } from "@/lib/inspections/unit-gypcrete-grid-display";
import { GypcreteGridDropletIcon } from "@/components/projects/GypcreteGridDropletIcon";
import { InspectionFillOverlay } from "@/components/projects/inspections/InspectionFillOverlay";
import type { StoredForm } from "@/lib/forms/formsApi";
import { readSnapshotData, readSnapshotUnitsForProject } from "@/lib/offline/snapshot-cache";
import { normalizeSnapshotObservation, type SnapshotObservationRow } from "@/lib/offline/normalize-snapshot-observation";

export { FIELD_TRACKER_SEARCH_DEBOUNCE_MS, FIELD_TRACKER_UNITS_PAGE_LIMIT } from "@/lib/field-tracker-units";

// ── Pending scope-status pick (held while StatusUpdatePhotoPrompt is shown) ───

interface PendingScopePick {
  updates: Partial<ScopeRow>;
  scopeName: string;
  statusDisplayLabel: string;
  requireSubcontractorAssignment: boolean;
}

interface PendingInstancePick {
  updates: Partial<InstanceUpdates>;
  scopeName: string;
  statusDisplayLabel: string;
  requireSubcontractorAssignment: boolean;
}

function mergeStatusUpdateAssignment(
  updates: Partial<ScopeRow>,
  assignment?: StatusUpdatePhotoAssignment,
): { updates: Partial<ScopeRow>; hints?: { subcontractorDisplayName?: string } } {
  if (!assignment) return { updates };
  return {
    updates: { ...updates, unifierSubId: assignment.unifierSubId },
    hints: assignment.subcontractorDisplayName
      ? { subcontractorDisplayName: assignment.subcontractorDisplayName }
      : undefined,
  };
}

function buildPendingScopePickFields(
  scope: Pick<ScopeRow, "scopeStage" | "scopeStatus" | "unifierSubId">,
  updates: Partial<ScopeRow>,
  scopeName: string,
  skipAssembly: boolean,
): PendingScopePick {
  return {
    updates,
    scopeName,
    statusDisplayLabel: combinedOptionDisplay(
      updates.scopeStage !== undefined ? updates.scopeStage : scope.scopeStage,
      updates.scopeStatus !== undefined ? updates.scopeStatus : scope.scopeStatus,
      skipAssembly,
    ).label,
    requireSubcontractorAssignment: statusPickRequiresSubcontractorAssignment(
      scope.unifierSubId,
      scope.scopeStage,
      scope.scopeStatus,
      updates,
    ),
  };
}

function buildPendingInstancePickFields(
  parentUnifierSubId: string | null | undefined,
  instance: Pick<SubScopeInstance, "scopeStage" | "scopeStatus">,
  updates: Partial<InstanceUpdates>,
  scopeName: string,
  statusDisplayLabel: string,
): PendingInstancePick {
  return {
    updates,
    scopeName,
    statusDisplayLabel,
    requireSubcontractorAssignment: statusPickRequiresSubcontractorAssignment(
      parentUnifierSubId,
      instance.scopeStage,
      instance.scopeStatus,
      updates,
    ),
  };
}

// ── Shared filter types ────────────────────────────────────────────────────────
// Defined here (source of truth) and re-exported by UnitsPageClient.

export interface ScopeTypeOption {
  id: string;
  code: string;
  name: string;
  /** Qty per unit for this scope type within this unit type.
   *  null if all rows have null qty, or if qty varies across units. */
  qtyPerUnit: number | null;
  /** true when different units of this type have different qtys for this scope. */
  qtyVaries: boolean;
  /** Unit of measure from the first row with a non-null uom. */
  uom: { code: string; name: string } | null;
}

export interface FilterOptions {
  scopeTypeNames: string[];
  unitTypes: string[];
  buildings: string[];
  buildingLevels: Record<string, string[]>;
  /** Distinct defined build phases across loaded location cards. */
  buildPhases: string[];
  /** Distinct defined areas across loaded location cards. */
  areas: string[];
  /** Scope types available for each unit type — used by the sub-scopes wizard. */
  scopeTypesByUnitType: Record<string, ScopeTypeOption[]>;
  /** Maps scope type name → ALL sub-scope names (drives accordion scope filter). */
  scopeSubMap: Record<string, string[]>;
  /** Scope type names that have at least one open issue tagged to them (for issue scope filter). */
  issueScopeTypeNames: string[];
  /** Sub-scope names that have at least one open issue tagged to them (for issue sub-scope filter). */
  issueSubScopeNames: string[];
  /** Maps scope type name → sub-scope names with open issues (drives unified inline-expand filter UI). */
  issueScopeSubMap: Record<string, string[]>;
  /** Unique Unifier sub IDs (unifierSubId) present on any scope across all loaded units.
   * Resolved to display names at render time via the SubcontractorPicker cache. */
  subcontractorIds: string[];
}

export interface UnitIssueMeta {
  hasIssues: boolean;
  hasOpenIssues: boolean;
  hasBlockingIssues: boolean;             // isBlockingWork=true and status=OPEN
  issueTypes: string[];                   // all unique issue types across any status
  responsibleParties: string[];
  statuses: string[];                     // e.g. ["OPEN", "RESOLVED"]
  scopeRowIdsWithIssues: string[];        // projectRowIds that have tagged issues (open only)
  scopeRowIdsWithBlockingIssues: string[]; // subset: rows with at least one blocking open issue
  /** Sub-scope instance IDs that have at least one open issue tagged to them. */
  subScopeInstanceIdsWithIssues: string[];
  /** Sub-scope instance IDs with at least one open blocking issue tagged to them. */
  subScopeInstanceIdsWithBlockingIssues: string[];
}

export interface ActiveFilters {
  stages: string[];
  scopeTypeNames: string[];
  scopeSubNames: string[];       // sub-scope names within the selected scope types
  unitTypes: string[];
  /** When non-empty, only matching location categories are shown. */
  locationKinds: import("@/lib/location-kind-filter").LocationKindFilter[];
  buildings: string[];
  levels: string[]; // compound: "building::level"
  /** Location Builder build phase values (card or scope). Empty = no filter. */
  buildPhases: string[];
  /** Location Builder area values. Empty = no filter. */
  areas: string[];
  // Issue filters
  issueTypes: string[];          // SUBSTRATE_CONDITION | DAMAGED_MATERIALS | ...
  responsibleParties: string[];  // CP_BUILD | ELECTRICIAN | ...
  issueStatuses: string[];       // OPEN | RESOLVED
  issueBlocking: boolean | null; // true=blocking only, false=non-blocking only, null=any
  issueScopeTypeNames: string[]; // scope type names with issues tagged to them
  issueSubScopeNames: string[];  // sub-scope names with issues tagged to them
  /** Inspection status filter: "PASSED" | "FAILED" | "READY" — show only locations with
   *  at least one scope whose inspectionStatus matches. Set from the overview deep-link. */
  inspectionStatuses: string[];
  /** Calibration outcome filter: "PASSED" | "FAILED" — scopes with a calibration record. */
  calibrationStatuses: string[];
  /**
   * Subcontractor assignment filter.
   * "yes" = at least one scope has a Unifier sub assigned.
   * "no"  = no scopes have a sub assigned.
   * null  = no filter (show all).
   */
  subcontractorAssigned: "yes" | "no" | null;
  /**
   * Filter by specific Unifier sub IDs (matches scope.unifierSubId).
   * Empty = no filter (show all).
   */
  subcontractorIds: string[];
  /** When true, show only locations that have at least one issue (open or resolved). */
  unitsWithIssuesOnly: boolean;
}

export type { InspectionStatus };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SubScopeInstance {
  id: string;
  subScopeId: string;
  subScope: { id: string; name: string; displayOrder: number; unitType: string; scopeTypeId: string };
  qty: number | null;
  scopeStage: ScopeStage;
  scopeStatus: ScopeStatus;
  inspectionStatus: InspectionStatus;
}

export interface ClearInspectionResult {
  id: string;
  status: "PASSED" | "FAILED";
  createdAt: string;
}

export interface ScopeRow {
  id: string;
  scopeType: { id: string; code: string; name: string; canonicalScopeType?: { id: string; code: string; displayName: string } | null } | null;
  description: string;
  qty: number | null;
  uom: { code: string; name: string } | null;
  percentComplete: number | null;
  installer: { name: string } | null;
  /** Unifier subcontractor ID (UNIFIER_UXSUB.ID). Name resolved at render time. */
  unifierSubId: string | null;
  shipPhase: string;
  buildPhase: string;
  area: string;
  scopeStage: ScopeStage;
  scopeStatus: ScopeStatus;
  inspectionStatus: InspectionStatus;
  /** Client/API derived from latest submission — drives type-aware grid shields. */
  gridInspectionStatus?: InspectionStatus | null;
  latestInspectionCategory?: ScopeTileInspectionCategory | null;
  /** Newest calibration submission outcome for this scope (from project submissions merge). */
  latestCalibrationOutcome?: "PASS" | "FAIL" | null;
  subScopeInstances: SubScopeInstance[];
  clearInspection: ClearInspectionResult | null;
  /** Set by offline write-through when a unit-status mutation is queued but not yet synced. */
  _pendingSync?: boolean;
}

export const EMPTY_ISSUE_META: UnitIssueMeta = {
  hasIssues: false, hasOpenIssues: false, hasBlockingIssues: false,
  issueTypes: [], responsibleParties: [], statuses: [],
  scopeRowIdsWithIssues: [],
  scopeRowIdsWithBlockingIssues: [],
  subScopeInstanceIdsWithIssues: [],
  subScopeInstanceIdsWithBlockingIssues: [],
};

function scopeRowBlockingInstallComplete(scopeRowId: string, issueMeta: UnitIssueMeta): boolean {
  return (issueMeta.scopeRowIdsWithBlockingIssues ?? []).includes(scopeRowId);
}

function subScopeInstanceBlockingInstallComplete(
  issueMeta: UnitIssueMeta,
  scopeRowId: string,
  instanceId: string
): boolean {
  return (
    scopeRowBlockingInstallComplete(scopeRowId, issueMeta) ||
    (issueMeta.subScopeInstanceIdsWithBlockingIssues ?? []).includes(instanceId)
  );
}

function toastInstallCompletePatchError(
  t: (key: string) => string,
  status: number,
  errBody: unknown,
): void {
  if (status !== 422 || !errBody || typeof errBody !== "object") return;
  const code = (errBody as { code?: string }).code;
  if (code === BLOCKING_ISSUE_OPEN_CODE) {
    toast.error(t("installCompleteBlockedByIssueToast"));
  }
}

// Orange used for non-blocking issue indicators (triangle, icons, borders).
// Distinct from error-red (#dc2626 / #ef4444) so users can differentiate at a glance.
const ISSUE_COLOR_BLOCKING    = "#dc2626"; // red  — isBlockingWork=true
const ISSUE_COLOR_NONBLOCKING = "#ea580c"; // orange — isBlockingWork=false
const ISSUE_TRIANGLE_BLOCKING    = "#ef4444"; // red triangle fill
const ISSUE_TRIANGLE_NONBLOCKING = "#f97316"; // orange triangle fill

function computeIssueMeta(issues: IssueSummary[]): UnitIssueMeta {
  if (!issues.length) return EMPTY_ISSUE_META;
  const openIssues = issues.filter((i) => i.status === "OPEN");
  const blockingOpen = openIssues.filter((i) => i.isBlockingWork);
  return {
    hasIssues: issues.length > 0,
    hasOpenIssues: openIssues.length > 0,
    hasBlockingIssues: blockingOpen.length > 0,
    issueTypes: [...new Set(issues.map((i) => i.issueType))],
    responsibleParties: [...new Set(issues.flatMap((i) =>
      i.responsibleParties?.length ? i.responsibleParties : [i.responsibleParty],
    ))],
    statuses: [...new Set(issues.map((i) => i.status))],
    scopeRowIdsWithIssues: [...new Set(openIssues.flatMap((i) => i.scopeTags.map((t) => t.row.id)))],
    scopeRowIdsWithBlockingIssues: [...new Set(blockingOpen.flatMap((i) => i.scopeTags.map((t) => t.row.id)))],
    subScopeInstanceIdsWithIssues: [],
    subScopeInstanceIdsWithBlockingIssues: [
      ...new Set(
        blockingOpen.flatMap((i) =>
          (i.subScopeTags ?? [])
            .map((t) => t.subScopeInstance?.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      ),
    ],
  };
}

export interface UnitCard {
  key: string;
  building: string;
  level: string;
  unit: string;
  area: string;
  buildPhase: string;
  unitType: string;
  scopes: ScopeRow[];
  issueMeta: UnitIssueMeta;
  locationType: { id: string; code: string; name: string } | null;
  /** Grid droplet — undefined hides icon (no flooring scope); null = not performed. */
  gypcreteInspectionStatus?: UnitGypcreteGridStatus;
}

interface RawRow {
  id: string;
  building: string; level: string; unit: string; area: string; unitType: string;
  description: string;
  scopeType: { id: string; code: string; name: string; canonicalScopeType?: { id: string; code: string; displayName: string } | null } | null;
  qty: number | null;
  uom: { code: string; name: string } | null;
  percentComplete: number | null;
  installer: { name: string } | null;
  unifierSubId?: string | null;
  shipPhase: string; buildPhase: string;
  scopeStage: ScopeStage; scopeStatus: ScopeStatus;
  inspectionStatus: InspectionStatus;
  gridInspectionStatus?: InspectionStatus | null;
  latestInspectionCategory?: ScopeTileInspectionCategory | null;
  subScopeInstances: SubScopeInstance[];
  rowIndex: number;
  issueMeta?: UnitIssueMeta;
  clearInspection?: ClearInspectionResult | null;
  _pendingSync?: boolean;
  locationType?: { id: string; code: string; name: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Show building/zone in unit location rows only when the project has multiple buildings (single-building projects omit it). */
function shouldShowBuildingInLocationLine(cards: UnitCard[]): boolean {
  const distinct = new Set<string>();
  for (const c of cards) {
    const b = (c.building ?? "").trim();
    if (b) distinct.add(b);
  }
  return distinct.size > 1;
}

function distinctUnitCountFromRows(rows: RawRow[]): number {
  const keys = new Set(rows.map((r) => `${r.building}|${r.level}|${r.unit}`));
  return keys.size;
}

/** Location type code that identifies common area rows (vs regular unit rows). */
const COMMON_AREA_CODE = "C";

/** Returns true when a card's location type marks it as a common area. */
function isCommonAreaCard(card: UnitCard): boolean {
  return card.locationType?.code === COMMON_AREA_CODE;
}

function groupIntoCards(rows: RawRow[]): UnitCard[] {
  const map = new Map<string, UnitCard>();
  for (const row of rows) {
    const key = `${row.building}|${row.level}|${row.unit}`;
    if (!map.has(key)) {
      map.set(key, {
        key, building: row.building, level: row.level, unit: row.unit,
        area: row.area, buildPhase: row.buildPhase, unitType: row.unitType, scopes: [],
        issueMeta: row.issueMeta ? { ...EMPTY_ISSUE_META, ...row.issueMeta } : EMPTY_ISSUE_META,
        locationType: row.locationType ?? null,
      });
    } else {
      const card = map.get(key)!;
      if (isDefinedLocationBuilderField(row.area) && !isDefinedLocationBuilderField(card.area)) {
        card.area = row.area;
      }
      if (isDefinedLocationBuilderField(row.buildPhase) && !isDefinedLocationBuilderField(card.buildPhase)) {
        card.buildPhase = row.buildPhase;
      }
    }
    map.get(key)!.scopes.push({
      id: row.id,
      scopeType: row.scopeType,
      description: row.description,
      qty: row.qty,
      uom: row.uom,
      percentComplete: row.percentComplete,
      installer: row.installer,
      unifierSubId: row.unifierSubId ?? null,
      shipPhase: row.shipPhase,
      buildPhase: row.buildPhase,
      area: row.area,
      scopeStage: row.scopeStage,
      scopeStatus: row.scopeStatus,
      inspectionStatus: row.inspectionStatus,
      gridInspectionStatus: row.gridInspectionStatus ?? null,
      latestInspectionCategory: row.latestInspectionCategory ?? null,
      subScopeInstances: row.subScopeInstances ?? [],
      clearInspection: row.clearInspection ?? null,
      _pendingSync: row._pendingSync,
    });
  }
  return Array.from(map.values());
}

function clampPct(val: number | null): number {
  return val == null ? 0 : Math.min(100, Math.max(0, val));
}

/** Pill-track colors for mobile unit card (matches spec blue / neutral track). */
const MOBILE_UNIT_PROGRESS_TRACK = "var(--neutral-300)";
const MOBILE_UNIT_PROGRESS_FILL = "var(--primary-500)";

/** Filled control for `units.viewActivity` — no strokes or button shadows. */
const VIEW_ACTIVITY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 min-h-[var(--min-touch)] rounded-[var(--radius-md)] border-[3px] border-[var(--blue-600)] bg-[var(--color-secondary-subtle)] px-4 text-[length:var(--text-body)] font-extrabold text-[var(--blue-700)] cursor-pointer transition-colors hover:bg-[var(--color-secondary-muted)] active:bg-[var(--blue-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2";

const TYPE_PALETTES = [
  { bg: "#dbeafe", text: "#1d4ed8" }, { bg: "#d1fae5", text: "#065f46" },
  { bg: "#fef3c7", text: "#92400e" }, { bg: "#ede9fe", text: "#5b21b6" },
  { bg: "#fce7f3", text: "#9d174d" }, { bg: "var(--warning-100)", text: "var(--warning-700)" },
  { bg: "#e0f2fe", text: "#0369a1" }, { bg: "#f0fdf4", text: "#166534" },
];
export function unitTypeColor(t: string): { bg: string; text: string } {
  if (!t) return { bg: "var(--neutral-100)", text: "var(--neutral-500)" };
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return TYPE_PALETTES[h % TYPE_PALETTES.length];
}

function buildingLabelTextColor(stripe: string): string {
  return stripe === "var(--building-c)" ? "var(--color-text-primary)" : "var(--color-text-inverse)";
}

function extractFilterOptions(cards: UnitCard[]): FilterOptions {
  const scopeNames = new Set<string>();
  const unitTypes = new Set<string>();
  const buildings = new Set<string>();
  const buildingLevels: Record<string, Set<string>> = {};
  const subcontractorIdsSet = new Set<string>();
  // unitType → scopeTypeId → base scope info (id, code, name)
  const scopeBaseByUnitType: Record<string, Map<string, { id: string; code: string; name: string }>> = {};
  // unitType → scopeTypeId → all qty values seen (to detect varies)
  const qtyByScope: Record<string, Map<string, Set<number | null>>> = {};
  // unitType → scopeTypeId → first non-null uom
  const uomByScope: Record<string, Map<string, { code: string; name: string } | null>> = {};
  // All scope → sub-scope map (for main scope accordion filter)
  const scopeSubMapRaw: Record<string, Set<string>> = {};
  // Issue-specific scope/sub-scope options
  const issueScopeTypeNamesSet = new Set<string>();
  const issueSubScopeNamesSet = new Set<string>();
  const issueScopeSubMapRaw: Record<string, Set<string>> = {};
  const buildPhasesSet = new Set<string>();
  const areasSet = new Set<string>();

  for (const card of cards) {
    const { buildPhase, area } = cardLocationBuilderFields(card);
    if (buildPhase) buildPhasesSet.add(buildPhase);
    if (area) areasSet.add(area);
    if (card.unitType && !isCommonAreaCard(card)) unitTypes.add(card.unitType);
    const bKey = (card.building ?? "").trim() || MISSING_LOCATION_LABEL;
    buildings.add(bKey);
    const lKey = (card.level ?? "").trim() || MISSING_LOCATION_LABEL;
    if (!buildingLevels[bKey]) buildingLevels[bKey] = new Set();
    buildingLevels[bKey].add(lKey);
    const scopeRowIdsWithIssues = new Set(card.issueMeta.scopeRowIdsWithIssues);
    const subScopeIdsWithIssues = new Set(card.issueMeta.subScopeInstanceIdsWithIssues);
    for (const scope of card.scopes) {
      if (scope.unifierSubId) subcontractorIdsSet.add(scope.unifierSubId);
      if (scope.scopeType?.name) scopeNames.add(scope.scopeType.name);
      if (card.unitType && scope.scopeType) {
        const ut = card.unitType;
        const stId = scope.scopeType.id;

        if (!scopeBaseByUnitType[ut]) scopeBaseByUnitType[ut] = new Map();
        if (!scopeBaseByUnitType[ut].has(stId)) {
          scopeBaseByUnitType[ut].set(stId, scope.scopeType);
        }

        if (!qtyByScope[ut]) qtyByScope[ut] = new Map();
        if (!qtyByScope[ut].has(stId)) qtyByScope[ut].set(stId, new Set());
        qtyByScope[ut].get(stId)!.add(scope.qty);

        if (!uomByScope[ut]) uomByScope[ut] = new Map();
        if (!uomByScope[ut].has(stId) && scope.uom) {
          uomByScope[ut].set(stId, scope.uom);
        }
      }
      // Collect scope types that have open issues
      const scopeTypeName = scope.scopeType?.name;
      // Build all-scope sub-map (for main scope filter accordion)
      if (scopeTypeName) {
        if (!scopeSubMapRaw[scopeTypeName]) scopeSubMapRaw[scopeTypeName] = new Set();
        for (const inst of scope.subScopeInstances) {
          scopeSubMapRaw[scopeTypeName].add(inst.subScope.name);
        }
      }
      if (scopeRowIdsWithIssues.has(scope.id) && scopeTypeName) {
        issueScopeTypeNamesSet.add(scopeTypeName);
        if (!issueScopeSubMapRaw[scopeTypeName]) issueScopeSubMapRaw[scopeTypeName] = new Set();
      }
      // Collect sub-scope names that have open issues (mapped to their parent scope)
      for (const inst of scope.subScopeInstances) {
        if (subScopeIdsWithIssues.has(inst.id)) {
          issueSubScopeNamesSet.add(inst.subScope.name);
          if (scopeTypeName) {
            if (!issueScopeSubMapRaw[scopeTypeName]) issueScopeSubMapRaw[scopeTypeName] = new Set();
            issueScopeSubMapRaw[scopeTypeName].add(inst.subScope.name);
          }
        }
      }
    }
  }

  return {
    scopeTypeNames: Array.from(scopeNames).sort(),
    scopeSubMap: Object.fromEntries(
      Object.entries(scopeSubMapRaw).map(([k, v]) => [k, Array.from(v).sort()])
    ),
    unitTypes: Array.from(unitTypes).sort(),
    buildings: Array.from(buildings).sort(sortLocationKeys),
    buildingLevels: Object.fromEntries(
      Object.entries(buildingLevels).map(([b, ls]) => [b, Array.from(ls).sort(sortLocationKeys)])
    ),
    buildPhases: Array.from(buildPhasesSet).sort((a, b) => a.localeCompare(b)),
    areas: Array.from(areasSet).sort((a, b) => a.localeCompare(b)),
    scopeTypesByUnitType: Object.fromEntries(
      Object.entries(scopeBaseByUnitType).map(([ut, scopeMap]) => [
        ut,
        Array.from(scopeMap.entries())
          .map(([stId, st]) => {
            const qtys = qtyByScope[ut]?.get(stId) ?? new Set<number | null>();
            const nonNullQtys = [...qtys].filter((q): q is number => q !== null);
            const qtyVaries = nonNullQtys.length > 1;
            const qtyPerUnit = qtyVaries ? null : (nonNullQtys[0] ?? null);
            const uom = uomByScope[ut]?.get(stId) ?? null;
            return { ...st, qtyPerUnit, qtyVaries, uom };
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      ])
    ),
    issueScopeTypeNames: Array.from(issueScopeTypeNamesSet).sort(),
    issueSubScopeNames: Array.from(issueSubScopeNamesSet).sort(),
    issueScopeSubMap: Object.fromEntries(
      Object.entries(issueScopeSubMapRaw).map(([k, v]) => [k, Array.from(v).sort()])
    ),
    subcontractorIds: Array.from(subcontractorIdsSet),
  };
}

export function applyUnitCardFilters(
  cards: UnitCard[],
  search: string,
  filters: ActiveFilters,
  /** When true, rows were loaded with `?search=` — skip redundant client text filter. */
  skipTextSearch = false
): UnitCard[] {
  let result = cards;
  if (!skipTextSearch && search.trim()) {
    const q = search.toLowerCase();
    result = result.filter((c) =>
      c.unit.toLowerCase().includes(q) ||
      c.building.toLowerCase().includes(q) ||
      c.level.toLowerCase().includes(q) ||
      c.unitType.toLowerCase().includes(q) ||
      c.scopes.some((s) => s.scopeType?.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    );
  }
  if (filters.stages.length > 0) {
    result = result.filter((c) =>
      c.scopes.some((s) => {
        if (!s.scopeStage) return false;
        if (filters.stages.includes("STAGING")             && s.scopeStage === "STAGING") return true;
        if (filters.stages.includes("ASSEMBLY")            && s.scopeStage === "ASSEMBLY") return true;
        if (filters.stages.includes("INSTALL_IN_PROGRESS")   && s.scopeStage === "INSTALL" && (s.scopeStatus === "IN_PROGRESS" || s.scopeStatus === "BLOCKED")) return true;
        if (filters.stages.includes("INSTALL_COMPLETE_SUB")  && s.scopeStage === "INSTALL" && s.scopeStatus === "PENDING_VERIFICATION") return true;
        if (filters.stages.includes("INSTALL_COMPLETE")      && s.scopeStage === "INSTALL" && s.scopeStatus === "COMPLETE") return true;
        return false;
      })
    );
  }
  if (filters.scopeSubNames.length > 0) {
    // Sub-scope filter: unit must have at least one matching sub-scope instance
    // within a scope type that is also selected (or if no scope types selected, any scope type).
    result = result.filter((c) =>
      c.scopes.some((s) => {
        const scopeMatch = filters.scopeTypeNames.length === 0 || (s.scopeType && filters.scopeTypeNames.includes(s.scopeType.name));
        return scopeMatch && s.subScopeInstances.some((inst) => filters.scopeSubNames.includes(inst.subScope.name));
      })
    );
  } else if (filters.scopeTypeNames.length > 0) {
    result = result.filter((c) => c.scopes.some((s) => s.scopeType && filters.scopeTypeNames.includes(s.scopeType.name)));
  }
  if ((filters.locationKinds ?? []).length > 0) {
    result = result.filter((c) =>
      cardMatchesLocationKindFilters(isCommonAreaCard(c), filters),
    );
  }
  if (filters.unitTypes.length > 0) {
    result = result.filter((c) => !isCommonAreaCard(c) && filters.unitTypes.includes(c.unitType));
  }
  if (filters.buildings.length > 0 || filters.levels.length > 0)
    result = result.filter((c) => {
      const bKey = (c.building ?? "").trim() || MISSING_LOCATION_LABEL;
      const levelKey = `${bKey}::${(c.level ?? "").trim() || MISSING_LOCATION_LABEL}`;
      return filters.buildings.includes(bKey) || filters.levels.includes(levelKey);
    });
  if (filters.buildPhases.length > 0) {
    result = result.filter((c) => {
      const phase = cardLocationBuilderFields(c).buildPhase;
      return phase.length > 0 && filters.buildPhases.includes(phase);
    });
  }
  if (filters.areas.length > 0) {
    result = result.filter((c) => {
      const area = cardLocationBuilderFields(c).area;
      return area.length > 0 && filters.areas.includes(area);
    });
  }
  // Issue filters
  if (filters.unitsWithIssuesOnly)
    result = result.filter((c) => c.issueMeta.hasIssues);
  if (filters.issueTypes.length > 0)
    result = result.filter((c) => filters.issueTypes.some((t) => c.issueMeta.issueTypes.includes(t)));
  if (filters.responsibleParties.length > 0)
    result = result.filter((c) => filters.responsibleParties.some((p) => c.issueMeta.responsibleParties.includes(p)));
  if (filters.issueStatuses.length > 0)
    result = result.filter((c) => filters.issueStatuses.some((s) => c.issueMeta.statuses.includes(s)));
  if (filters.issueBlocking === true)
    result = result.filter((c) => c.issueMeta.hasBlockingIssues);
  if (filters.issueBlocking === false)
    result = result.filter((c) => c.issueMeta.hasOpenIssues && !c.issueMeta.hasBlockingIssues);
  if ((filters.issueScopeTypeNames ?? []).length > 0) {
    result = result.filter((c) => {
      const affectedRowIds = new Set(c.issueMeta.scopeRowIdsWithIssues);
      return c.scopes.some(
        (s) => s.scopeType && filters.issueScopeTypeNames.includes(s.scopeType.name) && affectedRowIds.has(s.id)
      );
    });
  }
  if ((filters.issueSubScopeNames ?? []).length > 0) {
    result = result.filter((c) => {
      const affectedInstIds = new Set(c.issueMeta.subScopeInstanceIdsWithIssues);
      return c.scopes.some((s) =>
        s.subScopeInstances.some(
          (inst) => filters.issueSubScopeNames.includes(inst.subScope.name) && affectedInstIds.has(inst.id)
        )
      );
    });
  }
  if ((filters.inspectionStatuses ?? []).length > 0) {
    result = result.filter((c) =>
      c.scopes.some((s) =>
        s.inspectionStatus != null &&
        filters.inspectionStatuses.includes(s.inspectionStatus),
      ),
    );
  }
  if ((filters.calibrationStatuses ?? []).length > 0) {
    result = result.filter((c) =>
      c.scopes.some((s) => {
        const hasCompletedCalibration =
          s.latestCalibrationOutcome != null &&
          filters.calibrationStatuses.includes(
            s.latestCalibrationOutcome === "FAIL" ? "FAILED" : "PASSED",
          );
        const awaitingCalibration =
          s.latestCalibrationOutcome == null &&
          (s.latestInspectionCategory === "CLEAR_INSPECTION" ||
            s.inspectionStatus === "PASSED" ||
            s.inspectionStatus === "FAILED");
        return hasCompletedCalibration || awaitingCalibration;
      }),
    );
  }
  if (filters.subcontractorAssigned === "yes") {
    result = result.filter((c) => c.scopes.some((s) => s.unifierSubId));
  } else if (filters.subcontractorAssigned === "no") {
    result = result.filter((c) => c.scopes.every((s) => !s.unifierSubId));
  }
  if ((filters.subcontractorIds ?? []).length > 0) {
    result = result.filter((c) =>
      c.scopes.some(
        (s) => s.unifierSubId && filters.subcontractorIds.includes(s.unifierSubId)
      )
    );
  }
  return result;
}

const MISSING_LOCATION_LABEL = "—";

function sortLocationKeys(a: string, b: string): number {
  if (a === MISSING_LOCATION_LABEL && b !== MISSING_LOCATION_LABEL) return 1;
  if (b === MISSING_LOCATION_LABEL && a !== MISSING_LOCATION_LABEL) return -1;
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Building colors follow the design-system 8-building palette. Known names map
 * directly; unknown names fall back to sorted building order and cycle after 8.
 */
const BUILDING_STRIPE_PALETTE = [
  "var(--building-north)",
  "var(--building-south)",
  "var(--building-east)",
  "var(--building-west)",
  "var(--building-a)",
  "var(--building-b)",
  "var(--building-c)",
  "var(--building-d)",
] as const;

const BUILDING_NAME_COLOR_MAP: Record<string, (typeof BUILDING_STRIPE_PALETTE)[number]> = {
  north: "var(--building-north)",
  south: "var(--building-south)",
  east: "var(--building-east)",
  west: "var(--building-west)",
  "bldg a": "var(--building-a)",
  "building a": "var(--building-a)",
  "a": "var(--building-a)",
  "bldg b": "var(--building-b)",
  "building b": "var(--building-b)",
  "b": "var(--building-b)",
  "bldg c": "var(--building-c)",
  "building c": "var(--building-c)",
  "c": "var(--building-c)",
  "bldg d": "var(--building-d)",
  "building d": "var(--building-d)",
  "d": "var(--building-d)",
};

function normalizeBuildingColorKey(buildingKey: string): string {
  return buildingKey.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Sorted unique building keys in filtered data (same ordering as location groups). */
function buildingKeysInViewOrder(cards: UnitCard[]): string[] {
  const keys = new Set<string>();
  for (const c of cards) {
    const k = (c.building ?? "").trim() || MISSING_LOCATION_LABEL;
    keys.add(k);
  }
  return Array.from(keys).sort(sortLocationKeys);
}

function buildingStripeForKey(buildingKey: string, orderedBuildingKeys: string[]): string {
  const k = (buildingKey ?? "").trim() || MISSING_LOCATION_LABEL;
  if (k === MISSING_LOCATION_LABEL) return "var(--neutral-300)";
  const namedColor = BUILDING_NAME_COLOR_MAP[normalizeBuildingColorKey(k)];
  if (namedColor) return namedColor;
  const idx = orderedBuildingKeys.indexOf(k);
  if (idx < 0) return BUILDING_STRIPE_PALETTE[0];
  return BUILDING_STRIPE_PALETTE[idx % BUILDING_STRIPE_PALETTE.length];
}

interface BuildingLevelGroup {
  buildingKey: string;
  levelSections: { levelKey: string; cards: UnitCard[] }[];
}

/** Flat: one synthetic group. Grouped: building → level (tap level bar to expand units). */
function buildBuildingLevelGroups(filteredCards: UnitCard[], groupByLocation: boolean): BuildingLevelGroup[] {
  if (!groupByLocation) {
    return [{ buildingKey: "__flat", levelSections: [{ levelKey: "__all", cards: filteredCards }] }];
  }
  const buildings = Array.from(
    new Set(filteredCards.map((c) => c.building || MISSING_LOCATION_LABEL))
  ).sort(sortLocationKeys);
  return buildings.map((bKey) => {
    const bcards = filteredCards.filter((c) => (c.building || MISSING_LOCATION_LABEL) === bKey);
    const levels = Array.from(
      new Set(bcards.map((c) => (c.level ?? "").trim() || MISSING_LOCATION_LABEL))
    ).sort(sortLocationKeys);
    return {
      buildingKey: bKey,
      levelSections: levels.map((lvl) => ({
        levelKey: lvl,
        cards: bcards.filter(
          (c) => ((c.level ?? "").trim() || MISSING_LOCATION_LABEL) === lvl
        ),
      })),
    };
  });
}

// ── Stage / Status labels & colors ───────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = { STAGING: "Staging", ASSEMBLY: "Assembly", INSTALL: "Install" };
const STATUS_LABELS: Record<string, string> = { NOT_STARTED: "Not Started", IN_PROGRESS: "In Progress", BLOCKED: "Blocked", PENDING_VERIFICATION: "Complete-Unverified", COMPLETE: "Complete-Verified" };
// STATUS_COLORS: text color + bg derived from SCOPE_STATUS_DOT_COLOR (single source of truth).
// Dot color is the saturated signal color; bg is the matching light tint.
const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  NOT_STARTED:          { color: "var(--neutral-500)",                           bg: "var(--neutral-100)" },
  IN_PROGRESS:          { color: SCOPE_STATUS_DOT_COLOR.IN_PROGRESS,             bg: "var(--warning-100)"  },
  BLOCKED:              { color: SCOPE_STATUS_DOT_COLOR.BLOCKED,                 bg: "var(--error-100)" },
  PENDING_VERIFICATION: { color: SCOPE_STATUS_DOT_COLOR.PENDING_VERIFICATION,    bg: "var(--success-50)" },
  COMPLETE:             { color: SCOPE_STATUS_DOT_COLOR.COMPLETE,                bg: "var(--success-100)" },
};


const STACKED_LABEL: CSSProperties = {
  fontSize: "var(--text-micro)",
  fontWeight: "var(--font-weight-extrabold)",
  color: "var(--unit-detail-scope-card-meta)",
  textTransform: "uppercase",
  letterSpacing: "var(--tracking-section)",
};

function ScopeStatusIcon({
  icon,
  color,
  shieldLabel = "CI",
  shieldStrokeColor,
  shieldFillColor,
}: {
  icon: ReturnType<typeof getScopeSquareStyle>["icon"];
  color: string;
  shieldLabel?: string;
  shieldStrokeColor?: string;
  shieldFillColor?: string;
}) {
  const shared = { color, flexShrink: 0 } as const;
  if (icon === "package") return <Package size={17} strokeWidth={2.35} style={shared} aria-hidden />;
  if (icon === "stack") return <Copy size={17} strokeWidth={2.35} style={shared} aria-hidden />;
  if (icon === "hammer") return <Hammer size={17} strokeWidth={2.35} style={shared} aria-hidden />;
  if (icon === "clipboard") return <Clipboard size={17} strokeWidth={2.35} style={shared} aria-hidden />;
  if (icon === "clipboard-check") return <ClipboardCheck size={17} strokeWidth={2.35} style={shared} aria-hidden />;
  if (icon === "shield-label") {
    return (
      <ScopeInspectionShieldIcon
        inspectionLabel={shieldLabel}
        color={color}
        strokeColor={shieldStrokeColor}
        fillColor={shieldFillColor}
        width={17}
        height={17}
        compact
      />
    );
  }
  if (icon === "alert") return <AlertTriangle size={17} strokeWidth={2.35} style={shared} aria-hidden />;
  return <Minus size={17} strokeWidth={2.35} style={shared} aria-hidden />;
}

function CombinedScopeOptionLeadingIcon({
  opt,
}: {
  opt: CombinedScopeOption;
}) {
  return (
    <ScopeStatusIcon
      icon={opt.icon}
      color={opt.dotColor ?? opt.color}
    />
  );
}

// ── Shared dropdown primitives ────────────────────────────────────────────────

function DropdownBackdrop({ onClose }: { onClose: () => void }) {
  return <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40 }} />;
}
function DropdownPanel({ children, role }: { children: React.ReactNode; role?: string }) {
  return (
    <div
      role={role}
      style={{
        position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
        backgroundColor: "var(--neutral-0)", border: "1px solid var(--neutral-200)",
        borderRadius: "var(--radius-md)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        minWidth: 170, overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
function DropdownItem({
  label, icon, active, onClick, color, muted, disabled, title,
}: {
  label: string; icon?: React.ReactNode; active?: boolean;
  onClick: () => void; color?: string; muted?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active ?? false}
      disabled={disabled}
      title={title}
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left",
        display: "flex", alignItems: "center", gap: "var(--inline-gap)",
        padding: "7px 12px", fontSize: 12,
        fontWeight: active ? 600 : 400,
        color: color ?? (muted ? "var(--neutral-400)" : active ? "var(--neutral-900)" : "var(--neutral-700)"),
        backgroundColor: active ? "var(--neutral-50)" : "transparent",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {active && <CheckCircle2 size={13} style={{ color: "var(--primary-500)", flexShrink: 0 }} />}
    </button>
  );
}

// ── Stage picker ──────────────────────────────────────────────────────────────

const STAGES = ["STAGING", "ASSEMBLY", "INSTALL"] as const;

function StagePicker({
  value,
  onChange,
  disabled,
}: {
  value: ScopeStage;
  onChange: (v: ScopeStage) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("units");
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          height: 30,
          minWidth: 108,
          padding: "0 8px 0 10px",
          borderRadius: "var(--radius-sm)",
          border: "1.5px solid var(--neutral-300)",
          backgroundColor: "var(--neutral-0)",
          color: value ? "var(--neutral-900)" : "var(--neutral-400)",
          fontSize: 12,
          fontWeight: 600,
          cursor: disabled ? "default" : "pointer",
          whiteSpace: "nowrap",
          boxSizing: "border-box",
        }}
      >
        <span style={{ flex: 1 }}>
          {value ? STAGE_LABELS[value].toUpperCase() : "—"}
        </span>
        <ChevronDown size={13} style={{ color: "var(--neutral-400)", flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <DropdownBackdrop onClose={() => setOpen(false)} />
          <DropdownPanel role="listbox">
            {STAGES.map((s) => (
              <DropdownItem
                key={s}
                label={STAGE_LABELS[s]}
                active={s === value}
                onClick={() => { onChange(s); setOpen(false); }}
              />
            ))}
            {value && (
              <>
                <div style={{ borderTop: "1px solid var(--neutral-100)", margin: "4px 0" }} />
                <DropdownItem label={t("clearStage")} muted onClick={() => { onChange(null); setOpen(false); }} />
              </>
            )}
          </DropdownPanel>
        </>
      )}
    </div>
  );
}

// ── Status picker ─────────────────────────────────────────────────────────────

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "PENDING_VERIFICATION", "COMPLETE"] as const;

function statusCompactIcon(status: ScopeStatus) {
  if (!status) return <Circle size={14} style={{ flexShrink: 0, opacity: 0.35 }} aria-hidden />;
  if (status === "NOT_STARTED") return <Circle size={14} style={{ flexShrink: 0, opacity: 0.4 }} aria-hidden />;
  if (status === "IN_PROGRESS") return <Activity size={14} style={{ flexShrink: 0 }} aria-hidden />;
  if (status === "COMPLETE") return <CheckCircle2 size={14} style={{ flexShrink: 0 }} aria-hidden />;
  if (status === "BLOCKED") return <AlertCircle size={14} style={{ flexShrink: 0 }} aria-hidden />;
  return <Circle size={14} style={{ flexShrink: 0, opacity: 0.35 }} aria-hidden />;
}

function StatusPicker({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: ScopeStatus;
  onChange: (v: ScopeStatus) => void;
  disabled?: boolean;
  /** Secondary to stage — smaller pill (stacked / mobile scopes). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sc = value ? STATUS_COLORS[value] : null;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: compact ? 5 : 6,
          height: compact ? 36 : "var(--button-height)",
          padding: compact ? "0 10px" : "0 10px 0 12px",
          borderRadius: 99,
          border: `1.5px solid ${sc?.color ?? "var(--neutral-300)"}`,
          backgroundColor: sc?.bg ?? "var(--neutral-50)",
          color: sc?.color ?? "var(--neutral-400)",
          fontSize: compact ? 11 : 12,
          fontWeight: compact ? 600 : 500,
          cursor: disabled ? "default" : "pointer",
          whiteSpace: "nowrap",
          minWidth: compact ? 0 : 118,
          maxWidth: compact ? 148 : undefined,
        }}
      >
        {compact && statusCompactIcon(value)}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          {value ? STATUS_LABELS[value] : "—"}
        </span>
        <ChevronDown size={compact ? 12 : 13} style={{ flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <DropdownBackdrop onClose={() => setOpen(false)} />
          <DropdownPanel role="listbox">
            {STATUSES.map((s) => {
              const c = STATUS_COLORS[s];
              return (
                <button
                  key={s}
                  type="button"
                  role="option"
                  aria-selected={s === value}
                  onClick={() => { onChange(s); setOpen(false); }}
                  style={{
                    width: "100%", textAlign: "left",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", fontSize: 13,
                    fontWeight: s === value ? 600 : 400,
                    color: c.color,
                    backgroundColor: s === value ? c.bg : "transparent",
                    border: "none", cursor: "pointer",
                  }}
                >
                  {STATUS_LABELS[s]}
                  {s === value && <CheckCircle2 size={13} style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </DropdownPanel>
        </>
      )}
    </div>
  );
}

/** Shared CSS for stacked scope pickers (portal z-index above mobile unit modal). */
const SCOPE_PICKER_SHEET_CSS = `
  .spbs-backdrop { position: fixed; inset: 0; z-index: 270; display: flex; align-items: flex-end; transition: background-color 0.26s ease; }
  .spbs-sheet { width: 100%; max-height: 85vh; border-radius: 16px 16px 0 0; background: var(--neutral-0); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); display: flex; flex-direction: column; box-shadow: 0 -4px 32px rgba(0,0,0,0.14); padding-bottom: env(safe-area-inset-bottom, 0px); }
  .spbs-sheet.spbs-visible { transform: translateY(0); }
  .spbs-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 0; flex-shrink: 0; }
`;

function ScopeFieldBottomSheet({
  title,
  subtitle,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const isBrowser = useIsBrowser();
  const titleId = useId();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const finishClose = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 260);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finishClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishClose]);

  if (!isBrowser) return null;

  return createPortal(
    <>
      <style>{SCOPE_PICKER_SHEET_CSS}</style>
      <div
        role="presentation"
        className="spbs-backdrop"
        style={{ backgroundColor: visible ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)" }}
        onClick={(e) => {
          if (e.target === e.currentTarget) finishClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`spbs-sheet${visible ? " spbs-visible" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="spbs-handle" aria-hidden />
          <div
            style={{
              padding: "12px 20px 14px",
              borderBottom: "1px solid var(--neutral-200)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <h2 id={titleId} style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--neutral-900)" }}>
                  {title}
                </h2>
                {subtitle ? (
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--neutral-500)", lineHeight: 1.35 }}>
                    {subtitle}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={finishClose}
                aria-label={closeLabel}
                style={{
                  padding: 6,
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  color: "var(--neutral-500)",
                  flexShrink: 0,
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              paddingBottom: "max(32px, env(safe-area-inset-bottom, 0px))",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

/** Desktop inline dropdown for scope status — portalled to body to escape overflow:hidden ancestors. */
function ScopeStatusDropdown({
  options,
  activeStage,
  activeStatus,
  skipAssembly = false,
  onPick,
  onNotStarted,
  onReportIssue,
  onClose,
  anchorRef,
  disableInstallComplete = false,
  disableInstallOptions = false,
  installCompleteBlockedTitle,
  installOptionsLockedTitle,
  procoreSection,
  inspectionSection,
}: {
  options: CombinedScopeOption[];
  activeStage: ScopeStage;
  activeStatus: ScopeStatus;
  skipAssembly?: boolean;
  onPick: (opt: CombinedScopeOption) => void;
  onNotStarted: () => void;
  onReportIssue?: () => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  /** When true, install-complete options (verified + unverified) cannot be chosen (open blocking issue). */
  disableInstallComplete?: boolean;
  /** When true, all install stage/status rows are disabled (clear inspection exists). */
  disableInstallOptions?: boolean;
  installCompleteBlockedTitle?: string;
  installOptionsLockedTitle?: string;
  procoreSection?: React.ReactNode;
  inspectionSection?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [anchorRef]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose, anchorRef]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        minWidth: Math.max(pos.width, 220),
        zIndex: 9999,
        background: "var(--neutral-0)",
        border: "1px solid var(--neutral-200)",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        overflow: "hidden",
      }}
    >
      {options.map((opt) => {
        const active = isCombinedMatch(activeStage, activeStatus, opt, skipAssembly);
        const blockedByIssue =
          disableInstallComplete && isInstallCompleteCombinedOptionKey(opt.key);
        const blocked = disableInstallOptions || blockedByIssue;
        const blockedTitle = disableInstallOptions
          ? installOptionsLockedTitle
          : blockedByIssue
            ? installCompleteBlockedTitle
            : undefined;
        return (
          <button
            key={opt.key}
            role="menuitem"
            type="button"
            disabled={blocked}
            title={blockedTitle}
            onClick={() => {
              if (!blocked) {
                onPick(opt);
                onClose();
              }
            }}
            style={{
              display: "flex", width: "100%", alignItems: "center",
              justifyContent: "space-between",
              padding: "11px 14px",
              border: "none",
              borderBottom: "1px solid var(--neutral-100)",
              backgroundColor: active ? opt.bg : "transparent",
              fontSize: 13, fontWeight: active ? 700 : 500,
              color: opt.color,
              cursor: blocked ? "not-allowed" : "pointer",
              textAlign: "left",
              opacity: blocked ? 0.45 : 1,
              gap: 10,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <CombinedScopeOptionLeadingIcon opt={opt} />
              {opt.label}
            </span>
            {active && <CheckCircle2 size={15} style={{ color: opt.color, flexShrink: 0 }} aria-hidden />}
          </button>
        );
      })}
      <button
        role="menuitem"
        type="button"
        disabled={disableInstallOptions}
        title={disableInstallOptions ? installOptionsLockedTitle : undefined}
        onClick={() => { if (!disableInstallOptions) { onNotStarted(); onClose(); } }}
        style={{
          display: "flex", width: "100%", alignItems: "center",
          padding: "11px 14px", border: "none",
          borderBottom: onReportIssue ? "1px solid var(--neutral-100)" : "none",
          backgroundColor: "transparent",
          fontSize: 13, fontWeight: 500,
          color: "var(--neutral-500)", cursor: disableInstallOptions ? "not-allowed" : "pointer", textAlign: "left",
          opacity: disableInstallOptions ? 0.45 : 1,
        }}
      >
        Not started
      </button>
      {procoreSection}
      {inspectionSection}
      {onReportIssue && (
        <button
          role="menuitem"
          type="button"
          onClick={() => { onClose(); onReportIssue(); }}
          style={{
            display: "flex", width: "100%", alignItems: "center",
            gap: 8, padding: "11px 14px", border: "none",
            backgroundColor: "transparent",
            fontSize: 13, fontWeight: 500,
            color: "var(--error-600)", cursor: "pointer", textAlign: "left",
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0 }} aria-hidden />
          Report an issue
        </button>
      )}
    </div>,
    document.body
  );
}

/** Set / edit Procore backfill — rendered in the STATUS section of the status hub (after "Not started"). */
function ScopeStatusHubProcoreRow({ onClose }: { onClose: () => void }) {
  const tInsp = useTranslations("inspections");
  const isDesktop = useIsDesktop();
  const { canManageStatus, hydrated, openBackfill, existingBackfill } = useScopeInspection();

  if (!canManageStatus || !hydrated) return null;

  const menuItemStyle: CSSProperties = isDesktop
    ? {
        display: "flex",
        width: "100%",
        alignItems: "center",
        gap: 8,
        padding: "11px 14px",
        border: "none",
        borderBottom: "1px solid var(--neutral-100)",
        backgroundColor: "transparent",
        fontSize: 13,
        fontWeight: 500,
        color: "var(--neutral-800)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
      }
    : {
        display: "flex",
        width: "100%",
        alignItems: "center",
        gap: 10,
        minHeight: 52,
        padding: "14px 20px",
        border: "none",
        borderBottom: "1px solid var(--neutral-100)",
        backgroundColor: "transparent",
        fontSize: 15,
        fontWeight: 500,
        color: "var(--neutral-800)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
      };

  const iconSize = isDesktop ? 14 : 18;

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        openBackfill();
        onClose();
      }}
      style={menuItemStyle}
      aria-label={
        existingBackfill ? tInsp("scopeEditProcoreAria") : tInsp("procoreStatusAria")
      }
    >
      <FileCheck size={iconSize} style={{ flexShrink: 0, color: "var(--neutral-500)" }} aria-hidden />
      {existingBackfill
        ? tInsp("procoreEditInspectionButton")
        : tInsp("procoreSetInspectionButton")}
    </button>
  );
}

/** Inspection actions rendered inside ScopeStatusHub open sheet/dropdown. */
function ScopeStatusHubInspectionSection({ onClose }: { onClose: () => void }) {
  const tInsp = useTranslations("inspections");
  const isDesktop = useIsDesktop();
  const {
    canManageStatus,
    openPicker,
    openCalibrate,
    openReview,
    openRetry,
    submissions,
    nonCalibrationSubmissions,
    latestCalibration,
    canReclassifySubmission,
    reclassifySubmission,
  } = useScopeInspection();

  const latestRecord = latestScopeInspectionStatusSubmission(submissions);
  const attemptNumber = latestRecord
    ? attemptNumberForSubmission(latestRecord, submissions)
    : 1;
  const showRetry =
    latestRecord != null &&
    scopeInspectionHubRetryEligible(latestRecord, canManageStatus);

  const reclassifyTarget = useMemo(
    () =>
      nonCalibrationSubmissions.find((sub) => canReclassifySubmission(sub)) ?? null,
    [canReclassifySubmission, nonCalibrationSubmissions],
  );

  const hasClearSubmission = nonCalibrationSubmissions.some(
    (s) => s.categorySnapshot === "CLEAR_INSPECTION" || s.source === "BACKFILL",
  );

  const menuItemStyle: CSSProperties = isDesktop
    ? {
        display: "flex",
        width: "100%",
        alignItems: "center",
        gap: 8,
        padding: "11px 14px",
        border: "none",
        borderBottom: "1px solid var(--neutral-100)",
        backgroundColor: "transparent",
        fontSize: 13,
        fontWeight: 500,
        color: "var(--neutral-900)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
      }
    : {
        display: "flex",
        width: "100%",
        alignItems: "center",
        gap: 10,
        minHeight: 52,
        padding: "14px 20px",
        border: "none",
        borderBottom: "1px solid var(--neutral-100)",
        backgroundColor: "transparent",
        fontSize: 15,
        fontWeight: 500,
        color: "var(--neutral-900)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
      };

  const iconSize = isDesktop ? 14 : 18;
  const headingPadding = isDesktop ? "8px 14px 4px" : "10px 20px 4px";

  return (
    <>
      <div style={{ height: 8, backgroundColor: "var(--neutral-50)" }} aria-hidden />
      <p
        style={{
          margin: 0,
          padding: headingPadding,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--neutral-400)",
        }}
      >
        {tInsp("statusHubInspectionHeading")}
      </p>
      {latestRecord && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            openReview(latestRecord, attemptNumber);
            onClose();
          }}
          style={menuItemStyle}
          aria-label={tInsp("scopeViewRecordAria")}
        >
          <Eye size={iconSize} style={{ flexShrink: 0 }} aria-hidden />
          {tInsp("statusHubViewRecord", { category: describeCategoryLabel(latestRecord) })}
        </button>
      )}
      {reclassifyTarget && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            void reclassifySubmission(reclassifyTarget);
            onClose();
          }}
          style={menuItemStyle}
          aria-label={tInsp("reclassifyToCalibrationAria")}
        >
          <FlaskConical size={iconSize} style={{ flexShrink: 0 }} aria-hidden />
          {tInsp("statusHubReclassifyToCalibration")}
        </button>
      )}
      {showRetry && latestRecord && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            openRetry(latestRecord, attemptNumber + 1);
            onClose();
          }}
          style={{ ...menuItemStyle, color: "var(--error-600)" }}
          aria-label={tInsp("scopeRetryAria")}
        >
          <RotateCcw size={iconSize} style={{ flexShrink: 0 }} aria-hidden />
          {tInsp("statusHubRetryInspection", { category: describeCategoryLabel(latestRecord) })}
        </button>
      )}
      {canManageStatus && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            openPicker("picker");
            onClose();
          }}
          style={menuItemStyle}
        >
          <ClipboardCheck
            size={iconSize}
            style={{ flexShrink: 0, color: "var(--scope-tile-install-fg)" }}
            aria-hidden
          />
          {tInsp("startInspection")}
        </button>
      )}
      {canManageStatus && hasClearSubmission && !latestCalibration && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            openCalibrate();
            onClose();
          }}
          style={menuItemStyle}
        >
          <FlaskConical size={iconSize} style={{ flexShrink: 0 }} aria-hidden />
          {tInsp("scopeCalibrateAction")}
        </button>
      )}
    </>
  );
}

/** Combined scope status + inspection action hub (replaces ScopeCombinedPicker). */
function ScopeStatusHub({
  scope,
  pickersDisabled,
  installOptionsLocked = false,
  patch,
  skipAssembly = false,
  onReportIssue,
  installCompleteBlocked = false,
}: {
  scope: ScopeRow;
  /** Disables opening the hub (saving or no manage permission). */
  pickersDisabled: boolean;
  /** Greys out install stage/status rows inside the open menu; inspections stay active. */
  installOptionsLocked?: boolean;
  patch: (
    u: Partial<ScopeRow>,
    activityHints?: { subcontractorDisplayName?: string },
  ) => void;
  skipAssembly?: boolean;
  onReportIssue?: (rowId: string) => void;
  installCompleteBlocked?: boolean;
}) {
  const t = useTranslations("units");
  const tInsp = useTranslations("inspections");
  const { submissions } = useScopeInspection();
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const valueId = useId();
  const isDesktop = useIsDesktop();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const finishClose = useCallback(() => setOpen(false), []);
  const installDisplay = combinedOptionDisplay(scope.scopeStage, scope.scopeStatus, skipAssembly);
  const hubInspection = resolveScopeInspectionHubDisplay({
    gridInspectionStatus: scope.gridInspectionStatus,
    latestInspectionCategory: scope.latestInspectionCategory,
    submissions,
  });
  const showingInspection = hubInspection != null;
  const display = showingInspection
    ? {
        label: tInsp("statusHubClosedLabel", {
          category: hubInspection.categoryLabel,
          outcome: hubInspection.failed ? tInsp("failLabel") : tInsp("passLabel"),
        }),
        bg: hubInspection.failed ? "var(--error-600)" : "var(--scope-tile-passed-bg)",
        color: "var(--color-text-inverse)",
        textColor: "var(--color-text-inverse)",
        triggerBg: hubInspection.failed ? "var(--error-600)" : "var(--scope-tile-passed-bg)",
      }
    : installDisplay;
  const options = getScopeCombinedOptions(skipAssembly);
  const statusVisual = getScopeSquareStyle({
    scopeStage: scope.scopeStage,
    scopeStatus: scope.scopeStatus,
    inspectionStatus: showingInspection ? hubInspection.inspectionStatus : null,
    latestInspectionCategory: showingInspection ? hubInspection.latestInspectionCategory : null,
  });
  const iconColor = display.textColor ?? statusVisual.foregroundColor;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 12 }}>
        <span id={labelId} style={STACKED_LABEL}>{t("colStatus")}</span>
        <div style={{ position: "relative" }}>
          <button
            ref={triggerRef}
            type="button"
            disabled={pickersDisabled}
            aria-haspopup={isDesktop ? "menu" : "dialog"}
            aria-expanded={open}
            aria-labelledby={`${labelId} ${valueId}`}
            onClick={() => !pickersDisabled && setOpen((o) => !o)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              minHeight: 44, width: "100%", padding: "0 11px 0 13px",
              borderRadius: "var(--radius-md)", border: "none",
              backgroundColor: display.triggerBg ?? display.bg, color: display.textColor ?? display.color,
              fontSize: "var(--text-body)", fontWeight: "var(--font-weight-extrabold)",
              cursor: pickersDisabled ? "default" : "pointer",
              opacity: pickersDisabled ? 0.6 : 1,
              textAlign: "left", boxSizing: "border-box",
              letterSpacing: "var(--tracking-tight)",
            }}
          >
            <span id={valueId} style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <ScopeStatusIcon
                icon={statusVisual.icon}
                color={iconColor}
                shieldLabel={statusVisual.shieldLabel}
                shieldStrokeColor={statusVisual.shieldStrokeColor}
                shieldFillColor={statusVisual.shieldFillColor}
              />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display.label}</span>
            </span>
            {isDesktop && !pickersDisabled && (
              <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.7 }} aria-hidden />
            )}
          </button>
          {open && isDesktop && (
            <ScopeStatusDropdown
              options={options}
              activeStage={scope.scopeStage}
              activeStatus={scope.scopeStatus}
              skipAssembly={skipAssembly}
              onPick={(opt) => patch({ scopeStage: opt.stage, scopeStatus: opt.status })}
              onNotStarted={() => patch({ scopeStage: null, scopeStatus: "NOT_STARTED" })}
              onReportIssue={onReportIssue ? () => onReportIssue(scope.id) : undefined}
              onClose={finishClose}
              anchorRef={triggerRef}
              disableInstallComplete={installCompleteBlocked}
              disableInstallOptions={installOptionsLocked}
              installCompleteBlockedTitle={t("installCompleteOptionDisabledTitle")}
              installOptionsLockedTitle={tInsp("statusHubInstallLockedTitle")}
              procoreSection={<ScopeStatusHubProcoreRow onClose={finishClose} />}
              inspectionSection={<ScopeStatusHubInspectionSection onClose={finishClose} />}
            />
          )}
        </div>
        {installOptionsLocked && !pickersDisabled && (
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.35, color: "var(--neutral-500)", fontWeight: 500 }}>
            {tInsp("statusHubInstallLockedHint")}
          </p>
        )}
        {installCompleteBlocked && !pickersDisabled && !installOptionsLocked && (
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.35, color: "var(--error-600)", fontWeight: 500 }}>
            {t("installCompleteBlockedHint")}
          </p>
        )}
      </div>

      {open && !isDesktop && (
        <ScopeFieldBottomSheet
          title={t("colStatus")}
          closeLabel={t("pickerSheetClose")}
          onClose={finishClose}
        >
          {options.map((opt) => {
            const active = isCombinedMatch(scope.scopeStage, scope.scopeStatus, opt, skipAssembly);
            const blockedByIssue =
              installCompleteBlocked && isInstallCompleteCombinedOptionKey(opt.key);
            const blocked = installOptionsLocked || blockedByIssue;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={blocked}
                title={
                  installOptionsLocked
                    ? tInsp("statusHubInstallLockedTitle")
                    : blockedByIssue
                      ? t("installCompleteOptionDisabledTitle")
                      : undefined
                }
                onClick={() => {
                  if (!blocked) {
                    patch({ scopeStage: opt.stage, scopeStatus: opt.status });
                    finishClose();
                  }
                }}
                style={{
                  display: "flex", width: "100%", alignItems: "center",
                  justifyContent: "space-between", minHeight: 52,
                  padding: "14px 20px", border: "none",
                  borderBottom: "1px solid var(--neutral-100)",
                  backgroundColor: active ? opt.bg : "transparent",
                  fontSize: 15, fontWeight: active ? 600 : 500,
                  color: opt.color,
                  cursor: blocked ? "not-allowed" : "pointer",
                  textAlign: "left",
                  opacity: blocked ? 0.45 : 1,
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <CombinedScopeOptionLeadingIcon opt={opt} />
                  <span>{opt.label}</span>
                </div>
                {active && <CheckCircle2 size={18} style={{ color: opt.color, flexShrink: 0 }} />}
              </button>
            );
          })}
          <div style={{ height: 8, backgroundColor: "var(--neutral-50)" }} aria-hidden />
          <button
            type="button"
            disabled={installOptionsLocked}
            title={installOptionsLocked ? tInsp("statusHubInstallLockedTitle") : undefined}
            onClick={() => {
              if (!installOptionsLocked) {
                patch({ scopeStage: null, scopeStatus: "NOT_STARTED" });
                finishClose();
              }
            }}
            style={{
              display: "flex", width: "100%", alignItems: "center",
              minHeight: 52, padding: "14px 20px", border: "none",
              backgroundColor: "transparent", fontSize: 15, fontWeight: 500,
              color: "var(--neutral-400)", cursor: installOptionsLocked ? "not-allowed" : "pointer", textAlign: "left",
              opacity: installOptionsLocked ? 0.45 : 1,
            }}
          >
            Not started
          </button>
          <ScopeStatusHubProcoreRow onClose={finishClose} />
          <ScopeStatusHubInspectionSection onClose={finishClose} />
          <div style={{ height: 1, backgroundColor: "var(--neutral-100)", margin: "0 20px" }} aria-hidden />
          <button
            type="button"
            onClick={() => { finishClose(); onReportIssue?.(scope.id); }}
            style={{
              display: "flex", width: "100%", alignItems: "center",
              gap: 10, minHeight: 52, padding: "14px 20px", border: "none",
              backgroundColor: "transparent", fontSize: 15, fontWeight: 500,
              color: "var(--error-600)", cursor: "pointer", textAlign: "left",
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            Report an issue
          </button>
        </ScopeFieldBottomSheet>
      )}
    </>
  );
}

// ── Clear Inspection Modal ────────────────────────────────────────────────────

function ClearInspectionModal({
  scopeName,
  inspectionStatus,
  onClose,
  onPass,
  onFail,
  onCancel,
}: {
  scopeName: string;
  inspectionStatus: NonNullable<InspectionStatus>;
  onClose: () => void;
  onPass: () => void;
  onFail: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("units");

  const statusColor: Record<NonNullable<InspectionStatus>, string> = {
    READY:  "var(--primary-500)",
    PASSED: "var(--success-600)",
    FAILED: "var(--error-600)",
  };
  const statusLabel: Record<NonNullable<InspectionStatus>, string> = {
    READY:  t("inspectionReady"),
    PASSED: t("inspectionPassed"),
    FAILED: t("inspectionFailed"),
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          backgroundColor: "rgba(0,0,0,0.4)",
          zIndex: 200,
        }}
      />
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ci-modal-title"
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 201,
          width: "min(480px, calc(100vw - 32px))",
          backgroundColor: "var(--neutral-0)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          padding: "var(--card-padding)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--component-gap)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              backgroundColor: "var(--primary-50)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <ClipboardCheck size={18} style={{ color: "var(--primary-500)" }} />
            </div>
            <div>
              <p id="ci-modal-title" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--neutral-900)" }}>
                {t("inspectionModalTitle")}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--neutral-500)", marginTop: 2 }}>
                {scopeName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("inspectionModalClose")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--neutral-400)", padding: 4, display: "flex" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Status badge */}
        <div style={{
          padding: "var(--card-padding)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--neutral-100)",
          backgroundColor: "var(--neutral-50)",
        }}>
          <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Current Status
          </p>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 600,
            color: statusColor[inspectionStatus],
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: statusColor[inspectionStatus], display: "inline-block" }} />
            {statusLabel[inspectionStatus]}
          </span>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--neutral-500)" }}>
            {t("inspectionModalSubtitle")}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            onClick={() => { onPass(); onClose(); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", padding: "10px 16px",
              borderRadius: "var(--radius-sm)",
              border: "none", backgroundColor: "var(--success-600)", color: "var(--neutral-0)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            <CheckCircle2 size={15} />
            {t("inspectionMarkPassed")}
          </button>
          <button
            type="button"
            onClick={() => { onFail(); onClose(); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", padding: "10px 16px",
              borderRadius: "var(--radius-sm)",
              border: "none", backgroundColor: "var(--error-600)", color: "var(--neutral-0)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            <AlertCircle size={15} />
            {t("inspectionMarkFailed")}
          </button>
          <div style={{ borderTop: "1px solid var(--neutral-100)", paddingTop: 8 }}>
            <button
              type="button"
              onClick={() => { onCancel(); onClose(); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "8px 16px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--neutral-200)", backgroundColor: "transparent",
                color: "var(--neutral-600)",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              <XCircle size={14} />
              {t("inspectionCancelActive")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Inspection button ─────────────────────────────────────────────────────────
// null → "Start Clear Inspection" (always visible on every scope row)
//        clicking auto-sets stage=INSTALL, status=COMPLETE, locks dropdowns
// READY/PASSED/FAILED → status chip + open modal button; cancel re-enables dropdowns

function InspectionButton({
  inspectionStatus,
  scopeName,
  onStart,
  onChange,
  onCancel,
  disabled,
  fullWidth,
}: {
  inspectionStatus: InspectionStatus;
  scopeName: string;
  onStart: () => void;
  onChange: (v: InspectionStatus) => void;
  onCancel: () => void;
  disabled?: boolean;
  /** Full-width bar (stacked / mobile scope cards). */
  fullWidth?: boolean;
}) {
  const t = useTranslations("units");
  const [modalOpen, setModalOpen] = useState(false);

  const fw = fullWidth
    ? {
        width: "100%" as const,
        justifyContent: "center" as const,
        minHeight: 44,
        padding: "12px 16px",
        borderRadius: 10,
        boxSizing: "border-box" as const,
      }
    : {};

  // Not yet started — show "Start" on every row
  if (!inspectionStatus) {
    return (
      <div style={fullWidth ? { width: "100%" } : undefined}>
        <button
          type="button"
          onClick={() => !disabled && onStart()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: fullWidth ? undefined : 30,
            padding: fullWidth ? undefined : "0 12px",
            borderRadius: fullWidth ? undefined : "var(--radius-sm)",
            border: "1.5px solid var(--primary-400)",
            backgroundColor: "var(--primary-500)",
            color: "var(--neutral-0)",
            fontSize: fullWidth ? 14 : 12,
            fontWeight: 600,
            cursor: disabled ? "default" : "pointer",
            whiteSpace: "nowrap",
            opacity: disabled ? 0.5 : 1,
            ...fw,
          }}
        >
          <ClipboardCheck size={fullWidth ? 18 : 13} />
          {t("inspectionStart")}
        </button>
      </div>
    );
  }

  // Active inspection — show status + open modal (same actions; full-width layout)
  const statusCfg: Record<NonNullable<InspectionStatus>, { label: string; bg: string; text: string }> = {
    READY:  { label: t("inspectionReady"),  bg: "var(--primary-50)",  text: "var(--primary-700)" },
    PASSED: { label: t("inspectionPassed"), bg: "var(--success-50)",  text: "var(--success-700)" },
    FAILED: { label: t("inspectionFailed"), bg: "var(--error-50)",    text: "var(--error-700)" },
  };
  const cfg = statusCfg[inspectionStatus];

  return (
    <>
      <div style={fullWidth ? { width: "100%" } : undefined}>
        <button
          type="button"
          onClick={() => !disabled && setModalOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: fullWidth ? 8 : 6,
            height: fullWidth ? undefined : 30,
            padding: fullWidth ? undefined : "0 10px",
            borderRadius: fullWidth ? undefined : "var(--radius-sm)",
            border: `1.5px solid ${cfg.text}`,
            backgroundColor: cfg.bg,
            color: cfg.text,
            fontSize: fullWidth ? 14 : 12,
            fontWeight: 600,
            cursor: disabled ? "default" : "pointer",
            whiteSpace: "nowrap",
            ...fw,
          }}
        >
          <ClipboardCheck size={fullWidth ? 18 : 13} />
          {cfg.label}
          <ChevronDown size={fullWidth ? 14 : 11} style={{ marginLeft: 2, flexShrink: 0 }} />
        </button>
      </div>

      {modalOpen && (
        <ClearInspectionModal
          scopeName={scopeName}
          inspectionStatus={inspectionStatus}
          onClose={() => setModalOpen(false)}
          onPass={() => onChange("PASSED")}
          onFail={() => onChange("FAILED")}
          onCancel={onCancel}
        />
      )}
    </>
  );
}

const INSPECTION_OPTIONS: { value: "PASSED" | "FAILED"; label: string; color: string; bg: string; border: string }[] = [
  { value: "PASSED", label: "Pass",   color: "var(--success-700)", bg: "var(--success-50)",  border: "var(--success-300)" },
  { value: "FAILED", label: "Fail",   color: "var(--error-700)",   bg: "var(--error-50)",    border: "var(--error-300)"   },
];

function inspectionDisplay(status: InspectionStatus): { label: string; color: string; bg: string; border: string } {
  if (status === "PASSED") return { label: "Passed", color: "var(--success-700)", bg: "var(--success-50)", border: "var(--success-300)" };
  if (status === "FAILED") return { label: "Failed", color: "var(--error-700)",   bg: "var(--error-50)",   border: "var(--error-300)"   };
  // null or READY both show as Pending
  return { label: "Pending", color: "var(--neutral-400)", bg: "var(--neutral-100)", border: "var(--neutral-200)" };
}

/**
 * Interactive inspection status picker used in stacked / detail scope cards.
 * Desktop: portalled dropdown. Mobile: bottom sheet.
 * Visually separated from the scope body with a tinted footer band.
 */
function ScopeInspectionPicker({
  inspectionStatus,
  onChange,
  disabled = false,
}: {
  inspectionStatus: InspectionStatus;
  onChange: (v: InspectionStatus) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const display = inspectionDisplay(inspectionStatus);
  const finishClose = useCallback(() => setOpen(false), []);

  // Position desktop dropdown on open
  useEffect(() => {
    if (!open || !isDesktop || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, [open, isDesktop]);

  // Close on outside click (desktop)
  useEffect(() => {
    if (!open || !isDesktop) return;
    function onDown(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) finishClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, isDesktop, finishClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") finishClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, finishClose]);

  function pick(v: InspectionStatus) {
    // Toggle: picking the active value clears it
    onChange(inspectionStatus === v ? null : v);
    finishClose();
  }

  const desktopDropdown = open && isDesktop && dropPos ? createPortal(
    <div
      ref={dropdownRef}
      role="menu"
      style={{
        position: "fixed",
        top: dropPos.top,
        left: dropPos.left,
        minWidth: Math.max(dropPos.width, 160),
        zIndex: 9999,
        background: "var(--neutral-0)",
        border: "1px solid var(--neutral-200)",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        overflow: "hidden",
      }}
    >
      {INSPECTION_OPTIONS.map((opt) => {
        const active = inspectionStatus === opt.value;
        return (
          <button
            key={opt.value}
            role="menuitem"
            type="button"
            onClick={() => pick(opt.value)}
            style={{
              display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
              padding: "11px 14px",
              border: "none",
              borderBottom: "1px solid var(--neutral-100)",
              backgroundColor: active ? opt.bg : "transparent",
              fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? opt.color : "var(--neutral-700)",
              cursor: "pointer", textAlign: "left",
            }}
          >
            {opt.label}
            {active && <CheckCircle2 size={14} style={{ color: opt.color, flexShrink: 0 }} aria-hidden />}
          </button>
        );
      })}
      {inspectionStatus !== null && (
        <button
          role="menuitem"
          type="button"
          onClick={() => pick(null)}
          style={{
            display: "flex", width: "100%", alignItems: "center",
            padding: "11px 14px", border: "none",
            backgroundColor: "transparent",
            fontSize: 13, fontWeight: 500,
            color: "var(--neutral-400)", cursor: "pointer", textAlign: "left",
          }}
        >
          Clear
        </button>
      )}
    </div>,
    document.body
  ) : null;

  const mobileSheet = open && !isDesktop ? (
    <ScopeFieldBottomSheet
      title="Inspection Status"
      closeLabel="Done"
      onClose={finishClose}
    >
      {INSPECTION_OPTIONS.map((opt) => {
        const active = inspectionStatus === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => pick(opt.value)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", padding: "16px 20px",
              border: "none", borderBottom: "1px solid var(--neutral-100)",
              backgroundColor: active ? opt.bg : "transparent",
              fontSize: 15, fontWeight: active ? 700 : 500,
              color: active ? opt.color : "var(--neutral-800)",
              cursor: "pointer", textAlign: "left",
            }}
          >
            {opt.label}
            {active && <CheckCircle2 size={18} style={{ color: opt.color, flexShrink: 0 }} aria-hidden />}
          </button>
        );
      })}
      {inspectionStatus !== null && (
        <button
          type="button"
          onClick={() => pick(null)}
          style={{
            display: "flex", alignItems: "center",
            width: "100%", padding: "16px 20px",
            border: "none",
            backgroundColor: "transparent",
            fontSize: 15, fontWeight: 500,
            color: "var(--neutral-400)", cursor: "pointer", textAlign: "left",
          }}
        >
          Clear
        </button>
      )}
    </ScopeFieldBottomSheet>
  ) : null;

  return (
    <>
      {/* Visually distinct footer band */}
      <div
        style={{
          marginTop: 14,
          marginLeft: -14,
          marginRight: -14,
          marginBottom: -14,
          padding: "10px 14px 14px",
          backgroundColor: "var(--neutral-50)",
          borderTop: "1px solid var(--neutral-150, var(--neutral-200))",
        }}
      >
        <span style={{
          display: "block",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "var(--neutral-400)",
          marginBottom: 6,
        }}>
          Inspection Status
        </span>
        <div style={{ position: "relative" }}>
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            aria-haspopup={isDesktop ? "menu" : "dialog"}
            aria-expanded={open}
            onClick={() => !disabled && setOpen((o) => !o)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", minHeight: 36, padding: "0 10px 0 12px",
              borderRadius: 8,
              border: `1.5px solid ${display.border}`,
              backgroundColor: display.bg,
              color: display.color,
              fontSize: 12, fontWeight: 600,
              cursor: disabled ? "default" : "pointer",
              opacity: disabled ? 0.6 : 1,
              textAlign: "left", boxSizing: "border-box",
            }}
          >
            <span>{display.label}</span>
            {!disabled && <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.6 }} aria-hidden />}
          </button>
        </div>
      </div>
      {desktopDropdown}
      {mobileSheet}
    </>
  );
}

/** @deprecated Use ScopeInspectionPicker for interactive editing. Kept for any remaining read-only contexts. */
function ScopeStackedInspectionStatusLine({ inspectionStatus }: { inspectionStatus: InspectionStatus }) {
  const display = inspectionDisplay(inspectionStatus);
  return (
    <div
      role="status"
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid var(--neutral-100)",
        fontSize: 12,
        lineHeight: 1.35,
      }}
    >
      <span style={{ fontWeight: 600, color: "var(--neutral-500)" }}>Inspection Status</span>{" "}
      <span style={{ fontWeight: 500, color: display.color }}>{display.label}</span>
    </div>
  );
}

// ── Clear Inspection ──────────────────────────────────────────────────────────

/**
 * Legacy ad-hoc pass/fail clear-inspection band.
 *
 * @deprecated Replaced by `ScopeInspectionsBand` (form-driven
 * inspections — see `components/projects/inspections/`). Kept
 * temporarily as reference; the API endpoints it calls still exist
 * server-side and may be re-used during the Phase 4 deficiency
 * promotion work. Safe to delete once the form-driven flow is
 * validated end-to-end.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ScopeClearInspectionSection({
  scope,
  projectId,
  canManageStatus,
  onSaved,
}: {
  scope: ScopeRow;
  projectId: string;
  canManageStatus: boolean;
  onSaved: (id: string, updates: Partial<ScopeRow>) => void;
}) {
  const isBrowser = useIsBrowser();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const current = scope.clearInspection;

  const handleSelect = useCallback(
    async (status: "PASSED" | "FAILED") => {
      setOpen(false);
      setSaving(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/clear-inspections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rowId: scope.id, status }),
        });
        if (res.ok) {
          const record = (await res.json()) as ClearInspectionResult;
          onSaved(scope.id, { clearInspection: record });
        } else {
          console.warn("[ClearInspection] POST failed:", res.status, await res.text());
        }
      } catch (err) {
        console.warn("[ClearInspection] POST error:", err);
      } finally {
        setSaving(false);
      }
    },
    [projectId, scope.id, onSaved]
  );

  const handleRemove = useCallback(async () => {
    if (!current) return;
    setOpen(false);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/clear-inspections/${current.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        onSaved(scope.id, { clearInspection: null });
      } else {
        console.warn("[ClearInspection] DELETE failed:", res.status, await res.text());
      }
    } catch (err) {
      console.warn("[ClearInspection] DELETE error:", err);
    } finally {
      setSaving(false);
    }
  }, [current, projectId, scope.id, onSaved]);

  const openPicker = useCallback(() => {
    if (!canManageStatus || saving) return;
    if (isDesktop && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(true);
  }, [canManageStatus, saving, isDesktop]);

  const closePicker = useCallback(() => {
    setOpen(false);
    setDropPos(null);
  }, []);

  // Close desktop dropdown on outside click / escape
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) closePicker();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePicker(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isDesktop, closePicker]);

  const passedColor = "var(--success-600, #16a34a)";
  const failedColor = "var(--error-600, #dc2626)";
  const badgeColor = current?.status === "PASSED" ? passedColor : current?.status === "FAILED" ? failedColor : undefined;
  const badgeLabel = current?.status === "PASSED" ? "Insp: PASSED" : current?.status === "FAILED" ? "Insp: FAILED" : null;

  const optionStyle = (active: boolean, color: string): React.CSSProperties => ({
    display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
    padding: "11px 14px", border: "none", borderBottom: "1px solid var(--neutral-100)",
    backgroundColor: active ? `${color}14` : "transparent",
    fontSize: 13, fontWeight: active ? 700 : 500, color, cursor: "pointer", textAlign: "left",
  });

  const desktopDropdown =
    open && isDesktop && dropPos && isBrowser
      ? createPortal(
          <div
            ref={dropdownRef}
            role="menu"
            style={{
              position: "fixed",
              top: dropPos.top,
              left: dropPos.left,
              minWidth: Math.max(dropPos.width, 180),
              zIndex: 9999,
              background: "var(--neutral-0)",
              border: "1px solid var(--neutral-200)",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              overflow: "hidden",
            }}
          >
            <button role="menuitem" type="button" style={optionStyle(current?.status === "PASSED", passedColor)}
              onClick={() => handleSelect("PASSED")}>
              Pass
              {current?.status === "PASSED" && <CheckCircle2 size={15} aria-hidden />}
            </button>
            <button role="menuitem" type="button" style={optionStyle(current?.status === "FAILED", failedColor)}
              onClick={() => handleSelect("FAILED")}>
              Fail
              {current?.status === "FAILED" && <CheckCircle2 size={15} aria-hidden />}
            </button>
            {current && (
              <button role="menuitem" type="button"
                onClick={handleRemove}
                style={{
                  display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                  padding: "11px 14px", border: "none", borderTop: "1px solid var(--neutral-200)",
                  backgroundColor: "transparent",
                  fontSize: 13, fontWeight: 500, color: "var(--neutral-500)", cursor: "pointer", textAlign: "left",
                }}>
                Remove inspection
                <Trash2 size={14} aria-hidden />
              </button>
            )}
          </div>,
          document.body
        )
      : null;

  const mobileSheet =
    open && !isDesktop && isBrowser ? (
      <ScopeFieldBottomSheet
        title="Clear Inspection"
        closeLabel="Close"
        onClose={closePicker}
      >
        <div style={{ padding: "8px 0" }}>
          <button type="button" style={optionStyle(current?.status === "PASSED", passedColor)}
            onClick={() => handleSelect("PASSED")}>
            Pass
            {current?.status === "PASSED" && <CheckCircle2 size={15} aria-hidden />}
          </button>
          <button type="button" style={optionStyle(current?.status === "FAILED", failedColor)}
            onClick={() => handleSelect("FAILED")}>
            Fail
            {current?.status === "FAILED" && <CheckCircle2 size={15} aria-hidden />}
          </button>
          {current && (
            <button type="button"
              onClick={handleRemove}
              style={{
                display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
                padding: "11px 14px", border: "none", borderTop: "1px solid var(--neutral-200)",
                backgroundColor: "transparent",
                fontSize: 13, fontWeight: 500, color: "var(--neutral-500)", cursor: "pointer", textAlign: "left",
              }}>
              Remove inspection
              <Trash2 size={14} aria-hidden />
            </button>
          )}
        </div>
      </ScopeFieldBottomSheet>
    ) : null;

  return (
    <>
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid var(--neutral-200)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          backgroundColor: "var(--neutral-50, #f9fafb)",
          marginLeft: -14,
          marginRight: -14,
          marginBottom: -14,
          paddingLeft: 14,
          paddingRight: 14,
          paddingBottom: 10,
          borderBottomLeftRadius: "inherit",
          borderBottomRightRadius: "inherit",
        }}
      >
        {saving ? (
          <Loader2 size={14} style={{ animation: "spin 1s linear infinite", color: "var(--neutral-400)" }} aria-hidden />
        ) : badgeLabel ? (
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Inspection ${current?.status === "PASSED" ? "passed" : "failed"}. Tap to change.`}
            onClick={openPicker}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 99,
              border: `1px solid ${badgeColor}`,
              backgroundColor: `${badgeColor}18`,
              color: badgeColor,
              fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              cursor: canManageStatus ? "pointer" : "default",
              lineHeight: 1.6,
            }}
          >
            <ClipboardCheck size={12} aria-hidden />
            {badgeLabel}
          </button>
        ) : (
          <button
            ref={triggerRef}
            type="button"
            aria-label="Set clear inspection"
            onClick={openPicker}
            disabled={!canManageStatus || saving}
            style={{
              fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              color: canManageStatus ? "var(--neutral-500)" : "var(--neutral-300)",
              background: "none", border: "none", padding: 0,
              cursor: canManageStatus ? "pointer" : "default",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <ClipboardCheck size={16} aria-hidden />
            Set clear inspection
            {canManageStatus && <ChevronRight size={13} aria-hidden />}
          </button>
        )}
      </div>
      {desktopDropdown}
      {mobileSheet}
    </>
  );
}

// ── Scope PATCH (shared by table + stacked layouts) ───────────────────────────

/** Maps optimistic `ScopeRow` updates to JSON body fields the units API accepts. */
const CLIENT_ONLY_SCOPE_PATCH_KEYS = new Set([
  "gridInspectionStatus",
  "latestInspectionCategory",
  "subScopeInstances",
  "clearInspection",
  "scopeType",
  "_pendingSync",
]);

function scopeUpdatesToApiBody(
  updates: Partial<ScopeRow>,
  activityHints?: { subcontractorDisplayName?: string },
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (!CLIENT_ONLY_SCOPE_PATCH_KEYS.has(key)) {
      body[key] = value;
    }
  }
  if (activityHints?.subcontractorDisplayName?.trim()) {
    body.subcontractorDisplayName = activityHints.subcontractorDisplayName.trim();
  }
  return body;
}

function useScopePatch(
  scope: ScopeRow,
  projectId: string,
  onSaved: (id: string, updates: Partial<ScopeRow>) => void,
  installCompleteBlocked = false,
) {
  const t = useTranslations("units");
  const [saving, setSaving] = useState(false);
  const [savingSubcontractor, setSavingSubcontractor] = useState(false);
  const inflightPatchKeyRef = useRef<string | null>(null);
  const patch = useCallback(
    async (
      updates: Partial<ScopeRow>,
      activityHints?: { subcontractorDisplayName?: string },
    ): Promise<boolean> => {
      const isSubcontractorPatch = Object.prototype.hasOwnProperty.call(updates, "unifierSubId");
      const nextStage =
        updates.scopeStage !== undefined ? updates.scopeStage : scope.scopeStage;
      const nextStatus =
        updates.scopeStatus !== undefined ? updates.scopeStatus : scope.scopeStatus;
      if (
        installCompleteBlocked &&
        isTransitionToInstallCompleteScope(
          scope.scopeStage,
          scope.scopeStatus,
          nextStage,
          nextStatus,
        )
      ) {
        toast.error(t("installCompleteBlockedByIssueToast"));
        return false;
      }

      const rollbackUpdates = Object.fromEntries(
        (Object.keys(updates) as Array<keyof ScopeRow>).map((key) => [key, scope[key]])
      ) as Partial<ScopeRow>;
      // Optimistic update always fires first
      onSaved(scope.id, updates);
      setSaving(true);
      if (isSubcontractorPatch) setSavingSubcontractor(true);

      const url = `/api/projects/${projectId}/units/${scope.id}`;
      const body = scopeUpdatesToApiBody(updates, activityHints);
      const bodyWithLocation = await enrichBodyWithActivityLocation(body);
      const patchKey = `${scope.id}:${JSON.stringify(bodyWithLocation)}`;
      if (inflightPatchKeyRef.current === patchKey) {
        return true;
      }
      inflightPatchKeyRef.current = patchKey;

      // AbortController + setTimeout instead of AbortSignal.timeout() for
      // broader browser compatibility (AbortSignal.timeout not in iOS <16).
      const ctrl = new AbortController();
      const abortTimer = setTimeout(() => ctrl.abort(), 6000);
      let ok = false;
      try {
        // Try the API first regardless of navigator.onLine (the flag is
        // unreliable on captive portals and briefly after airplane mode is
        // toggled).
        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyWithLocation),
          signal: ctrl.signal,
        });
        clearTimeout(abortTimer);
        if (!res.ok) {
          let errBody: unknown;
          try {
            errBody = await res.json();
          } catch {
            errBody = null;
          }
          toastInstallCompletePatchError(t, res.status, errBody);
          // 4xx / 5xx — do NOT enqueue: a 401/403/400 will fail again on
          // retry and should not persist as a pending offline mutation.
          console.warn(`[UnitCards] PATCH ${scope.id} responded ${res.status} — not queuing`);
          ok = false;
        } else {
          // Immediately refresh the project-api-v1 Workbox cache entry so
          // going offline right after a unit status change (e.g. "Set clear
          // inspection") still shows the updated value. Uses the same page
          // limit as the field tracker to avoid fetching unbounded rows.
          void fetch(`/api/projects/${projectId}/units?limit=${FIELD_TRACKER_UNITS_PAGE_LIMIT}`).catch(() => {/* non-critical */});
          ok = true;
        }
      } catch (err) {
        clearTimeout(abortTimer);
        // Network-level failure (offline, abort timeout, DNS error) — enqueue
        // for sync. Only network errors reach here since server errors (4xx/5xx)
        // are handled above without throwing.
        console.warn("[UnitCards] PATCH network error, queuing for offline sync:", err);
        try {
          const { enqueueMutation } = await import("@/lib/offline/mutation-queue");
          await enqueueMutation({ type: "unit-status", url, method: "PATCH", body: bodyWithLocation });
          ok = true;
        } catch (queueErr) {
          console.warn("[UnitCards] Failed to enqueue offline mutation:", queueErr);
          ok = false;
        }
      } finally {
        if (inflightPatchKeyRef.current === patchKey) {
          inflightPatchKeyRef.current = null;
        }
        setSaving(false);
        if (isSubcontractorPatch) setSavingSubcontractor(false);
      }
      if (!ok) {
        onSaved(scope.id, rollbackUpdates);
      } else if (isSubcontractorPatch) {
        const name = activityHints?.subcontractorDisplayName?.trim();
        if (updates.unifierSubId === null) {
          toast.success(t("subcontractorClearedToast"));
        } else {
          toast.success(
            t("subcontractorSavedToast", {
              name: name || t("subcontractorLabel"),
            }),
          );
        }
      }
      return ok;
    },
    [scope, projectId, onSaved, t, installCompleteBlocked]
  );
  return { saving, savingSubcontractor, patch };
}

type InstanceUpdates = Pick<SubScopeInstance, "scopeStage" | "scopeStatus" | "inspectionStatus">;

function useSubScopeInstancePatch(
  projectId: string,
  rowId: string,
  instanceId: string,
  instance: Pick<SubScopeInstance, "scopeStage" | "scopeStatus" | "inspectionStatus">,
  onInstanceSaved: (rowId: string, instanceId: string, updates: Partial<SubScopeInstance>) => void
) {
  const t = useTranslations("units");
  const tOffline = useTranslations("offlineIndicator");
  const { isOnline } = useOfflineStatus();
  const [saving, setSaving] = useState(false);
  const patch = useCallback(
    async (updates: Partial<InstanceUpdates>) => {
      if (!isOnline) {
        toast.error(tOffline("offlineActionUnavailable"));
        return false;
      }

      const rollbackUpdates = Object.fromEntries(
        (Object.keys(updates) as Array<keyof InstanceUpdates>).map((key) => [
          key,
          instance[key as keyof Pick<SubScopeInstance, "scopeStage" | "scopeStatus" | "inspectionStatus">],
        ])
      ) as Partial<InstanceUpdates>;

      onInstanceSaved(rowId, instanceId, updates);
      setSaving(true);
      let ok = false;
      try {
        const res = await fetch(
          `/api/projects/${projectId}/sub-scopes/instances/${instanceId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );
        if (!res.ok) {
          let errBody: unknown;
          try {
            errBody = await res.json();
          } catch {
            errBody = null;
          }
          toastInstallCompletePatchError(t, res.status, errBody);
          console.warn(`[UnitCards] PATCH instance ${instanceId} failed: ${res.status}`);
          ok = false;
        } else {
          ok = true;
        }
      } catch (err) {
        console.warn("[UnitCards] PATCH instance error:", err);
        ok = false;
      } finally {
        setSaving(false);
      }
      if (!ok) {
        onInstanceSaved(rowId, instanceId, rollbackUpdates);
      }
      return ok;
    },
    [projectId, instanceId, instance, onInstanceSaved, rowId, t, isOnline, tOffline]
  );
  return { saving, patch };
}

// ── Scope table row ───────────────────────────────────────────────────────────

/** Inline dropdown for the desktop table — combined Stage+Status in one control. */
function ScopeTableCombinedDropdown({
  stage,
  status,
  disabled,
  skipAssembly = false,
  onChange,
  installCompleteBlocked = false,
}: {
  stage: ScopeStage;
  status: ScopeStatus;
  disabled?: boolean;
  skipAssembly?: boolean;
  onChange: (stage: ScopeStage, status: ScopeStatus) => void;
  installCompleteBlocked?: boolean;
}) {
  const t = useTranslations("units");
  const [open, setOpen] = useState(false);
  const display = combinedOptionDisplay(stage, status, skipAssembly);
  const options = getScopeCombinedOptions(skipAssembly);
  return (
    <div style={{ position: "relative", minWidth: 180 }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          height: 30, width: "100%", maxWidth: 220,
          padding: "0 8px 0 10px",
          borderRadius: "var(--radius-sm)",
          border: `1.5px solid ${display.triggerBg ?? display.bg}`,
          backgroundColor: display.triggerBg ?? display.bg,
          color: display.textColor ?? display.color,
          fontSize: 12, fontWeight: 600,
          cursor: disabled ? "default" : "pointer",
          whiteSpace: "nowrap", boxSizing: "border-box",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ flex: 1 }}>{display.label}</span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: display.textColor ?? display.color }} />
      </button>
      {open && (
        <>
          <DropdownBackdrop onClose={() => setOpen(false)} />
          <DropdownPanel role="listbox">
            {options.map((opt) => {
              const active = isCombinedMatch(stage, status, opt, skipAssembly);
              const blockedByIssue =
                installCompleteBlocked && isInstallCompleteCombinedOptionKey(opt.key);
              return (
                <DropdownItem
                  key={opt.key}
                  label={opt.label}
                  icon={<CombinedScopeOptionLeadingIcon opt={opt} />}
                  active={active}
                  color={opt.color}
                  title={
                    blockedByIssue ? t("installCompleteOptionDisabledTitle") : undefined
                  }
                  disabled={blockedByIssue}
                  onClick={() => {
                    if (!blockedByIssue) {
                      onChange(opt.stage, opt.status);
                      setOpen(false);
                    }
                  }}
                />
              );
            })}
            <div style={{ borderTop: "1px solid var(--neutral-100)", margin: "4px 0" }} />
            <DropdownItem
              label="Not started"
              muted
              onClick={() => { onChange(null, "NOT_STARTED"); setOpen(false); }}
            />
          </DropdownPanel>
        </>
      )}
      {installCompleteBlocked && !disabled && (
        <p style={{ margin: "6px 0 0", fontSize: 10, lineHeight: 1.35, color: "var(--error-600)", fontWeight: 500 }}>
          {t("installCompleteBlockedHint")}
        </p>
      )}
    </div>
  );
}

function ScopeTableRow({
  scope,
  projectId,
  unitRef,
  location,
  onSaved,
  isLast,
  canManageStatus = false,
  canCalibrate = false,
  hasIssue = false,
  hasBlockingIssue = false,
  blockingInstallComplete = false,
  currentUserId,
  currentUserRole,
}: {
  scope: ScopeRow;
  projectId: string;
  unitRef: string;
  location: BurnLocation;
  onSaved: (id: string, updates: Partial<ScopeRow>) => void;
  isLast: boolean;
  canManageStatus?: boolean;
  canCalibrate?: boolean;
  hasIssue?: boolean;
  hasBlockingIssue?: boolean;
  blockingInstallComplete?: boolean;
  currentUserId?: string;
  currentUserRole?: string;
}) {
  const { saving, savingSubcontractor, patch } = useScopePatch(scope, projectId, onSaved, blockingInstallComplete);
  const isFieldLeadership = isFieldLeadershipRole(currentUserRole ?? "");

  return (
    <ScopeInspectionProvider
      scope={scope}
      projectId={projectId}
      unitId={scope.id}
      canManageStatus={canManageStatus}
      canCalibrate={canCalibrate}
      isAdmin={isFieldLeadership}
      applyLocalScopeUpdates={(updates) => onSaved(scope.id, updates)}
      patchScopeRow={canManageStatus ? patch : undefined}
      locationParts={{ building: location.building, level: location.level, unit: location.unit }}
      currentUserId={currentUserId}
    >
      <ScopeTableRowInner
        scope={scope}
        projectId={projectId}
        unitRef={unitRef}
        location={location}
        isLast={isLast}
        canManageStatus={canManageStatus}
        canCalibrate={canCalibrate}
        isAdmin={isFieldLeadership}
        hasIssue={hasIssue}
        hasBlockingIssue={hasBlockingIssue}
        blockingInstallComplete={blockingInstallComplete}
        currentUserId={currentUserId}
        saving={saving}
        savingSubcontractor={savingSubcontractor}
        patch={patch}
      />
    </ScopeInspectionProvider>
  );
}

function ScopeTableRowInner({
  scope,
  projectId,
  unitRef,
  location,
  isLast,
  canManageStatus,
  canCalibrate,
  isAdmin,
  hasIssue,
  hasBlockingIssue,
  blockingInstallComplete,
  currentUserId,
  saving,
  savingSubcontractor,
  patch,
}: {
  scope: ScopeRow;
  projectId: string;
  unitRef: string;
  location: BurnLocation;
  isLast: boolean;
  canManageStatus: boolean;
  canCalibrate: boolean;
  isAdmin: boolean;
  hasIssue: boolean;
  hasBlockingIssue: boolean;
  blockingInstallComplete: boolean;
  currentUserId?: string;
  saving: boolean;
  savingSubcontractor: boolean;
  patch: (
    u: Partial<ScopeRow>,
    activityHints?: { subcontractorDisplayName?: string },
  ) => void;
}) {
  const t = useTranslations("units");
  const tInsp = useTranslations("inspections");
  const { submissions, hydrated, nonCalibrationSubmissions, openPicker } = useScopeInspection();
  const pct = clampPct(scope.percentComplete);
  const scopeName = scope.scopeType?.canonicalScopeType?.displayName ?? scope.scopeType?.name ?? scope.description ?? "—";
  const installLocked = scopeInstallLockedByClearInspection(submissions);
  const pickersDisabled = saving || installLocked || !canManageStatus;
  const skipAssembly = scopeTypeSkipsAssemblyStage(scope.scopeType);
  const [pendingScopePick, setPendingScopePick] = useState<PendingScopePick | null>(null);

  return (
    <tr style={{ borderBottom: isLast ? "none" : "1px solid var(--neutral-100)" }}>
      {/* SCOPE */}
      <td style={{ padding: "var(--inline-gap) var(--card-padding)", verticalAlign: "middle" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite", color: "var(--neutral-400)", flexShrink: 0, marginTop: 2 }} />}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: "var(--neutral-900)" }}>
              {scopeName}
              {hasIssue && (
                <span aria-label="Has open issues" title="Has open issues" style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                  <AlertTriangle size={13} color={hasBlockingIssue ? ISSUE_COLOR_BLOCKING : ISSUE_COLOR_NONBLOCKING} aria-hidden />
                </span>
              )}
            </div>
            <div style={{ marginTop: 4 }}>
              <SubcontractorPicker
                value={scope.unifierSubId}
                readOnly={!canManageStatus}
                disabled={saving}
                saving={savingSubcontractor}
                onChange={(id, displayName) =>
                  patch(
                    { unifierSubId: id },
                    displayName ? { subcontractorDisplayName: displayName } : undefined,
                  )}
                projectId={projectId}
                userId={currentUserId}
              />
            </div>
            {/* Progress bar under scope name */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <div style={{ width: 80, height: 3, borderRadius: 99, backgroundColor: "var(--neutral-100)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, backgroundColor: pct >= 100 ? "var(--success-600)" : pct > 0 ? "var(--primary-500)" : "var(--neutral-200)" }} />
              </div>
              <span style={{ fontSize: 11, color: "var(--neutral-400)" }}>{pct}%</span>
            </div>
          </div>
        </div>
      </td>

      {/* STATUS (combined stage+status) — locked when inspection is active */}
      <td colSpan={2} style={{ padding: "var(--inline-gap)", verticalAlign: "middle" }}>
        <ScopeTableCombinedDropdown
          stage={scope.scopeStage}
          status={scope.scopeStatus}
          disabled={pickersDisabled}
          skipAssembly={skipAssembly}
          installCompleteBlocked={blockingInstallComplete}
          onChange={(stage, status) => {
            setPendingScopePick(
              buildPendingScopePickFields(
                scope,
                { scopeStage: stage, scopeStatus: status },
                scopeName,
                skipAssembly,
              ),
            );
          }}
        />
        {pendingScopePick && (
          <StatusUpdatePhotoPrompt
            scopeName={pendingScopePick.scopeName}
            statusDisplayLabel={pendingScopePick.statusDisplayLabel}
            projectId={projectId}
            unitRef={unitRef}
            location={location}
            requireSubcontractorAssignment={pendingScopePick.requireSubcontractorAssignment}
            initialSubcontractorId={scope.unifierSubId}
            currentUserId={currentUserId}
            onSaveStatus={(assignment) => {
              const { updates, hints } = mergeStatusUpdateAssignment(
                pendingScopePick.updates,
                assignment,
              );
              patch(updates, hints);
            }}
            onDone={() => setPendingScopePick(null)}
            onCancel={() => setPendingScopePick(null)}
          />
        )}
      </td>

      {/* INSPECTIONS — form-driven badges; start via hub-style picker */}
      <td style={{ padding: "var(--inline-gap) var(--card-padding)", verticalAlign: "middle" }}>
        {hydrated && nonCalibrationSubmissions.length === 0 && canManageStatus ? (
          <button
            type="button"
            onClick={() => openPicker("picker")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 30,
              padding: "0 10px",
              borderRadius: "var(--radius-sm)",
              border: "1.5px solid var(--primary-400)",
              backgroundColor: "var(--primary-50)",
              color: "var(--primary-700)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontFamily: "inherit",
            }}
          >
            <ClipboardCheck size={13} aria-hidden />
            {tInsp("startInspection")}
          </button>
        ) : (
          <ScopeInspectionsBand />
        )}
      </td>
    </tr>
  );
}

/** Card-style scope row: name + crew header; tap stage/status + bottom sheets (mobile). */
function ScopeStackedBlock({
  scope,
  projectId,
  unitRef,
  location,
  onSaved,
  canManageStatus = false,
  canCalibrate = false,
  isAdmin = false,
  showQty = false,
  pickerLayout = "row",
  onReportIssue,
  installCompleteBlocked = false,
  currentUserId,
}: {
  scope: ScopeRow;
  projectId: string;
  unitRef: string;
  location: BurnLocation;
  onSaved: (id: string, updates: Partial<ScopeRow>) => void;
  canManageStatus?: boolean;
  canCalibrate?: boolean;
  isAdmin?: boolean;
  showQty?: boolean;
  pickerLayout?: "row" | "column";
  onReportIssue?: (rowId: string) => void;
  installCompleteBlocked?: boolean;
  currentUserId?: string;
}) {
  const t = useTranslations("units");
  const { saving, savingSubcontractor, patch } = useScopePatch(scope, projectId, onSaved, installCompleteBlocked);
  const scopeName = scope.scopeType?.canonicalScopeType?.displayName ?? scope.scopeType?.name ?? scope.description ?? "—";
  const skipAssembly = scopeTypeSkipsAssemblyStage(scope.scopeType);
  const [pendingScopePick, setPendingScopePick] = useState<PendingScopePick | null>(null);

  const requestPick = useCallback(
    (updates: Partial<ScopeRow>) => {
      if (updates.scopeStage !== undefined || updates.scopeStatus !== undefined) {
        setPendingScopePick(buildPendingScopePickFields(scope, updates, scopeName, skipAssembly));
      } else {
        patch(updates);
      }
    },
    [patch, scope, scopeName, skipAssembly],
  );

  const installedQty =
    scope.scopeStage === "INSTALL" && scope.scopeStatus === "COMPLETE"
      ? (scope.qty ?? null)
      : 0;

  return (
    <ScopeInspectionProvider
      scope={scope}
      projectId={projectId}
      unitId={scope.id}
      canManageStatus={canManageStatus}
      canCalibrate={canCalibrate}
      isAdmin={isAdmin}
      applyLocalScopeUpdates={(updates) => onSaved(scope.id, updates)}
      patchScopeRow={canManageStatus ? patch : undefined}
      locationParts={{ building: location.building, level: location.level, unit: location.unit }}
      currentUserId={currentUserId}
    >
      <ScopeStackedBlockBody
        scope={scope}
        scopeName={scopeName}
        saving={saving}
        savingSubcontractor={savingSubcontractor}
        patch={requestPick}
        canManageStatus={canManageStatus}
        canCalibrate={canCalibrate}
        isAdmin={isAdmin}
        showQty={showQty}
        skipAssembly={skipAssembly}
        onReportIssue={onReportIssue}
        installCompleteBlocked={installCompleteBlocked}
        projectId={projectId}
        unitRef={unitRef}
        location={location}
        installedQty={installedQty}
        pendingScopePick={pendingScopePick}
        setPendingScopePick={setPendingScopePick}
        savePendingStatus={(assignment) => {
          if (!pendingScopePick) return;
          const { updates, hints } = mergeStatusUpdateAssignment(
            pendingScopePick.updates,
            assignment,
          );
          patch(updates, hints);
        }}
        dismissPendingPick={() => setPendingScopePick(null)}
        currentUserId={currentUserId}
        t={t}
      />
    </ScopeInspectionProvider>
  );
}

function ScopeStackedBlockBody({
  scope,
  scopeName,
  saving,
  savingSubcontractor,
  patch,
  canManageStatus,
  canCalibrate,
  isAdmin,
  showQty,
  skipAssembly,
  onReportIssue,
  installCompleteBlocked,
  projectId,
  unitRef,
  location,
  installedQty,
  pendingScopePick,
  setPendingScopePick,
  savePendingStatus,
  dismissPendingPick,
  currentUserId,
  t,
}: {
  scope: ScopeRow;
  scopeName: string;
  saving: boolean;
  savingSubcontractor: boolean;
  patch: (
    u: Partial<ScopeRow>,
    activityHints?: { subcontractorDisplayName?: string },
  ) => void;
  canManageStatus: boolean;
  canCalibrate: boolean;
  isAdmin: boolean;
  showQty: boolean;
  skipAssembly: boolean;
  onReportIssue?: (rowId: string) => void;
  installCompleteBlocked: boolean;
  projectId: string;
  unitRef: string;
  location: BurnLocation;
  installedQty: number | null;
  pendingScopePick: PendingScopePick | null;
  setPendingScopePick: (v: PendingScopePick | null) => void;
  savePendingStatus: (assignment?: StatusUpdatePhotoAssignment) => void;
  dismissPendingPick: () => void;
  currentUserId?: string;
  t: ReturnType<typeof useTranslations<"units">>;
}) {
  const { submissions } = useScopeInspection();
  const installOptionsLocked = scopeStatusHubInstallOptionsLocked(submissions);
  const pickersDisabled = scopeStatusHubTriggerDisabled(saving, canManageStatus);

  return (
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Scope name header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          {saving && (
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite", color: "var(--neutral-400)", flexShrink: 0 }} />
          )}
          <div
            style={{
              margin: 0,
              fontSize: "var(--text-subheading)",
              fontWeight: "var(--font-weight-extrabold)",
              color: "var(--unit-detail-scope-card-fg)",
              lineHeight: 1.15,
              letterSpacing: "var(--tracking-tight)",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {scopeName}
          </div>
        </div>
        <div style={{ width: 160, maxWidth: "48%", flexShrink: 0 }}>
          <SubcontractorPicker
            value={scope.unifierSubId}
            readOnly={!canManageStatus}
            disabled={saving}
            saving={savingSubcontractor}
            onChange={(id, displayName) =>
              patch(
                { unifierSubId: id },
                displayName ? { subcontractorDisplayName: displayName } : undefined,
              )}
            projectId={projectId}
            userId={currentUserId}
          />
        </div>
      </div>

      <ScopeStatusHub
        scope={scope}
        pickersDisabled={pickersDisabled}
        installOptionsLocked={installOptionsLocked}
        patch={patch}
        skipAssembly={skipAssembly}
        onReportIssue={onReportIssue}
        installCompleteBlocked={installCompleteBlocked}
      />
      {pendingScopePick && (
        <StatusUpdatePhotoPrompt
          scopeName={pendingScopePick.scopeName}
          statusDisplayLabel={pendingScopePick.statusDisplayLabel}
          projectId={projectId}
          unitRef={unitRef}
          location={location}
          requireSubcontractorAssignment={pendingScopePick.requireSubcontractorAssignment}
          initialSubcontractorId={scope.unifierSubId}
          currentUserId={currentUserId}
          onSaveStatus={savePendingStatus}
          onDone={dismissPendingPick}
          onCancel={dismissPendingPick}
        />
      )}

      {showQty && scope.qty !== null && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: "var(--text-caption)", color: "var(--unit-detail-scope-card-meta)", fontWeight: "var(--font-weight-medium)", flexShrink: 0 }}>
            {t("qtyInstalledLabel")}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
            <span
              data-testid="scope-qty"
              style={{
                fontSize: "var(--text-caption)",
                fontWeight: "var(--font-weight-extrabold)",
                color: "var(--unit-detail-scope-card-fg)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "2px 0",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {installedQty}/{scope.qty}
            </span>
            <span style={{ fontSize: "var(--text-caption)", fontWeight: "var(--font-weight-semibold)", color: "var(--unit-detail-scope-card-meta)", flexShrink: 0 }}>
              {scope.uom?.code || "—"}
            </span>
          </span>
        </div>
      )}

      {/* Form-driven inspection band — replaces the legacy ad-hoc
          pass/fail picker. Inspectors now tap this to pick from a
          library of forms tagged to this scope's type and capture
          structured results. `unitId` is threaded down from the
          scope row for now; Phase 2 will wire a real unit context. */}
      <ScopeInspectionsBand />
    </div>
  );
}

// ── Sub-scope column (one sub-scope inside a parent scope card) ───────────────

/**
 * One column inside a sub-scoped scope card.
 * Mirrors the ScopeStackedBlock interaction model but scoped to a single
 * SubScopeInstance — own stage/status pickers and a QTY Installed line.
 */
// Grid template shared between the header row and each sub-scope row.
// Columns: [name flex] [combined status 204px] [qty 46px]
const SUB_SCOPE_ROW_GRID = "1fr 175px 46px 22px";

function SubScopeColumn({
  instance,
  rowId,
  parentUnifierSubId,
  projectId,
  unitRef,
  location,
  onInstanceSaved,
  patchParentScope,
  currentUserId,
  pickersDisabled,
  isLast,
  uom,
  skipAssembly = false,
  onReportIssue,
  hasIssue = false,
  blockingInstallComplete = false,
}: {
  instance: SubScopeInstance;
  rowId: string;
  parentUnifierSubId: string | null | undefined;
  projectId: string;
  unitRef: string;
  location: BurnLocation;
  onInstanceSaved: (rowId: string, instanceId: string, updates: Partial<SubScopeInstance>) => void;
  patchParentScope: (
    updates: Partial<ScopeRow>,
    activityHints?: { subcontractorDisplayName?: string },
  ) => Promise<boolean>;
  currentUserId?: string;
  pickersDisabled: boolean;
  isLast: boolean;
  uom?: { code: string; name: string } | null;
  skipAssembly?: boolean;
  onReportIssue?: (rowId: string) => void;
  hasIssue?: boolean;
  blockingInstallComplete?: boolean;
}) {
  const t = useTranslations("units");
  const { saving, patch } = useSubScopeInstancePatch(
    projectId,
    rowId,
    instance.id,
    instance,
    onInstanceSaved
  );
  const [pendingInstancePick, setPendingInstancePick] = useState<PendingInstancePick | null>(null);

  const stageVal = instance.scopeStage;
  const statusVal = instance.scopeStatus;
  const display = combinedOptionDisplay(stageVal, statusVal, skipAssembly);
  const subScopeOptions = getScopeCombinedOptions(skipAssembly);
  const [sheet, setSheet] = useState(false);
  const isDesktop = useIsDesktop();
  const subScopeTriggerRef = useRef<HTMLButtonElement>(null);

  const finishClose = useCallback(() => setSheet(false), []);

  const installedQty =
    instance.scopeStage === "INSTALL" && instance.scopeStatus === "COMPLETE"
      ? (instance.qty ?? null)
      : 0;
  const showQty = instance.qty !== null;

  const ROW_BTN_BASE: CSSProperties = {
    height: 40,
    width: "100%",
    padding: "0 8px",
    borderRadius: 8,
    border: "1.5px solid var(--neutral-300)",
    backgroundColor: "var(--neutral-0)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.02em",
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    boxSizing: "border-box" as const,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <>
      {/* Sub-scope row — grid aligned with header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: SUB_SCOPE_ROW_GRID,
          gap: "0 8px",
          alignItems: "center",
          padding: "10px 0",
          borderBottom: isLast ? "none" : "1px solid var(--neutral-100)",
        }}
      >
        {/* Name */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
          {saving && (
            <Loader2
              size={12}
              style={{ animation: "spin 1s linear infinite", color: "var(--neutral-400)", flexShrink: 0 }}
            />
          )}
          <span
            style={{
              fontSize: 13, fontWeight: 600, color: "var(--neutral-800)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {instance.subScope.name}
          </span>
          {hasIssue && (
            <span aria-label="Has open issue" title="Has open issue" style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
              <AlertTriangle
                size={13}
                color={blockingInstallComplete ? ISSUE_COLOR_BLOCKING : ISSUE_COLOR_NONBLOCKING}
                aria-hidden
              />
            </span>
          )}
        </div>

        {/* Combined status button */}
        <div style={{ position: "relative" }}>
          <button
            ref={subScopeTriggerRef}
            type="button"
            aria-label={`Status: ${display.label}`}
            aria-haspopup={isDesktop ? "menu" : "dialog"}
            aria-expanded={sheet}
            disabled={pickersDisabled}
            onClick={() => !pickersDisabled && setSheet((o) => !o)}
            style={{
              ...ROW_BTN_BASE,
              border: `1.5px solid ${display.triggerBg ?? display.bg}`,
              backgroundColor: display.triggerBg ?? display.bg,
              color: display.textColor ?? display.color,
              cursor: pickersDisabled ? "default" : "pointer",
              opacity: pickersDisabled ? 0.6 : 1,
              justifyContent: isDesktop ? "space-between" : "center",
              padding: isDesktop ? "0 8px" : "0 8px",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display.label}</span>
            {isDesktop && !pickersDisabled && (
              <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.7 }} aria-hidden />
            )}
          </button>
          {sheet && isDesktop && (
            <ScopeStatusDropdown
              options={subScopeOptions}
              activeStage={stageVal}
              activeStatus={statusVal}
              skipAssembly={skipAssembly}
              onPick={(opt) => {
                setSheet(false);
                setPendingInstancePick(
                  buildPendingInstancePickFields(
                    parentUnifierSubId,
                    instance,
                    { scopeStage: opt.stage, scopeStatus: opt.status },
                    instance.subScope.name,
                    opt.label,
                  ),
                );
              }}
              onNotStarted={() => {
                setSheet(false);
                setPendingInstancePick(
                  buildPendingInstancePickFields(
                    parentUnifierSubId,
                    instance,
                    { scopeStage: null, scopeStatus: "NOT_STARTED" },
                    instance.subScope.name,
                    combinedOptionDisplay(null, "NOT_STARTED", skipAssembly).label,
                  ),
                );
              }}
              onReportIssue={onReportIssue ? () => onReportIssue(rowId) : undefined}
              onClose={finishClose}
              anchorRef={subScopeTriggerRef}
              disableInstallComplete={blockingInstallComplete}
              installCompleteBlockedTitle={t("installCompleteOptionDisabledTitle")}
            />
          )}
        </div>

        {/* Installed qty badge */}
        {showQty ? (
          <span
            data-testid="sub-scope-qty"
            style={{
              fontSize: 11, fontWeight: 700, color: "var(--neutral-700)",
              border: "1px solid var(--neutral-250)",
              borderRadius: 6, padding: "3px 4px",
              textAlign: "center", whiteSpace: "nowrap",
            }}
          >
            {installedQty}/{instance.qty}
          </span>
        ) : (
          <span />
        )}

        {/* UOM */}
        <span style={{ fontSize: 10, fontWeight: 500, color: "var(--neutral-400)", alignSelf: "center" }}>
          {uom?.code || "—"}
        </span>
      </div>

      {/* Combined status bottom sheet — mobile only */}
      {sheet && !isDesktop && (
        <ScopeFieldBottomSheet
          title={t("colStatus")}
          closeLabel={t("pickerSheetClose")}
          onClose={finishClose}
        >
          {subScopeOptions.map((opt) => {
            const active = isCombinedMatch(stageVal, statusVal, opt, skipAssembly);
            const blockedByIssue =
              blockingInstallComplete && isInstallCompleteCombinedOptionKey(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                disabled={blockedByIssue}
                title={
                  blockedByIssue ? t("installCompleteOptionDisabledTitle") : undefined
                }
                onClick={() => {
                  if (!blockedByIssue) {
                    finishClose();
                    setPendingInstancePick(
                      buildPendingInstancePickFields(
                        parentUnifierSubId,
                        instance,
                        { scopeStage: opt.stage, scopeStatus: opt.status },
                        instance.subScope.name,
                        opt.label,
                      ),
                    );
                  }
                }}
                style={{
                  width: "100%", textAlign: "left", display: "flex", alignItems: "center",
                  justifyContent: "space-between", padding: "14px 20px", fontSize: 15,
                  fontWeight: active ? 700 : 400,
                  color: opt.color,
                  backgroundColor: active ? opt.bg : "transparent",
                  border: "none",
                  cursor: blockedByIssue ? "not-allowed" : "pointer",
                  opacity: blockedByIssue ? 0.45 : 1,
                  gap: 12,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <CombinedScopeOptionLeadingIcon opt={opt} />
                  {opt.label}
                </span>
                {active && <CheckCircle2 size={16} style={{ color: opt.color, flexShrink: 0 }} />}
              </button>
            );
          })}
          <div style={{ height: 8, backgroundColor: "var(--neutral-50)" }} aria-hidden />
          <button
            type="button"
            onClick={() => {
              finishClose();
              setPendingInstancePick(
                buildPendingInstancePickFields(
                  parentUnifierSubId,
                  instance,
                  { scopeStage: null, scopeStatus: "NOT_STARTED" },
                  instance.subScope.name,
                  combinedOptionDisplay(null, "NOT_STARTED", skipAssembly).label,
                ),
              );
            }}
            style={{
              width: "100%", textAlign: "left", display: "flex", alignItems: "center",
              minHeight: 52, padding: "14px 20px", border: "none",
              backgroundColor: "transparent", fontSize: 15, fontWeight: 400,
              color: "var(--neutral-400)", cursor: "pointer",
            }}
          >
            Not started
          </button>
          <div style={{ height: 1, backgroundColor: "var(--neutral-100)", margin: "0 20px" }} aria-hidden />
          <button
            type="button"
            onClick={() => { finishClose(); onReportIssue?.(rowId); }}
            style={{
              width: "100%", textAlign: "left", display: "flex", alignItems: "center",
              gap: 10, minHeight: 52, padding: "14px 20px", border: "none",
              backgroundColor: "transparent", fontSize: 15, fontWeight: 500,
              color: "var(--error-600)", cursor: "pointer",
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            Report an issue
          </button>
        </ScopeFieldBottomSheet>
      )}
      {pendingInstancePick && (
        <StatusUpdatePhotoPrompt
          scopeName={pendingInstancePick.scopeName}
          statusDisplayLabel={pendingInstancePick.statusDisplayLabel}
          projectId={projectId}
          unitRef={unitRef}
          location={location}
          requireSubcontractorAssignment={pendingInstancePick.requireSubcontractorAssignment}
          initialSubcontractorId={parentUnifierSubId}
          currentUserId={currentUserId}
          onSaveStatus={async (assignment) => {
            if (pendingInstancePick.requireSubcontractorAssignment && assignment) {
              const subOk = await patchParentScope(
                { unifierSubId: assignment.unifierSubId },
                assignment.subcontractorDisplayName
                  ? { subcontractorDisplayName: assignment.subcontractorDisplayName }
                  : undefined,
              );
              if (!subOk) return;
            }
            await patch(pendingInstancePick.updates);
          }}
          onDone={() => setPendingInstancePick(null)}
          onCancel={() => setPendingInstancePick(null)}
        />
      )}
    </>
  );
}

// ── Scope grid card (mobile modal 2-column grid) ──────────────────────────────

// ── Derived parent-scope state from sub-scope instances ──────────────────────
// Stage order used to find the "lowest" (least advanced) active stage.

function deriveSubScopeParentState(instances: SubScopeInstance[]): {
  scopeStage: ScopeStage;
  scopeStatus: ScopeStatus;
  label: string;
  sublabel: string | null;
} {
  const n = instances.length;
  if (n === 0) return { scopeStage: null, scopeStatus: null, label: "—", sublabel: null };

  const completeCount = instances.filter(
    (i) => i.scopeStage === "INSTALL" && i.scopeStatus === "COMPLETE"
  ).length;
  const pendingVerificationCount = instances.filter(
    (i) => i.scopeStage === "INSTALL" && i.scopeStatus === "PENDING_VERIFICATION"
  ).length;
  const blockedCount = instances.filter((i) => i.scopeStatus === "BLOCKED").length;
  const notStartedCount = instances.filter((i) => !i.scopeStage).length;

  if (completeCount === n) {
    return { scopeStage: "INSTALL", scopeStatus: "COMPLETE", label: "Install: Complete", sublabel: `All ${n} complete` };
  }
  if (completeCount + pendingVerificationCount === n && pendingVerificationCount > 0) {
    return {
      scopeStage: "INSTALL",
      scopeStatus: "PENDING_VERIFICATION",
      label: "Install: Complete-Unverified",
      sublabel: `${completeCount}/${n} verified`,
    };
  }
  if (notStartedCount === n) {
    return { scopeStage: null, scopeStatus: null, label: "Not started", sublabel: null };
  }
  if (blockedCount > 0) {
    return {
      scopeStage: instances.find((i) => i.scopeStatus === "BLOCKED")?.scopeStage ?? null,
      scopeStatus: "BLOCKED",
      label: "Blocked",
      sublabel: `${blockedCount} of ${n} blocked`,
    };
  }

  const sublabel = completeCount > 0 && completeCount < n
    ? `${completeCount}/${n} installed`
    : null;

  return {
    scopeStage: "INSTALL",
    scopeStatus: "IN_PROGRESS",
    label: "Install: In Progress",
    sublabel,
  };
}

/**
 * Renders one scope card in the mobile unit detail modal's 2-column grid.
 *
 * Branch A — no sub-scopes: half-width compact card (stage, status, QTY, installer, inspection).
 * Branch B — has sub-scopes: full-width card spanning both columns with a nested
 *   sub-scope column layout matching the wireframe.
 */
function ScopeGridCard({
  scope,
  projectId,
  unitRef,
  location,
  onSaved,
  onInstanceSaved,
  canManageStatus = false,
  canCalibrate = false,
  onReportIssue,
  hasIssue = false,
  hasBlockingIssue = false,
  subScopeInstanceIdsWithIssues = [],
  issueMeta,
  currentUserId,
  currentUserRole,
}: {
  scope: ScopeRow;
  projectId: string;
  unitRef: string;
  location: BurnLocation;
  onSaved: (id: string, updates: Partial<ScopeRow>) => void;
  onInstanceSaved: (rowId: string, instanceId: string, updates: Partial<SubScopeInstance>) => void;
  canManageStatus?: boolean;
  canCalibrate?: boolean;
  onReportIssue?: (rowId: string) => void;
  hasIssue?: boolean;
  hasBlockingIssue?: boolean;
  currentUserId?: string;
  currentUserRole?: string;
  subScopeInstanceIdsWithIssues?: string[];
  issueMeta: UnitIssueMeta;
}) {
  const t = useTranslations("units");
  const tOffline = useTranslations("offlineIndicator");
  const { isOnline } = useOfflineStatus();
  const hasSubScopes = scope.subScopeInstances.length > 0;
  const scopeName = scope.scopeType?.canonicalScopeType?.displayName ?? scope.scopeType?.name ?? scope.description ?? "—";
  const [markingAll, setMarkingAll] = useState(false);
  const skipAssembly = scopeTypeSkipsAssemblyStage(scope.scopeType);

  // Parent scope patch — used to keep the ProjectRow stage/status in sync automatically
  const { saving, savingSubcontractor, patch: patchScope } = useScopePatch(
    scope,
    projectId,
    onSaved,
    scopeRowBlockingInstallComplete(scope.id, issueMeta),
  );
  const isFieldLeadership = isFieldLeadershipRole(currentUserRole ?? "");

  // Derived state from sub-scope instances (read-only — never manually edited)
  const derived = deriveSubScopeParentState(scope.subScopeInstances);
  const derivedStatusStyle = derived.scopeStatus ? STATUS_COLORS[derived.scopeStatus] : null;

  // Wrap onInstanceSaved so that every sub-scope change also re-derives and patches the parent
  const handleInstanceSaved = useCallback(
    (rowId: string, instanceId: string, updates: Partial<SubScopeInstance>) => {
      onInstanceSaved(rowId, instanceId, updates);
      // Compute what the new full set of instances looks like after this optimistic update
      const updatedInstances = scope.subScopeInstances.map((inst) =>
        inst.id === instanceId ? { ...inst, ...updates } : inst
      );
      const { scopeStage, scopeStatus } = deriveSubScopeParentState(updatedInstances);
      // Only patch if state actually changed
      if (scopeStage !== scope.scopeStage || scopeStatus !== scope.scopeStatus) {
        void patchScope({ scopeStage, scopeStatus });
      }
    },
    [onInstanceSaved, patchScope, scope.subScopeInstances, scope.scopeStage, scope.scopeStatus]
  );

  const allComplete = scope.subScopeInstances.length > 0 &&
    scope.subScopeInstances.every(
      (inst) => inst.scopeStage === "INSTALL" && inst.scopeStatus === "COMPLETE"
    );

  const canMarkAnyIncomplete =
    scope.subScopeInstances.some(
      (inst) =>
        !(inst.scopeStage === "INSTALL" && inst.scopeStatus === "COMPLETE") &&
        !subScopeInstanceBlockingInstallComplete(issueMeta, scope.id, inst.id)
    );

  async function handleMarkAllComplete() {
    if (markingAll || allComplete) return;
    if (!isOnline) {
      toast.error(tOffline("offlineActionUnavailable"));
      return;
    }
    const toUpdate = scope.subScopeInstances.filter(
      (inst) =>
        !(inst.scopeStage === "INSTALL" && inst.scopeStatus === "COMPLETE") &&
        !subScopeInstanceBlockingInstallComplete(issueMeta, scope.id, inst.id)
    );
    if (toUpdate.length === 0) return;
    setMarkingAll(true);
    for (const inst of toUpdate) {
      onInstanceSaved(scope.id, inst.id, { scopeStage: "INSTALL", scopeStatus: "COMPLETE" });
    }
    const mergedInstances = scope.subScopeInstances.map((inst) =>
      toUpdate.some((u) => u.id === inst.id)
        ? { ...inst, scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const }
        : inst
    );
    const { scopeStage: derivedStage, scopeStatus: derivedStatus } =
      deriveSubScopeParentState(mergedInstances);
    void patchScope({ scopeStage: derivedStage, scopeStatus: derivedStatus });
    try {
      const results = await Promise.all(
        toUpdate.map((inst) =>
          fetch(`/api/projects/${projectId}/sub-scopes/instances/${inst.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scopeStage: "INSTALL", scopeStatus: "COMPLETE" }),
          })
        )
      );
      for (const res of results) {
        if (!res.ok && res.status === 422) {
          let errBody: unknown;
          try {
            errBody = await res.json();
          } catch {
            errBody = null;
          }
          toastInstallCompletePatchError(t, res.status, errBody);
        }
      }
    } catch (err) {
      console.warn("[ScopeGridCard] mark all complete error:", err);
    } finally {
      setMarkingAll(false);
    }
  }

  const cardStyle: CSSProperties = {
    position: "relative",
    backgroundColor: "var(--unit-detail-scope-card-bg)",
    borderRadius: "var(--unit-detail-scope-card-radius)",
    boxShadow: "var(--unit-detail-scope-card-shadow)",
    border: "none",
    outline: hasBlockingIssue ? "2px solid var(--unit-grid-card-issue-outline)" : "none",
    outlineOffset: 0,
    overflow: "hidden",
  };

  // ── Branch B: has sub-scopes ────────────────────────────────────────────────
  if (hasSubScopes) {
    // Inspection status is read from the parent row (shown once in shared footer)
    return (
      <article style={cardStyle} data-testid="scope-grid-card-subscoped">
        {/* Issue corner triangle — red for blocking, orange for non-blocking */}
        {hasIssue && (
          <div aria-hidden style={{ position: "absolute", top: 0, right: 0, zIndex: 1, pointerEvents: "none" }}>
            <div style={{ width: 0, height: 0, borderStyle: "solid", borderWidth: "0 28px 28px 0", borderColor: `transparent ${hasBlockingIssue ? ISSUE_TRIANGLE_BLOCKING : ISSUE_TRIANGLE_NONBLOCKING} transparent transparent` }} />
          </div>
        )}
        {/* Header */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "none",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          {/* Left: name + subscope count — top-padded 2px so text baseline lines up with badge pill */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flex: 1, minWidth: 0, paddingTop: 2 }}>
            <span style={{ fontSize: "var(--text-subheading)", fontWeight: "var(--font-weight-extrabold)", color: "var(--unit-detail-scope-card-fg)", whiteSpace: "nowrap", letterSpacing: "var(--tracking-tight)" }}>
              {scopeName}
            </span>
            {hasIssue && (
              <span aria-label="Has open issues" title="Has open issues" style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                <AlertTriangle size={13} color={hasBlockingIssue ? ISSUE_COLOR_BLOCKING : ISSUE_COLOR_NONBLOCKING} aria-hidden />
              </span>
            )}
            <span style={{ fontSize: "var(--text-caption)", color: "var(--unit-detail-scope-card-meta)", fontWeight: "var(--font-weight-semibold)", whiteSpace: "nowrap" }}>
              {t("subScopesHeaderSuffix", { count: scope.subScopeInstances.length })}
            </span>
          </div>

          {/* Right: derived status badge + sublabel stacked */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                aria-label={`Overall scope status: ${derived.label}`}
                style={{
                  display: "inline-block",
                  padding: "3px 10px",
                  borderRadius: 99,
                  fontSize: "var(--text-micro)",
                  fontWeight: "var(--font-weight-extrabold)",
                  border: "none",
                  letterSpacing: "var(--tracking-ui)",
                backgroundColor: derivedStatusStyle?.bg ?? "var(--neutral-100)",
                  color: derivedStatusStyle?.color ?? "var(--neutral-500)",
                  whiteSpace: "nowrap",
                }}
              >
                {derived.label}
              </span>
              {scope._pendingSync && (
                <Clock
                  size={12}
                  aria-label={t("pendingSync")}
                  style={{ color: "var(--warning-600)", flexShrink: 0 }}
                />
              )}
            </div>
            {derived.sublabel && (
              <span style={{ fontSize: "var(--text-micro)", color: "var(--unit-detail-scope-card-meta)", fontWeight: "var(--font-weight-semibold)", whiteSpace: "nowrap" }}>
                {derived.sublabel}
              </span>
            )}
          </div>
        </div>

        {/* Sub-scope table */}
        <div style={{ padding: "0 14px 4px" }}>
          {/* Column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: SUB_SCOPE_ROW_GRID,
              gap: "0 8px",
              padding: "8px 0 4px",
              borderBottom: "1px solid var(--neutral-150)",
            }}
          >
            <span style={STACKED_LABEL}>Sub-scope</span>
            <span style={STACKED_LABEL}>Status</span>
            <span style={{ ...STACKED_LABEL, textAlign: "center" }}>QTY</span>
            <span aria-hidden />
          </div>
          {/* One row per sub-scope */}
          {scope.subScopeInstances.map((inst, idx) => (
            <SubScopeColumn
              key={inst.id}
              instance={inst}
              rowId={scope.id}
              parentUnifierSubId={scope.unifierSubId}
              projectId={projectId}
              unitRef={unitRef}
              location={location}
              onInstanceSaved={handleInstanceSaved}
              patchParentScope={patchScope}
              currentUserId={currentUserId}
              pickersDisabled={!canManageStatus || inst.inspectionStatus !== null}
              isLast={idx === scope.subScopeInstances.length - 1}
              uom={scope.uom}
              skipAssembly={skipAssembly}
              onReportIssue={onReportIssue}
              hasIssue={subScopeInstanceIdsWithIssues.includes(inst.id)}
              blockingInstallComplete={subScopeInstanceBlockingInstallComplete(issueMeta, scope.id, inst.id)}
            />
          ))}

          {/* Total qty — read-only installed/total matching the per-row badge style */}
          {(() => {
            const hasAnyQty = scope.subScopeInstances.some((i) => i.qty !== null);
            if (!hasAnyQty) return null;
            const totalQty = scope.subScopeInstances.reduce((sum, i) => sum + (i.qty ?? 0), 0);
            const installedTotal = scope.subScopeInstances.reduce((sum, i) =>
              sum + (i.scopeStage === "INSTALL" && i.scopeStatus === "COMPLETE" ? (i.qty ?? 0) : 0), 0);
            return (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: SUB_SCOPE_ROW_GRID,
                  gap: "0 8px",
                  alignItems: "center",
                  padding: "6px 0 8px",
                  borderTop: "none",
                }}
              >
                {/* spacer */}
                <span aria-hidden />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--neutral-400)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingRight: 6,
                  }}
                >
                  Total
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "var(--neutral-700)",
                    backgroundColor: "var(--neutral-200)",
                    borderRadius: 6,
                    padding: "3px 4px",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {installedTotal}/{totalQty}
                </span>
                <span style={{ fontSize: 10, fontWeight: 500, color: "var(--neutral-400)", alignSelf: "center" }}>
                  {scope.uom?.code || "—"}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Mark all complete — shown only when user can manage status */}
        {canManageStatus && (
          <div style={{ padding: "8px 14px", borderTop: "1px solid var(--neutral-100)" }}>
            {allComplete ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={14} style={{ color: "var(--success-500, #22c55e)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--success-600, #16a34a)" }}>
                  All sub-scopes installed &amp; complete
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleMarkAllComplete()}
                disabled={markingAll || !canMarkAnyIncomplete}
                title={!canMarkAnyIncomplete ? t("installCompleteOptionDisabledTitle") : undefined}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 10px", borderRadius: "var(--radius-md)",
                  border: "none",
                  backgroundColor: "transparent",
                  color: markingAll || !canMarkAnyIncomplete ? "var(--neutral-400)" : "var(--success-700, #15803d)",
                  fontSize: 12, fontWeight: 600,
                  cursor: markingAll || !canMarkAnyIncomplete ? "default" : "pointer",
                }}
              >
                {markingAll
                  ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
                  : <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
                }
                {markingAll ? "Marking…" : "Mark all as Install: Complete"}
              </button>
            )}
          </div>
        )}

        {/* Shared footer: subcontractor + inspection */}
        <div
          style={{
            padding: "10px 14px 12px",
            borderTop: "none",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <SubcontractorPicker
            value={scope.unifierSubId}
            readOnly={!canManageStatus}
            disabled={saving}
            saving={savingSubcontractor}
            onChange={(id, displayName) =>
              patchScope(
                { unifierSubId: id },
                displayName ? { subcontractorDisplayName: displayName } : undefined,
              )}
            projectId={projectId}
            userId={currentUserId}
          />
          <ScopeInspectionProvider
            scope={scope}
            projectId={projectId}
            unitId={scope.id}
            canManageStatus={canManageStatus}
            canCalibrate={canCalibrate}
            isAdmin={isFieldLeadership}
            applyLocalScopeUpdates={(updates) => onSaved(scope.id, updates)}
            patchScopeRow={canManageStatus ? patchScope : undefined}
            locationParts={{ building: location.building, level: location.level, unit: location.unit }}
            currentUserId={currentUserId}
          >
            <ScopeInspectionsBand />
          </ScopeInspectionProvider>
        </div>
      </article>
    );
  }

  // ── Branch A: no sub-scopes (compact half-width card) ──────────────────────
  return (
    <article style={cardStyle} data-testid="scope-grid-card-plain">
      {/* Issue corner triangle — red for blocking, orange for non-blocking */}
      {hasIssue && (
        <div aria-hidden style={{ position: "absolute", top: 0, right: 0, zIndex: 1, pointerEvents: "none" }}>
          <div style={{ width: 0, height: 0, borderStyle: "solid", borderWidth: "0 28px 28px 0", borderColor: `transparent ${hasBlockingIssue ? ISSUE_TRIANGLE_BLOCKING : ISSUE_TRIANGLE_NONBLOCKING} transparent transparent` }} />
        </div>
      )}
      {scope._pendingSync && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px",
            backgroundColor: "var(--warning-100)",
            borderBottom: "1px solid var(--warning-600)",
            fontSize: 10, fontWeight: 600,
            color: "var(--warning-600)",
          }}
        >
          <Clock size={10} aria-hidden />
          {t("pendingSync")}
        </div>
      )}
      <ScopeStackedBlock
        scope={scope}
        projectId={projectId}
        unitRef={unitRef}
        location={location}
        onSaved={onSaved}
        canManageStatus={canManageStatus}
        canCalibrate={canCalibrate}
        isAdmin={isFieldLeadership}
        showQty
        pickerLayout="column"
        onReportIssue={onReportIssue}
        installCompleteBlocked={scopeRowBlockingInstallComplete(scope.id, issueMeta)}
        currentUserId={currentUserId}
      />
    </article>
  );
}

// ── Observation list types + helpers ─────────────────────────────────────────

export interface IssueSummary {
  id: string;
  issueType: string;
  responsibleParty: string;
  responsibleParties?: string[];
  isBlockingWork: boolean;
  status: string;
  shortDescription: string;
  notes?: string | null;
  missingMaterialDescription?: string | null;
  missingMaterialQuantity?: number | string | null;
  missingMaterialUomCode?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  unitRef?: string | null;
  buildPhaseTag?: string | null;
  areaTag?: string | null;
  bulkGroupId?: string | null;
  bulkGroupCount?: number | null;
  createdBy: { id: string; name: string | null; email: string };
  resolvedBy?: { id: string; name: string | null; email: string } | null;
  attachments: ObsAttachment[];
  scopeTags: Array<{ row: { id: string; scopeType?: { name: string } | null } }>;
  subScopeTags?: Array<{
    subScopeInstance: {
      id: string;
      subScope: { name: string };
      row: { id: string; scopeType?: { name: string } | null };
    };
  }>;
  _count: { comments: number };
  /** True when this item was created offline and has not yet synced to the server. */
  _pendingSync?: boolean;
}

export interface ObsAttachment {
  id: string;
  storageKey: string;
  storageUrl: string;
  mimeType: string;
  fileSizeBytes: number | null;
  caption?: string | null;
  transcriptStatus?: string;
  transcriptOriginal?: string | null;
  transcriptEnglish?: string | null;
  /** Legacy: older flattened-JPEG chain; API no longer returns version stacks. */
  supersedesId?: string | null;
  lastMarkedAt?: string | null;
  lastMarkedBy?: { id: string; name: string | null; email: string } | null;
  uploadedBy?: { id: string; name: string | null; email: string };
  /** @deprecated Server no longer sends prior versions */
  priorVersions?: ObsAttachment[];
  /** Non-destructive pencil/text overlay (v1 JSON), when present */
  imageAnnotation?: unknown | null;
  captureContext?: import("@/lib/media/serialize-capture-context").SerializedCaptureContext;
}

export interface ObsSummary {
  id: string;
  observationType: string;
  title: string;
  description: string;
  createdAt: string;
  unitRef?: string | null;
  buildPhaseTag?: string | null;
  areaTag?: string | null;
  author: { id: string; name: string | null; email: string };
  scopeTags: Array<{ row: { id: string; scopeType?: { name: string } | null } }>;
  attachments: ObsAttachment[];
  _count: { comments: number };
  /** True when this item was created offline and has not yet synced to the server. */
  _pendingSync?: boolean;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Renders a single image/video thumbnail with an offline-friendly fallback.
 *  When the image/video fails to load (e.g. cloud storage unreachable offline),
 *  or the device is already offline at render time, shows a "unavailable" placeholder
 *  so the card layout is preserved and the user knows media exists but isn't cached. */
function MediaThumb({ attachment }: { attachment: ObsAttachment }) {
  const t = useTranslations("units");
  const { isOnline } = useOfflineStatus();
  const [failed, setFailed] = useState(false);

  if (failed || !isOnline) {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 3, backgroundColor: "var(--neutral-100)",
      }}>
        <WifiOff size={13} aria-hidden style={{ color: "var(--neutral-400)" }} />
        <span style={{ fontSize: 8, color: "var(--neutral-400)", textAlign: "center", lineHeight: 1.2, padding: "0 2px" }}>
          {t("mediaUnavailableOffline")}
        </span>
      </div>
    );
  }

  if (attachment.mimeType?.startsWith("image/")) {
    return (
      <img
        src={attachment.storageUrl}
        alt={attachment.caption ?? ""}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <video
      src={attachment.storageUrl}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
      muted
      playsInline
      onError={() => setFailed(true)}
    />
  );
}

function ObsCard({
  obs,
  typeCatalog,
  onClick,
}: {
  obs: ObsSummary;
  typeCatalog: Array<{ code: string; displayName: string }>;
  onClick?: () => void;
}) {
  const tUnits = useTranslations("units");
  const meta = resolveObservationTypeBadgeMeta(obs.observationType, typeCatalog, tUnits);
  const scopeNames = obs.scopeTags
    .map((t) => t.row?.scopeType?.name)
    .filter(Boolean)
    .join(", ");
  const authorLabel = obs.author.name ?? obs.author.email.split("@")[0];
  const hasComments = obs._count.comments > 0;
  const imageThumbs = obs.attachments.filter((a) => a.mimeType?.startsWith("image/")).slice(0, 4);
  const videoThumbs = obs.attachments.filter((a) => a.mimeType?.startsWith("video/")).slice(0, 4 - imageThumbs.length);
  const thumbs = [...imageThumbs, ...videoThumbs].slice(0, 4);

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
      style={{
        borderRadius: "var(--radius-md)",
        border: "none",
        backgroundColor: "var(--color-secondary-subtle)",
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ padding: "10px 12px" }}>
        {/* Type badge — top left, plus pending-sync pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{
            display: "inline-block", fontSize: "var(--text-micro)", fontWeight: "var(--font-weight-extrabold)", padding: "2px 9px",
            borderRadius: "var(--radius-pill)", backgroundColor: meta.bg, color: meta.color,
          }}>
            {meta.label}
          </span>
          {obs._pendingSync && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3, fontSize: "var(--text-micro)", fontWeight: "var(--font-weight-semibold)",
              padding: "2px 7px", borderRadius: "var(--radius-pill)",
              backgroundColor: "var(--warning-100)", color: "var(--warning-600)",
              border: "none",
            }}>
              <WifiOff size={9} aria-hidden /> {tUnits("pendingSync")}
            </span>
          )}
        </div>

        {/* Title — primary text */}
        <p style={{
          margin: "0 0 4px", fontSize: "var(--text-body)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-primary)", lineHeight: 1.35,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {obs.title || obs.description}
        </p>

        {/* Notes preview (only shown if there's also a title) */}
        {obs.title && obs.description && (
          <p style={{
            margin: "0 0 4px", fontSize: "var(--text-caption)", color: "var(--color-text-tertiary)", lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {obs.description}
          </p>
        )}

        {/* Scope tag */}
        {scopeNames && (
          <div style={{ marginBottom: 6, fontSize: "var(--text-caption)", color: "var(--color-text-tertiary)" }}>
            {scopeNames}
          </div>
        )}

        {/* Thumbnail strip */}
        {thumbs.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "nowrap" }}>
            {thumbs.map((a) => (
              <div key={a.id} style={{ width: 56, height: 56, borderRadius: 7, overflow: "hidden", flexShrink: 0, backgroundColor: "var(--neutral-100)", position: "relative" }}>
                <MediaThumb attachment={a} />
              </div>
            ))}
            {obs.attachments.length > 4 && (
              <div style={{ width: 56, height: 56, borderRadius: "var(--radius-sm)", backgroundColor: "var(--control-bg)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--text-caption)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text-tertiary)" }}>
                +{obs.attachments.length - 4}
              </div>
            )}
          </div>
        )}

        {/* Footer: author · time · comments */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--text-caption)", color: "var(--color-text-tertiary)" }}>{authorLabel}</span>
          <span style={{ fontSize: "var(--text-caption)", color: "var(--color-text-disabled)" }}>·</span>
          <span style={{ fontSize: "var(--text-caption)", color: "var(--color-text-disabled)" }}>{timeAgo(obs.createdAt)}</span>
          {hasComments && (
            <>
              <span style={{ fontSize: "var(--text-caption)", color: "var(--color-text-disabled)" }}>·</span>
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "var(--text-caption)", color: "var(--color-text-tertiary)" }}>
                <MessageSquare size={10} /> {obs._count.comments}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Issue card (preview) ──────────────────────────────────────────────────────

function IssueCard({ issue, onClick, onResolveClick, onEditClick }: { issue: IssueSummary; onClick?: () => void; onResolveClick?: () => void; onEditClick?: () => void }) {
  return (
    <IssueLogRow
      issue={issue}
      variant="unit"
      onView={() => onClick?.()}
      onResolve={onResolveClick}
      onEdit={onEditClick}
    />
  );
}

// ── Expanded unit content ─────────────────────────────────────────────────────

export function UnitExpandedContent({
  card,
  projectId,
  onSaved,
  onInstanceSaved,
  onIssueMetaUpdated,
  layout = "inline",
  canManageStatus = false,
  canCalibrate = false,
  currentUserId,
  currentUserRole,
  onRefreshAll,
  fieldNotesOnly = false,
  unitContextOverride,
}: {
  card: UnitCard;
  projectId: string;
  onSaved: (scopeId: string, updates: Partial<ScopeRow>) => void;
  onInstanceSaved?: (rowId: string, instanceId: string, updates: Partial<SubScopeInstance>) => void;
  onIssueMetaUpdated?: (cardKey: string, meta: UnitIssueMeta) => void;
  layout?: "inline" | "stacked";
  canManageStatus?: boolean;
  canCalibrate?: boolean;
  currentUserId?: string;
  currentUserRole?: string;
  onRefreshAll?: () => void;
  /** Observations, issues, and photos only — no scopes or inspections (custom site locations). */
  fieldNotesOnly?: boolean;
  unitContextOverride?: {
    unitKey: string;
    building: string;
    level: string;
    unit: string;
    unitRef: string;
    area?: string;
  };
}) {
  const t = useTranslations("units");
  const stacked = fieldNotesOnly || layout === "stacked";
  const { observationTypes } = useObservationCatalog(projectId);

  // ── Modal state ────────────────────────────────────────────────────────────
  const [showAddObs, setShowAddObs] = useState(false);
  const [showAddIssue, setShowAddIssue] = useState(false);
  const [issuePreselectedRowId, setIssuePreselectedRowId] = useState<string | undefined>(undefined);
  const [selectedObs, setSelectedObs] = useState<ObsSummary | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<IssueSummary | null>(null);
  // When true, the modal opens with the resolve section pre-expanded (triggered by the quick-resolve button on the card)
  const [openWithResolve, setOpenWithResolve] = useState(false);
  // When true, the modal opens with the edit form pre-expanded
  const [openWithEdit, setOpenWithEdit] = useState(false);

  // ── Unit context — derived from card fields ────────────────────────────────
  const unitContext = unitContextOverride ?? {
    unitKey: card.unit || card.key,
    building: card.building,
    area: card.area,
    level: card.level,
    unit: card.unit,
    unitRef: `${card.building}|${card.level}|${card.unit}`,
  };

  // ── Live data from API ──────────────────────────────────────────────────────
  const [observations, setObservations] = useState<ObsSummary[] | null>(null);
  const [obsExpanded, setObsExpanded] = useState(false);
  const [issues, setIssues] = useState<IssueSummary[] | null>(null);
  const [issueExpanded, setIssueExpanded] = useState(false);
  const [resolvedExpanded, setResolvedExpanded] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(true);
  const [albumCount, setAlbumCount] = useState<number | null>(null);
  const [inspectionsOpen, setInspectionsOpen] = useState(false);
  const [inspectionsCount, setInspectionsCount] = useState<number | null>(null);
  // "+ Add" inspection flow state
  const [showStartInspection, setShowStartInspection] = useState(false);
  const [pendingFill, setPendingFill] = useState<{
    form: StoredForm;
    scope?: ScopeRow;
  } | null>(null);

  const patchScopeRowForStartInspection = useCallback(
    async (scope: ScopeRow, updates: Partial<ScopeRow>): Promise<boolean> => {
      if (!canManageStatus) return false;
      const rollbackUpdates = Object.fromEntries(
        (Object.keys(updates) as Array<keyof ScopeRow>).map((key) => [key, scope[key]]),
      ) as Partial<ScopeRow>;
      onSaved(scope.id, updates);
      const url = `/api/projects/${projectId}/units/${scope.id}`;
      const body = scopeUpdatesToApiBody(updates);
      const bodyWithLocation = await enrichBodyWithActivityLocation(body);
      try {
        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyWithLocation),
        });
        if (!res.ok) {
          onSaved(scope.id, rollbackUpdates);
          return false;
        }
        void fetch(`/api/projects/${projectId}/units?limit=${FIELD_TRACKER_UNITS_PAGE_LIMIT}`).catch(() => {});
        return true;
      } catch {
        try {
          const { enqueueMutation } = await import("@/lib/offline/mutation-queue");
          await enqueueMutation({ type: "unit-status", url, method: "PATCH", body: bodyWithLocation });
          return true;
        } catch {
          onSaved(scope.id, rollbackUpdates);
          return false;
        }
      }
    },
    [canManageStatus, projectId, onSaved],
  );

  const obsCount = observations?.length ?? null;
  const issueCount = issues?.length ?? null;

  // Can this user edit any issue (not just their own)?
  const canEditAnyIssue = currentUserRole === "ADMIN" || currentUserRole === "DEVELOPER" || currentUserRole === "DESIGNER" || currentUserRole === "INSTALL_MANAGER" || currentUserRole === "INSTALL_DIRECTOR";
  function canEditIssue(issue: IssueSummary): boolean {
    return canEditAnyIssue || (!!currentUserId && issue.createdBy.id === currentUserId);
  }

  const refreshCounts = useCallback(async () => {
    markUnitAlbumTouched(projectId, unitContext.unitRef);
    // Workbox NetworkFirst waits up to 10 s before falling back to cache. That
    // causes the loading spinner to hang for a long time when offline. Abort
    // after 6 s so the offline-snapshot fallback kicks in immediately.
    const ctrl = new AbortController();
    const abortTimer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const unitRef = encodeURIComponent(unitContext.unitRef);
      const [obsData, issData, albumData] = await Promise.all([
        fetch(`/api/projects/${projectId}/observations?unitRef=${unitRef}`, { signal: ctrl.signal }).then((r) => r.ok ? r.json() : { observations: [] }),
        fetch(`/api/projects/${projectId}/issues?unitRef=${unitRef}`, { signal: ctrl.signal }).then((r) => r.ok ? r.json() : { issues: [] }),
        fetch(`/api/projects/${projectId}/album?unitRef=${unitRef}`, { signal: ctrl.signal }).then((r) => r.ok ? r.json() : { items: [] }),
      ]);
      clearTimeout(abortTimer);
      const freshIssues = (issData.issues as IssueSummary[]) ?? [];
      setObservations((obsData.observations as ObsSummary[]) ?? []);
      setIssues(freshIssues);
      setAlbumCount((albumData.items as unknown[])?.length ?? 0);
      onIssueMetaUpdated?.(card.key, computeIssueMeta(freshIssues));
    } catch {
      ctrl.abort(); // cancel the in-flight sibling request if one fetch rejected early
      clearTimeout(abortTimer);
      // Offline snapshot fallback — always try the cache when a fetch fails
      const snapshot = await readSnapshotData(projectId);
      if (snapshot?.data) {
        type SnapAttachment = { id: string; storageUrl: string; mimeType: string };
        type SnapIssue = {
          id: string; projectId: string; shortDescription: string; issueType: string;
          status: string; isBlockingWork: boolean; unitRef?: string | null;
          reporterName?: string | null; createdAt: string;
          responsibleParty?: string; attachments?: SnapAttachment[];
        };
        const myUnitRef = unitContext.unitRef;

        const obsFromCache: ObsSummary[] = ((snapshot.data.observations ?? []) as SnapshotObservationRow[])
          .filter((o) => o.projectId === projectId && o.unitRef === myUnitRef)
          .map(normalizeSnapshotObservation);

        const issuesFromCache: IssueSummary[] = ((snapshot.data.issues ?? []) as SnapIssue[])
          .filter((i) => i.projectId === projectId && i.unitRef === myUnitRef)
          .map((i) => ({
            id: i.id,
            issueType: i.issueType,
            responsibleParty: i.responsibleParty ?? "",
            isBlockingWork: i.isBlockingWork,
            status: i.status,
            shortDescription: i.shortDescription,
            createdAt: i.createdAt,
            unitRef: i.unitRef,
            createdBy: { id: "", name: i.reporterName ?? null, email: "" },
            attachments: (i.attachments ?? []).map((a) => ({
              id: a.id,
              storageKey: "",
              storageUrl: a.storageUrl,
              mimeType: a.mimeType,
              fileSizeBytes: null,
            })),
            scopeTags: [],
            subScopeTags: [],
            _count: { comments: 0 },
            _pendingSync: (i as { _pendingSync?: boolean })._pendingSync === true,
          }));

        setObservations(obsFromCache);
        setIssues(issuesFromCache);
        onIssueMetaUpdated?.(card.key, computeIssueMeta(issuesFromCache));
        return;
      }
      // No snapshot available — set empty arrays so spinners resolve instead of hanging.
      setObservations([]);
      setIssues([]);
    }
  }, [projectId, unitContext.unitRef, card.key, onIssueMetaUpdated]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshCounts(); }, [refreshCounts]);

  // Re-fetch after a sync completes so counts and attachments reflect the
  // newly uploaded observations/issues without requiring a modal close/reopen.
  useEffect(() => {
    const onSyncComplete = () => { void refreshCounts(); };
    window.addEventListener(OFFLINE_SYNC_COMPLETE_EVENT, onSyncComplete);
    return () => window.removeEventListener(OFFLINE_SYNC_COMPLETE_EVENT, onSyncComplete);
  }, [refreshCounts]);

  useEffect(() => {
    function handleAlbumUpdated(event: Event) {
      const detail = (event as CustomEvent<{ projectId: string; unitRef: string }>).detail;
      if (detail?.projectId === projectId && detail?.unitRef === unitContext.unitRef) {
        void refreshCounts();
      }
    }
    window.addEventListener(UNIT_ALBUM_UPDATED_EVENT, handleAlbumUpdated);
    return () => window.removeEventListener(UNIT_ALBUM_UPDATED_EVENT, handleAlbumUpdated);
  }, [projectId, unitContext.unitRef, refreshCounts]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const scopeOptions = card.scopes.map((s) => ({
    id: s.id,
    name: s.scopeType?.name ?? s.description ?? "Scope",
    uom: s.uom,
    subScopes: s.subScopeInstances.map((inst) => ({
      id: inst.id,
      name: inst.subScope.name,
    })),
  }));

  const handleReportIssue = useCallback((rowId: string) => {
    setIssuePreselectedRowId(rowId);
    setShowAddIssue(true);
  }, []);

  const blockedScopes = card.scopes.filter((s) => s.scopeStatus === "BLOCKED");
  const lowerPanelStyle: CSSProperties = stacked
    ? {
        borderRadius: "var(--unit-detail-scope-card-radius)",
        backgroundColor: "var(--unit-detail-scope-card-bg)",
        boxShadow: "var(--unit-detail-scope-card-shadow)",
        overflow: "hidden",
      }
    : { borderBottom: "none" };
  const lowerHeaderStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: stacked ? "14px var(--card-padding)" : "10px var(--card-padding)",
    backgroundColor: "var(--unit-detail-scope-card-bg)",
  };
  const lowerHeaderButtonStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
    flex: 1,
    minWidth: 0,
    fontFamily: "inherit",
  };
  const lowerTitleStyle: CSSProperties = {
    fontSize: "var(--text-subheading)",
    fontWeight: "var(--font-weight-black)",
    color: "var(--unit-detail-scope-card-fg)",
    letterSpacing: "var(--tracking-tight)",
  };
  const lowerSectionIconStyle: CSSProperties = {
    color: "var(--unit-detail-header-bg)",
    flexShrink: 0,
  };
  const lowerCountStyle: CSSProperties = {
    fontSize: "var(--text-caption)",
    fontWeight: "var(--font-weight-medium)",
    color: "var(--unit-detail-scope-card-meta)",
    backgroundColor: "var(--control-bg)",
    padding: "2px 8px",
    borderRadius: "var(--radius-pill)",
    flexShrink: 0,
    minWidth: 0,
    textAlign: "center",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  };
  const lowerAddButtonStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--inline-gap)",
    height: "var(--button-height)",
    padding: "0 14px",
    borderRadius: "var(--radius-md)",
    border: "none",
    backgroundColor: "var(--unit-detail-header-bg)",
    color: "var(--unit-detail-header-fg)",
    fontSize: "var(--text-body)",
    fontWeight: "var(--font-weight-extrabold)",
    cursor: "pointer",
    flexShrink: 0,
    fontFamily: "inherit",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: stacked ? "column" : "row",
        gap: 0,
        borderTop: stacked ? "none" : "1px solid var(--neutral-200)",
        backgroundColor: "var(--neutral-0)",
      }}
    >
      {/* Scopes: horizontal table (desktop) or vertical blocks (stacked / mobile) */}
      {!fieldNotesOnly && (
      <div style={{ flex: "1 1 0%", minWidth: 0, overflowX: stacked ? "hidden" : "auto" }}>
        {stacked ? (
          <div
            style={{
              backgroundColor: "var(--unit-detail-bg)",
              padding: "16px var(--page-padding-x) 22px",
            }}
          >
            <p
              style={{
                margin: "0 0 10px",
                fontSize: "var(--text-caption)",
                fontWeight: "var(--font-weight-extrabold)",
                color: "var(--unit-detail-scope-card-meta)",
                textTransform: "uppercase",
                letterSpacing: "var(--tracking-section)",
              }}
            >
              {t("scopesSectionTitle", { count: card.scopes.length })}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {[...card.scopes].sort((a, b) =>
                (b.subScopeInstances.length > 0 ? 1 : 0) - (a.subScopeInstances.length > 0 ? 1 : 0)
              ).map((scope) => (
                <ScopeGridCard
                  key={scope.id}
                  scope={scope}
                  projectId={projectId}
                  unitRef={unitContext.unitRef}
                  location={{ building: unitContext.building, area: unitContext.area, level: unitContext.level, unit: unitContext.unit }}
                  onSaved={onSaved}
                  onInstanceSaved={onInstanceSaved ?? (() => {})}
                  canManageStatus={canManageStatus}
                  canCalibrate={canCalibrate}
                  onReportIssue={handleReportIssue}
                  hasIssue={card.issueMeta.scopeRowIdsWithIssues.includes(scope.id) ||
                    scope.subScopeInstances.some((inst) => card.issueMeta.subScopeInstanceIdsWithIssues.includes(inst.id))}
                  hasBlockingIssue={
                    (card.issueMeta.scopeRowIdsWithBlockingIssues ?? []).includes(scope.id) ||
                    scope.subScopeInstances.some((inst) =>
                      (card.issueMeta.subScopeInstanceIdsWithBlockingIssues ?? []).includes(inst.id)
                    )
                  }
                  subScopeInstanceIdsWithIssues={card.issueMeta.subScopeInstanceIdsWithIssues}
                  issueMeta={card.issueMeta}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--neutral-200)", backgroundColor: "var(--neutral-50)" }}>
                  {[t("colScope"), t("colStatus"), t("colClearInspection")].map((h, i) => (
                    <th
                      key={h}
                      colSpan={i === 1 ? 2 : 1}
                      style={{
                        padding: "var(--inline-gap) var(--card-padding)",
                        textAlign: "left",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--neutral-500)",
                        letterSpacing: "0.05em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {card.scopes.map((scope, idx) => (
                  <ScopeTableRow
                    key={scope.id}
                    scope={scope}
                    projectId={projectId}
                    unitRef={unitContext.unitRef}
                    location={{ building: unitContext.building, area: unitContext.area, level: unitContext.level, unit: unitContext.unit }}
                    onSaved={onSaved}
                    isLast={idx === card.scopes.length - 1}
                    canManageStatus={canManageStatus}
                    canCalibrate={canCalibrate}
                    hasIssue={card.issueMeta.scopeRowIdsWithIssues.includes(scope.id)}
                    hasBlockingIssue={(card.issueMeta.scopeRowIdsWithBlockingIssues ?? []).includes(scope.id)}
                    blockingInstallComplete={scopeRowBlockingInstallComplete(scope.id, card.issueMeta)}
                    currentUserId={currentUserId}
                    currentUserRole={currentUserRole}
                  />
                ))}
              </tbody>
            </table>
            <div style={{ padding: "var(--inline-gap) var(--page-padding-x)", borderTop: "1px solid var(--neutral-100)" }}>
              <button
                type="button"
                className={VIEW_ACTIVITY_BUTTON_CLASS}
              >
                <Activity size={16} className="shrink-0" aria-hidden />
                {t("viewActivity")}
              </button>
            </div>
          </>
        )}
      </div>
      )}

      {/* Right: Issues + Observations panels */}
      <div
        style={{
          width: stacked ? "100%" : 280,
          flexShrink: 0,
          borderLeft: stacked ? "none" : "1px solid var(--neutral-200)",
          borderTop: "none",
          display: "flex",
          flexDirection: "column",
          gap: stacked ? "var(--space-3)" : 0,
          ...(stacked
            ? { padding: fieldNotesOnly ? "16px var(--page-padding-x) 24px" : "0 var(--page-padding-x) 24px" }
            : {}),
        }}
      >
        {/* Observations */}
        <div style={lowerPanelStyle}>
          <div style={lowerHeaderStyle}>
            <button
              type="button"
              onClick={() => { if ((obsCount ?? 0) > 0) setObsExpanded((v) => !v); }}
              style={{ ...lowerHeaderButtonStyle, cursor: (obsCount ?? 0) > 0 ? "pointer" : "default" }}
            >
              <MessageSquare size={17} style={lowerSectionIconStyle} />
              <span style={lowerTitleStyle}>{t("observations")}</span>
              <span style={lowerCountStyle}>
                {obsCount === null
                  ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
                  : `${obsCount} logged`}
              </span>
              {(obsCount ?? 0) > 0 && (
                obsExpanded
                  ? <ChevronDown size={15} style={{ color: "var(--primary-400)", flexShrink: 0 }} />
                  : <ChevronRight size={15} style={{ color: "var(--neutral-400)", flexShrink: 0 }} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowAddObs(true)}
              style={lowerAddButtonStyle}
            >
              <Plus size={12} />
              {t("add")}
            </button>
          </div>
          {obsExpanded && observations !== null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px var(--card-padding)" }}>
              {observations.length === 0
                ? <p style={{ margin: 0, fontSize: 12, color: "var(--neutral-400)", fontStyle: "italic" }}>{t("noObservations")}</p>
                : observations.map((obs) => (
                    <ObsCard key={obs.id} obs={obs} typeCatalog={observationTypes} onClick={() => setSelectedObs(obs)} />
                  ))
              }
            </div>
          )}
        </div>

        {/* Issues */}
        {(() => {
          const openIssues = (issues?.filter((i) => i.status !== "RESOLVED") ?? null)
            ?.slice().sort((a, b) => {
              // Blocking issues always first, then most-recent within each group
              if (a.isBlockingWork !== b.isBlockingWork) return a.isBlockingWork ? -1 : 1;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }) ?? null;
          const resolvedIssues = issues?.filter((i) => i.status === "RESOLVED") ?? [];
          const openCount = openIssues?.length ?? null;
          const previewIssue = openIssues?.[0] ?? null;
          const additionalIssues = openIssues?.slice(1) ?? [];
          const hasAdditional = additionalIssues.length > 0;
          return (
            <div style={lowerPanelStyle}>
              {/* Header row */}
              <div style={lowerHeaderStyle}>
                <button
                  type="button"
                  onClick={() => { if (hasAdditional) setIssueExpanded((v) => !v); }}
                  style={{ ...lowerHeaderButtonStyle, cursor: hasAdditional ? "pointer" : "default" }}
                >
                  <CircleAlert size={17} style={lowerSectionIconStyle} />
                  <span style={lowerTitleStyle}>{t("issues")}</span>
                  <span style={{
                    ...lowerCountStyle,
                    color: openCount === null ? "var(--neutral-400)" : "var(--unit-detail-scope-card-meta)",
                  }}>
                    {openCount === null
                      ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
                      : `${openCount} logged`}
                  </span>
                  {hasAdditional && (
                    issueExpanded
                      ? <ChevronDown size={15} style={{ color: "var(--warning-400)", flexShrink: 0 }} />
                      : <ChevronRight size={15} style={{ color: "var(--neutral-400)", flexShrink: 0 }} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setIssuePreselectedRowId(undefined); setShowAddIssue(true); }}
                  style={lowerAddButtonStyle}
                >
                  <Plus size={12} />
                  {t("add")}
                </button>
              </div>

              {/* Always-visible preview: most recent open issue */}
              {previewIssue !== null && (
                <div style={{ padding: "10px var(--card-padding) 0" }}>
                  <IssueCard
                    issue={previewIssue}
                    onClick={() => { setOpenWithResolve(false); setOpenWithEdit(false); setSelectedIssue(previewIssue); }}
                    onResolveClick={() => { setOpenWithResolve(true); setOpenWithEdit(false); setSelectedIssue(previewIssue); }}
                    onEditClick={canEditIssue(previewIssue) ? () => { setOpenWithEdit(true); setOpenWithResolve(false); setSelectedIssue(previewIssue); } : undefined}
                  />
                </div>
              )}

              {/* Remaining issues — shown only when expanded */}
              {issueExpanded && additionalIssues.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px var(--card-padding) 0" }}>
                  {additionalIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      onClick={() => { setOpenWithResolve(false); setOpenWithEdit(false); setSelectedIssue(issue); }}
                      onResolveClick={() => { setOpenWithResolve(true); setOpenWithEdit(false); setSelectedIssue(issue); }}
                      onEditClick={canEditIssue(issue) ? () => { setOpenWithEdit(true); setOpenWithResolve(false); setSelectedIssue(issue); } : undefined}
                    />
                  ))}
                </div>
              )}

              {/* Resolved issues — collapsed by default */}
              {resolvedIssues.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setResolvedExpanded((v) => !v)}
                    style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: "var(--control-bg)", border: "none", cursor: "pointer", padding: "8px var(--card-padding)", textAlign: "left", fontFamily: "inherit" }}
                  >
                    <span style={{ fontSize: "var(--text-caption)", fontWeight: "var(--font-weight-extrabold)", color: "var(--success-700)" }}>✓ Resolved</span>
                    <span style={{ fontSize: "var(--text-caption)", fontWeight: "var(--font-weight-bold)", padding: "1px 7px", borderRadius: "var(--radius-pill)", backgroundColor: "var(--success-50)", color: "var(--success-700)", flexShrink: 0 }}>
                      {resolvedIssues.length}
                    </span>
                    {resolvedExpanded
                      ? <ChevronDown size={13} style={{ color: "var(--success-600)", flexShrink: 0 }} />
                      : <ChevronRight size={13} style={{ color: "var(--success-600)", flexShrink: 0 }} />
                    }
                  </button>
                  {resolvedExpanded && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px var(--card-padding) 10px" }}>
                      {resolvedIssues.map((issue) => (
                        <IssueCard key={issue.id} issue={issue} onClick={() => setSelectedIssue(issue)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Inspections */}
        {stacked && !fieldNotesOnly && (
          <div style={lowerPanelStyle}>
            <div style={lowerHeaderStyle}>
              <button
                type="button"
                onClick={() => setInspectionsOpen((v) => !v)}
                style={lowerHeaderButtonStyle}
                aria-expanded={inspectionsOpen}
              >
                <ClipboardCheck size={17} style={lowerSectionIconStyle} />
                <span style={lowerTitleStyle}>Inspections</span>
                <span style={lowerCountStyle}>
                  {inspectionsCount === null
                    ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
                    : <>{inspectionsCount} <span style={{ fontWeight: 500, opacity: 0.7 }}>{inspectionsCount === 1 ? "inspection" : "inspections"}</span></>}
                </span>
                {inspectionsOpen
                  ? <ChevronDown size={15} style={{ color: "var(--neutral-400)", flexShrink: 0 }} />
                  : <ChevronRight size={15} style={{ color: "var(--neutral-400)", flexShrink: 0 }} />}
              </button>
              {canManageStatus && (
                <button
                  type="button"
                  onClick={() => setShowStartInspection(true)}
                  style={lowerAddButtonStyle}
                >
                  <Plus size={12} />
                  {t("add")}
                </button>
              )}
            </div>
            {/* Always mounted so onCountChange fires for the header badge */}
            <div style={{ padding: "4px var(--card-padding) 14px", display: inspectionsOpen ? undefined : "none" }}>
              <UnitInspectionsSummary
                scopes={card.scopes}
                projectId={projectId}
                unitId={card.key}
                locationParts={{
                  building: unitContext.building,
                  level: unitContext.level,
                  unit: unitContext.unit,
                }}
                canManageStatus={canManageStatus}
                canCalibrate={canCalibrate}
                currentUserId={currentUserId}
                onCountChange={setInspectionsCount}
              />
            </div>
          </div>
        )}

        {/* Photo Album */}
        <div style={lowerPanelStyle}>
          <div style={lowerHeaderStyle}>
            <button
              type="button"
              onClick={() => setAlbumOpen((v) => !v)}
              style={lowerHeaderButtonStyle}
              aria-expanded={albumOpen}
            >
              <ImageIcon size={17} style={{ color: "var(--neutral-500)", flexShrink: 0 }} />
              <span style={lowerTitleStyle}>{t("album.tab")}</span>
              <span style={{ ...lowerCountStyle, minWidth: 22 }}>
                {albumCount === null
                  ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
                  : albumCount}
              </span>
              {albumOpen
                ? <ChevronDown size={15} style={{ color: "var(--neutral-400)", flexShrink: 0 }} />
                : <ChevronRight size={15} style={{ color: "var(--neutral-400)", flexShrink: 0 }} />}
            </button>
          </div>
          {albumOpen && (
            <div style={{ padding: "4px var(--card-padding) 14px" }}>
              <UnitPhotoAlbum
                projectId={projectId}
                unitRef={unitContext.unitRef}
                location={{ building: unitContext.building, area: unitContext.area, level: unitContext.level, unit: unitContext.unit }}
                onCountChange={setAlbumCount}
              />
            </div>
          )}
        </div>
      </div>

      {/* Start-inspection flow (unit-level "+ Add") */}
      {showStartInspection && (
        <StartInspectionSheet
          projectId={projectId}
          unitId={card.key}
          scopes={card.scopes}
          unitHasFlooring={unitHasFlooringScope(card.scopes)}
          onStartFill={(form, scope) => setPendingFill({ form, scope })}
          onClose={() => setShowStartInspection(false)}
          patchScopeRow={canManageStatus ? patchScopeRowForStartInspection : undefined}
        />
      )}
      {pendingFill && (
        <InspectionFillOverlay
          mode="live"
          form={pendingFill.form}
          scope={pendingFill.scope}
          projectId={projectId}
          unitId={card.key}
          locationParts={{
            building: unitContext.building,
            level: unitContext.level,
            unit: unitContext.unit,
          }}
          onClose={() => setPendingFill(null)}
          onSubmitted={(newSub) => {
            if (
              pendingFill.scope &&
              submissionAuthoritativeForScopeInspectionStatus(newSub)
            ) {
              onSaved(pendingFill.scope.id, {
                ...localScopeUpdatesFromSubmission(newSub)!,
              });
            }
          }}
        />
      )}

      {/* Modals */}
      {selectedObs && (
        <ObservationDetailModal
          obs={selectedObs}
          unitContext={unitContext}
          projectId={projectId}
          currentUserId={currentUserId}
          scopes={scopeOptions}
          onClose={() => setSelectedObs(null)}
          onUpdated={(updated) => {
            setObservations((prev) => prev ? prev.map((o) => o.id === updated.id ? updated : o) : prev);
          }}
        />
      )}
      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          unitContext={unitContext}
          projectId={projectId}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          scopes={scopeOptions}
          onClose={() => { setSelectedIssue(null); setOpenWithResolve(false); setOpenWithEdit(false); }}
          initialResolveOpen={openWithResolve}
          initialEditOpen={openWithEdit}
          onGroupResolved={onRefreshAll}
          onUpdated={(updated) => {
            setIssues((prev) => {
              const next = prev ? prev.map((i) => i.id === updated.id ? updated : i) : prev;
              if (next) {
                const meta = computeIssueMeta(next);
                queueMicrotask(() => onIssueMetaUpdated?.(card.key, meta));
              }
              return next;
            });
            // Auto-expand the resolved section so the user sees the issue land there
            if (updated.status === "RESOLVED") setResolvedExpanded(true);
          }}
          onDeleted={(deletedId) => {
            setIssues((prev) => {
              const next = prev ? prev.filter((i) => i.id !== deletedId) : prev;
              if (next) {
                const meta = computeIssueMeta(next);
                queueMicrotask(() => onIssueMetaUpdated?.(card.key, meta));
              }
              return next;
            });
            setSelectedIssue(null);
          }}
        />
      )}
      {showAddObs && (
        <AddObservationModal
          projectId={projectId}
          unitContext={unitContext}
          scopes={scopeOptions}
          currentUserId={currentUserId}
          elevatedStacking={fieldNotesOnly}
          onClose={() => setShowAddObs(false)}
          onCreated={() => { void refreshCounts(); setObsExpanded(false); }}
        />
      )}
      {showAddIssue && (
        <AddIssueModal
          projectId={projectId}
          unitContext={unitContext}
          scopes={scopeOptions}
          defaultRowId={issuePreselectedRowId}
          elevatedStacking={fieldNotesOnly}
          onClose={() => setShowAddIssue(false)}
          onCreated={() => { void refreshCounts(); }}
        />
      )}
    </div>
  );
}


function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false
  );
}

// ── Mobile unit detail (bottom sheet on mobile, side panel on desktop) ─────────

export function MobileUnitDetailModal({
  card,
  projectId,
  onSaved,
  onInstanceSaved,
  onClose,
  onIssueMetaUpdated,
  canManageStatus = false,
  canCalibrate = false,
  canViewLocationTracking = false,
  currentUserId,
  currentUserRole,
  onPrev,
  onNext,
  unitIndex,
  unitTotal,
  desktopPanel = false,
  onRefreshAll,
}: {
  card: UnitCard;
  projectId: string;
  onSaved: (scopeId: string, updates: Partial<ScopeRow>) => void;
  onInstanceSaved: (rowId: string, instanceId: string, updates: Partial<SubScopeInstance>) => void;
  onClose: () => void;
  onIssueMetaUpdated?: (cardKey: string, meta: UnitIssueMeta) => void;
  canManageStatus?: boolean;
  canCalibrate?: boolean;
  canViewLocationTracking?: boolean;
  currentUserId?: string;
  currentUserRole?: string;
  onPrev?: () => void;
  onNext?: () => void;
  unitIndex?: number;
  unitTotal?: number;
  /** When true, use a right-side panel on md+ viewports; mobile always uses a bottom sheet. */
  desktopPanel?: boolean;
  onRefreshAll?: () => void;
}) {
  const t = useTranslations("units");
  const isBrowser = useIsBrowser();
  const isDesktopViewport = useDesktopDetailPanel();
  const showDesktopPanel = desktopPanel && isDesktopViewport;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);

  // Reset scroll to top whenever the unit changes.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [card.key]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (showDesktopPanel) return;
    const id = setTimeout(() => setSheetVisible(true), 20);
    return () => clearTimeout(id);
  }, [showDesktopPanel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  if (!isBrowser) return null;

  const unitPct = unitInstallCompletePercent(card.scopes);

  const locSegments: { key: string; icon: "building" | "map" | "layers"; label: string }[] = [];
  // Always show building in the unit detail modal when present (collapsed rows may omit it on single-building projects).
  if ((card.building ?? "").trim()) {
    locSegments.push({ key: "building", icon: "building", label: (card.building ?? "").trim() });
  }
  if ((card.level ?? "").trim()) {
    locSegments.push({ key: "level", icon: "layers", label: (card.level ?? "").trim() });
  }

  const modalBody = (
    <>
      <div
        className={showDesktopPanel ? undefined : "udm-sheet-header"}
        style={{
          flexShrink: 0,
          padding: showDesktopPanel ? "18px 18px 18px" : "10px 18px 18px",
          backgroundColor: "var(--unit-detail-header-bg)",
          color: "var(--unit-detail-header-fg)",
          borderBottom: "none",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {!showDesktopPanel ? <div className="udm-handle" aria-hidden /> : null}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 10px" }}>
              <p
                id="unit-detail-modal-title"
                style={{
                  margin: 0,
                  fontSize: "var(--text-heading)",
                  fontWeight: "var(--font-weight-black)",
                  color: "var(--unit-detail-header-fg)",
                  lineHeight: 1.05,
                  letterSpacing: "var(--tracking-tight)",
                }}
              >
                {t("unitDetailModalTitle", { unit: card.unit || "—" })}
              </p>
              {card.unitType && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: "var(--font-weight-extrabold)",
                    padding: "4px 10px",
                    borderRadius: "var(--radius-pill)",
                    backgroundColor: "var(--unit-detail-header-chip-bg)",
                    color: "var(--unit-detail-header-chip-fg)",
                    letterSpacing: "var(--tracking-ui)",
                  }}
                >
                  {card.unitType}
                </span>
              )}
              {locSegments.length > 0 && (
                <span
                  className="udm-location-meta"
                  aria-label={locSegments.map((seg) => seg.label).join(", ")}
                >
                  {locSegments.map((seg) => (
                    <span key={seg.key} className="udm-location-chip">
                      {seg.icon === "building" ? <Building2 size={13} aria-hidden /> : null}
                      {seg.icon === "map" ? <MapPin size={13} aria-hidden /> : null}
                      {seg.icon === "layers" ? <Layers size={13} aria-hidden /> : null}
                      <span>{seg.label}</span>
                    </span>
                  ))}
                </span>
              )}
              <LocationBuilderMeta card={card} onDark />
            </div>
          </div>
          {showDesktopPanel ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("unitDetailModalClose")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--unit-detail-header-meta)",
                padding: 6,
                display: "flex",
                flexShrink: 0,
              }}
            >
              <X size={22} />
            </button>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 8,
            marginBottom: 4,
          }}
        >
          <span
            data-testid="unit-detail-modal-progress-pct"
            style={{
              fontSize: "var(--text-body)",
              fontWeight: "var(--font-weight-extrabold)",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.2,
              color: "var(--unit-detail-header-fg)",
            }}
          >
            {unitPct}
            <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 1 }}>%</span>
          </span>
        </div>
        <div
          data-testid="unit-detail-modal-progress"
          style={{
            height: 5,
            width: "100%",
            backgroundColor: "var(--unit-detail-progress-track)",
            overflow: "hidden",
            borderRadius: 9999,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${unitPct}%`,
              borderRadius: 9999,
              backgroundColor: "var(--unit-detail-progress-fill)",
              transition: "width 0.25s ease",
            }}
          />
        </div>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
        <UnitExpandedContent
          card={card}
          projectId={projectId}
          onSaved={onSaved}
          onInstanceSaved={onInstanceSaved}
          onIssueMetaUpdated={onIssueMetaUpdated}
          layout="stacked"
          canManageStatus={canManageStatus}
          canCalibrate={canCalibrate}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onRefreshAll={onRefreshAll}
        />
      </div>
      <div className="udm-bottom-shell">
        <button
          type="button"
          className="udm-activity-button"
          onClick={() => setActivityOpen(true)}
        >
          <Activity size={16} className="shrink-0" aria-hidden />
          {t("viewActivity")}
        </button>
      </div>

      {activityOpen && isBrowser && (
        <UnitActivityModal
          projectId={projectId}
          unit={card.unit}
          building={card.building}
          level={card.level}
          onClose={() => setActivityOpen(false)}
          canViewLocationTracking={canViewLocationTracking}
        />
      )}

      {unitTotal !== undefined && unitTotal > 1 && (
        <div className="udm-unit-nav">
          <button
            onClick={onPrev}
            disabled={!onPrev}
            aria-label="Previous unit"
            className={`udm-nav-button${!onPrev ? " udm-nav-button--disabled" : ""}`}
          >
            <ChevronLeft size={16} />
            Prev
          </button>
          <span className="udm-nav-count">
            {unitIndex} <span>of</span> {unitTotal}
          </span>
          <button
            onClick={onNext}
            disabled={!onNext}
            aria-label="Next unit"
            className={`udm-nav-button${!onNext ? " udm-nav-button--disabled" : ""}`}
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </>
  );

  return createPortal(
    <div data-testid="unit-detail-modal">
      <style>{`
        @keyframes udm-slide-in-right {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        .udm-location-meta {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .udm-location-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-height: 24px;
          padding: 4px 8px;
          border-radius: var(--radius-pill);
          background: var(--unit-detail-header-chip-bg);
          color: var(--unit-detail-header-chip-fg);
          font-size: var(--text-caption);
          font-weight: var(--font-weight-extrabold);
          letter-spacing: var(--tracking-ui);
          line-height: 1;
        }
        .udm-location-chip svg {
          color: currentColor;
          opacity: 0.82;
        }
        .udm-bottom-shell {
          flex-shrink: 0;
          padding: 10px 16px 0;
          background: var(--unit-detail-header-bg);
          border-top: none;
        }
        .udm-activity-button {
          width: 100%;
          min-height: var(--min-touch);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--inline-gap);
          padding: 0 16px;
          border: none;
          border-radius: var(--radius-md);
          background: var(--unit-detail-header-chip-bg);
          color: var(--unit-detail-header-chip-fg);
          cursor: pointer;
          font-family: inherit;
          font-size: var(--text-body);
          font-weight: var(--font-weight-extrabold);
          letter-spacing: var(--tracking-ui);
        }
        .udm-unit-nav {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 10px 20px 20px;
          background: var(--unit-detail-header-bg);
        }
        .udm-nav-button {
          min-height: 44px;
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 10px 18px;
          border: none;
          border-radius: var(--radius-pill);
          background: var(--unit-detail-header-chip-bg);
          color: var(--unit-detail-header-chip-fg);
          cursor: pointer;
          font-family: inherit;
          font-size: var(--text-body);
          font-weight: var(--font-weight-extrabold);
          transition: background-color 0.12s;
        }
        .udm-nav-button--disabled {
          cursor: default;
          opacity: 0.45;
        }
        .udm-nav-count {
          flex-shrink: 0;
          color: var(--unit-detail-header-meta);
          font-size: var(--text-caption);
          font-weight: var(--font-weight-semibold);
          font-variant-numeric: tabular-nums;
        }
      `}</style>
      {showDesktopPanel ? (
        <>
          <div
            aria-hidden="true"
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 180,
              backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.35))",
              animation: "none",
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unit-detail-modal-title"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(520px, 100vw)",
              zIndex: 181,
              backgroundColor: "var(--unit-detail-bg)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "var(--shadow-2)",
              animation: "udm-slide-in-right 0.22s cubic-bezier(0.22,1,0.36,1) both",
            }}
          >
            {modalBody}
          </div>
        </>
      ) : (
        <div
          className={`udm-backdrop${sheetVisible ? " udm-visible" : ""}`}
          onClick={onClose}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unit-detail-modal-title"
            className={`udm-sheet${sheetVisible ? " udm-visible" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            {modalBody}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

// ── Unit-level progress (full-width strip at bottom of list / grid cards) ─────

/** Install-complete share for the unit (equal weight per scope); pill bar under list/grid rows. */
function UnitBottomProgressBar({
  pct,
  dark,
  testId,
}: {
  pct: number;
  /** Expanded desktop list row (dark header). */
  dark?: boolean;
  testId?: string;
}) {
  const track = dark ? "rgba(255,255,255,0.15)" : "var(--neutral-200)";
  const fill =
    pct >= 100 ? "var(--success-600)" : dark ? "var(--neutral-0)" : "var(--primary-500)";
  return (
    <div
      data-testid={testId}
      style={{
        height: 10,
        width: "100%",
        flexShrink: 0,
        backgroundColor: track,
        overflow: "hidden",
        borderRadius: 9999,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          backgroundColor: fill,
          transition: "width 0.25s ease",
          borderRadius: 9999,
        }}
      />
    </div>
  );
}

/** Mobile list card: caption row + pill bar (install stage + complete status only). */
function MobileUnitInstallProgressSection({ scopes }: { scopes: ScopeRow[] }) {
  const t = useTranslations("units");
  const total = scopes.length;
  const complete = countInstallCompleteScopes(scopes);
  const pct = unitInstallCompletePercent(scopes);
  const fill = pct >= 100 ? "var(--success-600)" : MOBILE_UNIT_PROGRESS_FILL;

  return (
    <div data-testid="unit-row-mobile-progress">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
          fontSize: 13,
          fontWeight: 500,
          color: "var(--neutral-500)",
        }}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {t("mobileUnitInstallProgressCaption", { complete, total })}
        </span>
        <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
      </div>
      <div
        style={{
          height: 8,
          width: "100%",
          borderRadius: 9999,
          backgroundColor: MOBILE_UNIT_PROGRESS_TRACK,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 9999,
            backgroundColor: fill,
            transition: "width 0.25s ease",
          }}
        />
      </div>
    </div>
  );
}

// ── Scope pills ───────────────────────────────────────────────────────────────

/** Deduped display labels for scope rows (type name, else description). */
function uniqueScopeDisplayLabels(scopes: ScopeRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scopes) {
    const raw = (s.scopeType?.name ?? s.description ?? "").trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

function ScopePills({ scopes, onDark }: { scopes: ScopeRow[]; onDark?: boolean }) {
  const names = uniqueScopeDisplayLabels(scopes);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {names.map((name) => (
        <span
          key={name}
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: "2px 8px",
            borderRadius: 99,
            backgroundColor: onDark ? "rgba(255,255,255,0.14)" : "var(--neutral-100)",
            color: onDark ? "rgba(255,255,255,0.92)" : "var(--neutral-600)",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
      ))}
    </div>
  );
}

// ── Location type section divider (Units / Common Areas) ─────────────────────

function LocationTypeSectionDivider({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <div
      role="separator"
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "8px 0",
        ...style,
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--neutral-200)" }} />
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--neutral-400)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          userSelect: "none",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--neutral-200)" }} />
    </div>
  );
}

// ── Group by location: collapsible level band (primary-700 sea blue) ───────────

function levelSectionContentDomId(sectionKey: string): string {
  return `unit-cards-level-${sectionKey.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

/** Section keys for every real level row under a building (excludes synthetic __all). */
function levelSectionKeysForBuilding(g: { buildingKey: string; levelSections: { levelKey: string }[] }): string[] {
  return g.levelSections
    .filter((s) => s.levelKey !== "__all")
    .map((s) => `${g.buildingKey}::${s.levelKey}`);
}

function BuildingGroupHeaderRow({
  buildingKey,
  buildingUnitCount,
  buildingStripe,
  density,
  allLevelsExpanded,
  onToggleAllLevels,
  onAddLocationEntry,
  locationMetaSuffix,
}: {
  buildingKey: string;
  buildingUnitCount: number;
  buildingStripe: string;
  density: "grid" | "list";
  allLevelsExpanded: boolean;
  onToggleAllLevels: () => void;
  onAddLocationEntry: (mode: "issue" | "obs") => void;
  /** Shared build phase / area when uniform across all units in the building. */
  locationMetaSuffix?: string;
}) {
  const t = useTranslations("units");
  const expandAllAria = allLevelsExpanded
    ? t("buildingCollapseAllLevels", { building: buildingKey })
    : t("buildingExpandAllLevels", { building: buildingKey });
  const iconSize = density === "grid" ? 13 : 14;
  const marginTop = density === "grid" ? 10 : 0;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );
  const popoverRef = useRef<HTMLDivElement>(null);
  const labelTextColor = buildingLabelTextColor(buildingStripe);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!popoverOpen || isMobile) return;
    function onOutsideClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [popoverOpen, isMobile]);

  const actionBtnStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    flexShrink: 0,
    padding: 0,
    border: "none",
    borderRadius: "var(--radius-md)",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text-secondary)",
    boxShadow: "var(--shadow-card)",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        gap: 8,
        marginTop,
        marginBottom: 6,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: density === "grid" ? 8 : "var(--inline-gap)",
          padding: "7px 12px",
          borderRadius: "var(--radius-pill)",
          backgroundColor: buildingStripe,
          border: "none",
          minWidth: 0,
          boxShadow: "var(--shadow-card)",
        }}
      >
        <Building2 size={iconSize} style={{ color: labelTextColor, opacity: 0.92 }} aria-hidden />
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: labelTextColor,
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-ui)",
          }}
        >
          {buildingKey}
        </span>
        {locationMetaSuffix ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: labelTextColor,
              opacity: 0.88,
              whiteSpace: "nowrap",
              maxWidth: "12rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={locationMetaSuffix}
          >
            · {locationMetaSuffix}
          </span>
        ) : null}
        <span style={{ fontSize: 11, color: labelTextColor, opacity: 0.76, whiteSpace: "nowrap", fontWeight: 700 }}>
          {t("buildingChipUnitCount", { count: buildingUnitCount })}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* Log item button — building-level issue/observation */}
        <div ref={popoverRef} style={{ position: "relative" }}>
          <button
            type="button"
            aria-label={`Log item for ${buildingKey}`}
            aria-expanded={popoverOpen}
            onClick={() => setPopoverOpen((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "none",
              border: "none",
              padding: "2px 0",
              color: "var(--neutral-400)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              opacity: 0.9,
            }}
          >
            <Plus size={12} strokeWidth={2.5} aria-hidden />
            Log item
          </button>

          {/* Desktop: inline dropdown */}
          {popoverOpen && !isMobile && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                zIndex: 200,
                backgroundColor: "var(--neutral-0)",
                border: "1px solid var(--neutral-200)",
                borderRadius: 10,
                boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                padding: "6px",
                minWidth: 200,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <button
                type="button"
                onClick={() => { setPopoverOpen(false); onAddLocationEntry("issue"); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", backgroundColor: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--error-50)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                <AlertCircle size={15} style={{ color: "var(--error-600)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-800)" }}>Building Issue</span>
              </button>
              <button
                type="button"
                onClick={() => { setPopoverOpen(false); onAddLocationEntry("obs"); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", backgroundColor: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--primary-50)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                <Eye size={15} style={{ color: "var(--primary-600)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-800)" }}>Building Observation</span>
              </button>
            </div>
          )}

          {/* Mobile: bottom sheet portal */}
          {popoverOpen && isMobile && createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Add item for ${buildingKey}`}
              style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", flexDirection: "column", backgroundColor: "rgba(0,0,0,0.45)" }}
              onClick={(e) => { if (e.target === e.currentTarget) setPopoverOpen(false); }}
            >
              <div style={{ flex: 1 }} onClick={() => setPopoverOpen(false)} />
              <div style={{
                backgroundColor: "var(--neutral-0)",
                borderRadius: "20px 20px 0 0",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
                boxShadow: "0 -4px 40px rgba(0,0,0,0.18)",
              }}>
                {/* Handle */}
                <div style={{ width: 36, height: 4, backgroundColor: "var(--neutral-300)", borderRadius: 99, margin: "10px auto 4px" }} aria-hidden />
                {/* Sheet title */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px 12px" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {buildingKey}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 600, color: "var(--neutral-900)" }}>Log item</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setPopoverOpen(false)}
                    style={{ width: 32, height: 32, borderRadius: 99, border: "none", backgroundColor: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                  >
                    <X size={16} style={{ color: "var(--neutral-600)" }} />
                  </button>
                </div>
                {/* Options */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 16px 4px" }}>
                  <button
                    type="button"
                    onClick={() => { setPopoverOpen(false); onAddLocationEntry("issue"); }}
                    style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "16px 16px", borderRadius: 14, border: "2px solid var(--error-200)", backgroundColor: "var(--error-50)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                  >
                    <span style={{ width: 40, height: 40, borderRadius: 99, backgroundColor: "var(--error-600)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <AlertCircle size={20} style={{ color: "#fff" }} />
                    </span>
                    <span>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: "var(--error-700)" }}>Building Issue</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--error-600)", marginTop: 2 }}>Report an issue for the whole building</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPopoverOpen(false); onAddLocationEntry("obs"); }}
                    style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "16px 16px", borderRadius: 14, border: "2px solid var(--primary-200)", backgroundColor: "var(--primary-50)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                  >
                    <span style={{ width: 40, height: 40, borderRadius: 99, backgroundColor: "var(--primary-600)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Eye size={20} style={{ color: "#fff" }} />
                    </span>
                    <span>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: "var(--primary-700)" }}>Building Observation</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--primary-600)", marginTop: 2 }}>Log an observation for the whole building</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>

        {/* Expand/collapse all levels */}
        <button
          type="button"
          aria-expanded={allLevelsExpanded}
          aria-label={expandAllAria}
          onClick={onToggleAllLevels}
          style={actionBtnStyle}
        >
          {allLevelsExpanded ? (
            <ChevronsUp size={18} strokeWidth={2.25} aria-hidden />
          ) : (
            <ChevronsDown size={18} strokeWidth={2.25} aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

/** Per-scope % complete breakdown for a set of unit cards in one level. */
function computeLevelScopeStats(
  cards: UnitCard[]
): Array<{ name: string; pct: number; subPct: number }> {
  const acc = new Map<string, { totalQty: number; installedQty: number; subQty: number }>();
  for (const card of cards) {
    for (const scope of card.scopes) {
      const name =
        scope.scopeType?.canonicalScopeType?.displayName ??
        scope.scopeType?.name ??
        scope.scopeType?.code ??
        "Unknown";
      if (!acc.has(name)) acc.set(name, { totalQty: 0, installedQty: 0, subQty: 0 });
      const entry = acc.get(name)!;
      if (scope.subScopeInstances.length > 0) {
        for (const inst of scope.subScopeInstances) {
          const q = inst.qty ?? 1;
          entry.totalQty += q;
          if (inst.scopeStage === "INSTALL" && inst.scopeStatus === "COMPLETE")
            entry.installedQty += q;
          if (inst.scopeStage === "INSTALL" && inst.scopeStatus === "PENDING_VERIFICATION")
            entry.subQty += q;
        }
      } else {
        const q = scope.qty ?? 1;
        entry.totalQty += q;
        if (scope.scopeStage === "INSTALL" && scope.scopeStatus === "COMPLETE")
          entry.installedQty += q;
        if (scope.scopeStage === "INSTALL" && scope.scopeStatus === "PENDING_VERIFICATION")
          entry.subQty += q;
      }
    }
  }
  return Array.from(acc.entries())
    .map(([name, { totalQty, installedQty, subQty }]) => ({
      name,
      pct: totalQty === 0 ? 0 : Math.round((installedQty / totalQty) * 100),
      subPct: totalQty === 0 ? 0 : Math.round((subQty / totalQty) * 100),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function LevelSectionBar({
  levelKey,
  unitCount,
  levelPct,
  levelSubPct = 0,
  isFirstInBuilding,
  contentId,
  unitsExpanded,
  buildingStripe,
  allUnitsInLevelExpanded,
  showExpandAllUnits,
  hideLevelToggle,
  buildingKey,
  stickyTop = 0,
  isSelectMode = false,
  allInLevelSelected = false,
  someInLevelSelected = false,
  onLevelSelectAll,
  onToggleLevel,
  onToggleExpandAllUnits,
}: {
  levelKey: string;
  unitCount: number;
  /** 0–100 verified install-complete percentage across all units in this level. */
  levelPct: number;
  /** 0–100 unverified (PENDING_VERIFICATION) percentage — shown as a lighter segment. */
  levelSubPct?: number;
  isFirstInBuilding: boolean;
  contentId: string;
  unitsExpanded: boolean;
  /** Matches building color — thin left accent on the level row. */
  buildingStripe: string;
  /** True when every unit in this level has its scope row expanded. */
  allUnitsInLevelExpanded: boolean;
  /** Level “expand/collapse all unit rows” control — hidden on mobile (desktop only). */
  showExpandAllUnits: boolean;
  /** Grid mode: level is always expanded; hide chevron. */
  hideLevelToggle?: boolean;
  /** Building name shown as a compact chip inside the sticky bar for context while scrolling. */
  buildingKey?: string;
  /** px offset from scroll container top. */
  stickyTop?: number;
  /** True when select mode is active — shows per-level select-all control. */
  isSelectMode?: boolean;
  /** True when every unit in this level is selected. */
  allInLevelSelected?: boolean;
  /** True when at least one (but not all) units in this level are selected. */
  someInLevelSelected?: boolean;
  /** Select or deselect all units in this level. */
  onLevelSelectAll?: () => void;
  /** Show or hide the unit list for this level (chevron). */
  onToggleLevel: () => void;
  /** Expand all units in this level, or collapse all if already expanded (toggle). */
  onToggleExpandAllUnits: () => void;
}) {
  const t = useTranslations("units");
  const levelExpandedVisual = unitsExpanded;
  const levelBg = levelExpandedVisual ? "var(--level-card-expanded-bg)" : "var(--level-card-collapsed-bg)";
  const levelFg = levelExpandedVisual ? "var(--level-card-expanded-fg)" : "var(--level-card-collapsed-fg)";
  const levelMeta = levelExpandedVisual ? "var(--level-card-expanded-meta)" : "var(--level-card-collapsed-meta)";
  const levelTrack = levelExpandedVisual ? "var(--level-card-expanded-track)" : "var(--level-card-collapsed-track)";
  const levelChipBg = levelExpandedVisual ? "var(--level-card-expanded-chip-bg)" : buildingStripe;
  const levelChipFg = levelExpandedVisual ? "var(--level-card-expanded-chip-fg)" : buildingLabelTextColor(buildingStripe);
  const levelCountChipBg = levelExpandedVisual ? "var(--level-card-expanded-chip-bg)" : "var(--color-surface-sunken)";
  const levelCountChipFg = levelExpandedVisual ? "var(--level-card-expanded-chip-fg)" : "var(--color-text-secondary)";
  const collapsed = !levelExpandedVisual;
  const levelDisplay =
    levelKey === MISSING_LOCATION_LABEL ? t("levelNotSet") : levelKey;
  const title =
    levelKey === MISSING_LOCATION_LABEL
      ? t("levelNotSet")
      : t("levelGroupHeading", { level: levelKey });
  const levelToggleAria = unitsExpanded ? t("levelGroupToggleCollapse", { title }) : t("levelGroupToggleExpand", { title });
  const expandAllToggleAria = allUnitsInLevelExpanded
    ? t("levelSectionCollapseAllUnits", { title })
    : t("levelSectionExpandAllUnits", { title });

  /** Desktop: expand/collapse all unit rows in this level — keeps bordered control. */
  const expandAllUnitsBtnStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    flexShrink: 0,
    padding: 0,
    border: "none",
    borderRadius: 8,
    backgroundColor: levelExpandedVisual ? "var(--level-card-expanded-chip-bg)" : "var(--color-surface-sunken)",
    color: levelExpandedVisual ? "var(--level-card-expanded-chip-fg)" : "var(--color-text-secondary)",
    cursor: "pointer",
  };

  /** Level open/close: icon only, no box (less noise when many levels are open). */
  const levelChevronBtnStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    padding: "6px",
    margin: 0,
    border: "none",
    backgroundColor: "transparent",
    color: levelExpandedVisual ? "var(--level-card-expanded-chip-fg)" : "var(--color-text-secondary)",
    cursor: "pointer",
    borderRadius: 4,
  };

  return (
    <>
    {/* div instead of button because this row contains nested interactive buttons
        (Select all, Expand all). Nested <button> inside <button> is invalid HTML. */}
    <div
      id={`${contentId}-toggle`}
      role={hideLevelToggle ? undefined : "button"}
      tabIndex={hideLevelToggle ? undefined : 0}
      aria-expanded={hideLevelToggle ? undefined : unitsExpanded}
      aria-controls={hideLevelToggle ? undefined : contentId}
      aria-label={hideLevelToggle ? undefined : levelToggleAria}
      onClick={hideLevelToggle ? undefined : () => onToggleLevel()}
      onKeyDown={hideLevelToggle ? undefined : (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleLevel();
        }
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 0,
        width: "100%",
        minHeight: 44,
        marginTop: isFirstInBuilding ? 2 : 8,
        marginBottom: 8,
        padding: 0,
        backgroundColor: levelBg,
        color: levelFg,
        border: "none",
        borderRadius: "var(--radius-lg)",
        userSelect: "none",
        position: "sticky",
        top: stickyTop,
        zIndex: 10,
        boxShadow: "var(--shadow-card)",
        transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
        cursor: hideLevelToggle ? "default" : "pointer",
        textAlign: "left",
        boxSizing: "border-box",
        overflow: "hidden",
        borderLeft: `4px solid ${buildingStripe}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          minHeight: 44,
          padding: "8px 8px 8px 6px",
          boxSizing: "border-box",
        }}
      >
      {/* Level number / label */}
      <span
        id={`${contentId}-label`}
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: collapsed ? 28 : 28,
          width: collapsed ? 28 : undefined,
          height: 28,
          marginLeft: collapsed ? 6 : 6,
          padding: collapsed ? 0 : "0 6px",
          borderRadius: collapsed ? "50%" : "var(--radius-pill)",
          backgroundColor: levelExpandedVisual
            ? "rgba(255,255,255,0.10)"
            : collapsed
              ? `color-mix(in srgb, ${buildingStripe} 14%, var(--color-surface))`
              : "transparent",
          whiteSpace: "nowrap",
          fontSize: collapsed ? 14 : 13,
          fontWeight: collapsed ? 700 : 800,
          lineHeight: 1,
          color: levelFg,
          letterSpacing: collapsed ? "var(--tracking-tight)" : "var(--tracking-ui)",
        }}
      >
        {collapsed ? levelDisplay : title}
      </span>

      {isSelectMode && onLevelSelectAll && unitCount > 0 ? (
        <button
          type="button"
          aria-label={allInLevelSelected ? `Deselect all units in ${levelKey}` : `Select all units in ${levelKey}`}
          onClick={(e) => { e.stopPropagation(); onLevelSelectAll(); }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            flex: 1,
            minWidth: 0,
            minHeight: 34,
            marginLeft: 4,
            marginRight: 4,
            padding: "0 12px",
            border: "none",
            borderRadius: "var(--radius-md)",
            backgroundColor: allInLevelSelected
              ? "var(--unit-detail-header-chip-bg)"
              : someInLevelSelected
                ? "var(--unit-detail-header-chip-bg)"
                : levelExpandedVisual ? "rgba(255,255,255,0.10)" : "var(--control-bg)",
            color: allInLevelSelected
              ? "var(--unit-detail-header-chip-fg)"
              : someInLevelSelected ? "var(--unit-detail-header-chip-fg)" : levelMeta,
            cursor: "pointer",
            fontSize: "var(--text-body)",
            fontWeight: "var(--font-weight-extrabold)",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          {allInLevelSelected ? (
            <CheckSquare2 size={15} strokeWidth={2.5} aria-hidden />
          ) : someInLevelSelected ? (
            <Minus size={15} strokeWidth={2.5} aria-hidden />
          ) : (
            <Square size={15} strokeWidth={2.5} aria-hidden />
          )}
          {allInLevelSelected ? "Deselect all" : "Select all"}
        </button>
      ) : (
      <div
        aria-label={`${levelPct}% complete`}
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          flex: 1,
          minWidth: 0,
          marginLeft: 4,
          marginRight: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
        <div
          style={{
            flex: 1,
            height: 5,
            borderRadius: 99,
            overflow: "hidden",
            backgroundColor: levelTrack,
            display: "flex",
          }}
        >
          {/* Verified segment — dark green */}
          {levelPct > 0 && (
            <div
              style={{
                height: "100%",
                width: `${levelPct}%`,
                backgroundColor: "#16a34a",
                transition: "width 0.4s ease",
                borderRadius: levelSubPct > 0 ? 0 : 99,
              }}
            />
          )}
          {/* Unverified segment — light green */}
          {levelSubPct > 0 && (
            <div
              style={{
                height: "100%",
                width: `${levelSubPct}%`,
                backgroundColor: "#86efac",
                transition: "width 0.4s ease",
                borderRadius: levelPct > 0 ? "0 99px 99px 0" : 99,
              }}
            />
          )}
        </div>
        <span style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.01em",
              color: levelPct === 0 ? levelMeta : levelExpandedVisual ? levelFg : "#15803d",
            }}
          >
            {levelPct}%
          </span>
          {levelSubPct > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, color: levelExpandedVisual ? "#86efac" : "var(--success-600)" }}>
              +{levelSubPct}%
            </span>
          )}
        </span>
        </div>
      </div>
      )}

      {/* Right-side: unit count, building chip (expanded only), expand-all, chevron */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {levelExpandedVisual && buildingKey && buildingKey !== "__flat" && (
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "var(--tracking-ui)", textTransform: "uppercase",
            padding: "2px 7px", borderRadius: 99,
          backgroundColor: levelChipBg,
          color: levelChipFg,
          border: "none",
          }}>
            {buildingKey}
          </span>
        )}
        {unitsExpanded && unitCount > 0 && showExpandAllUnits && (
          <button
            type="button"
            id={`${contentId}-expand-all`}
            aria-expanded={allUnitsInLevelExpanded}
            aria-label={expandAllToggleAria}
            onClick={(e) => { e.stopPropagation(); onToggleExpandAllUnits(); }}
            style={expandAllUnitsBtnStyle}
          >
            {allUnitsInLevelExpanded ? (
              <FoldVertical size={18} strokeWidth={2.25} aria-hidden />
            ) : (
              <UnfoldVertical size={18} strokeWidth={2.25} aria-hidden />
            )}
          </button>
        )}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 24,
            padding: "0 9px",
            borderRadius: "var(--radius-pill)",
            backgroundColor: levelCountChipBg,
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "var(--tracking-ui)",
            color: levelCountChipFg,
            whiteSpace: "nowrap",
          }}
        >
          {t("locationGroupUnitCountCompact", { count: unitCount })}
        </span>
        {!hideLevelToggle && (
          <span aria-hidden style={levelChevronBtnStyle}>
            {unitsExpanded ? (
              <ChevronDown size={18} strokeWidth={2.25} />
            ) : (
              <ChevronRight size={18} strokeWidth={2.25} />
            )}
          </span>
        )}
      </div>
      </div>
    </div>

    </>
  );
}

// ── Unit row ──────────────────────────────────────────────────────────────────

function UnitRowCollapsed({
  card,
  expanded,
  onToggle,
  showBuildingInLocationLine,
}: {
  card: UnitCard;
  expanded: boolean;
  onToggle: () => void;
  showBuildingInLocationLine: boolean;
}) {
  const pct = unitInstallCompletePercent(card.scopes);
  const typeColor = unitTypeColor(card.unitType);
  const blockedCount = card.scopes.filter((s) => s.scopeStatus === "BLOCKED").length;
  const isBlocked = blockedCount > 0;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: 0,
        border: "none",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        userSelect: "none",
        backgroundColor: expanded ? "var(--neutral-900)" : "var(--neutral-0)",
        transition: "background-color 0.12s",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          // chevron | unit-number+type | location | scope pills
          gridTemplateColumns: "var(--min-touch) minmax(180px, 280px) minmax(140px, 180px) 1fr",
          alignItems: "center",
          gap: "var(--component-gap)",
          padding: "0 var(--page-padding-x)",
          minHeight: "var(--min-touch)",
        }}
      >
      {/* Chevron */}
      <span style={{
        color: expanded ? "var(--neutral-0)" : "var(--neutral-400)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "var(--min-touch)",
        height: "var(--min-touch)",
        marginLeft: "calc(var(--page-padding-x) * -1)",
      }}>
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </span>

      {/* Fixed-width unit slot so type pills line up in a column across rows */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--inline-gap)",
            flex: "0 0 7.25rem",
            minWidth: 0,
          }}
        >
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            color: expanded ? "var(--neutral-0)" : "var(--neutral-900)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}>
            {card.unit || "—"}
          </span>
          {isBlocked && (
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 20,
              height: 20,
              borderRadius: "50%",
              backgroundColor: "var(--warning-600)",
              color: "var(--neutral-0)",
              fontSize: 11,
              fontWeight: 800,
              padding: "0 4px",
              flexShrink: 0,
            }}>
              {blockedCount}
            </span>
          )}
          {card.issueMeta.hasOpenIssues && (
            <span
              aria-label="Has open issues"
              title="Has open issues"
              style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}
            >
              <AlertCircle size={14} color={card.issueMeta.hasBlockingIssues ? ISSUE_COLOR_BLOCKING : ISSUE_COLOR_NONBLOCKING} aria-hidden />
            </span>
          )}
        </div>
        {card.unitType && (
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 99,
            backgroundColor: expanded ? "rgba(255,255,255,0.15)" : typeColor.bg,
            color: expanded ? "var(--neutral-0)" : typeColor.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexShrink: 0,
            maxWidth: "100%",
          }}>
            {card.unitType}
          </span>
        )}
      </div>

      {/* Location: field-tracker order in UI = building → area (only if ≥2 distinct areas in project) → level */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--inline-gap)",
        minWidth: 0,
        overflow: "hidden",
      }}>
        {showBuildingInLocationLine && (card.building ?? "").trim() && (
          <span style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color: expanded ? "rgba(255,255,255,0.7)" : "var(--neutral-500)",
            whiteSpace: "nowrap",
          }}>
            <Building2 size={12} aria-hidden />
            {card.building}
          </span>
        )}
        {(card.level ?? "").trim() && (
          <span style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color: expanded ? "rgba(255,255,255,0.6)" : "var(--neutral-400)",
            whiteSpace: "nowrap",
          }}>
            <Layers size={12} aria-hidden />
            {card.level}
          </span>
        )}
        <LocationBuilderMeta card={card} onDark={expanded} muted={!expanded} />
      </div>

      {/* Scope pills */}
      <div style={{ overflow: "hidden" }}>
        <ScopePills scopes={card.scopes} onDark={expanded} />
      </div>
      </div>

      <UnitBottomProgressBar pct={pct} dark={expanded} testId="unit-row-desktop-progress" />
    </button>
  );
}

/** List view at ≤767px only: compact card; tap opens detail modal (when useMobileDetailModal). Desktop/tablet use UnitRowCollapsed. */
function UnitRowCollapsedMobile({
  card,
  detailOpen,
  onToggle,
  showBuildingInLocationLine,
}: {
  card: UnitCard;
  detailOpen: boolean;
  onToggle: () => void;
  showBuildingInLocationLine: boolean;
}) {
  const t = useTranslations("units");
  const pct = unitInstallCompletePercent(card.scopes);
  const typeColor = unitTypeColor(card.unitType);
  const blockedCount = card.scopes.filter((s) => s.scopeStatus === "BLOCKED").length;
  const isBlocked = blockedCount > 0;
  const locSegments: { key: string; icon: "building" | "map" | "layers"; label: string }[] = [];
  if (showBuildingInLocationLine && (card.building ?? "").trim()) {
    locSegments.push({ key: "building", icon: "building", label: (card.building ?? "").trim() });
  }
  if ((card.level ?? "").trim()) {
    locSegments.push({ key: "level", icon: "layers", label: (card.level ?? "").trim() });
  }

  const scopeNames = uniqueScopeDisplayLabels(card.scopes);
  const scopeSummary =
    scopeNames.length > 0
      ? scopeNames.join(", ")
      : card.scopes.length === 0
        ? t("mobileUnitCardAriaScopesNone")
        : t("mobileUnitCardAriaScopesUnnamed");

  return (
    <button
      type="button"
      data-testid="unit-row-mobile-card"
      onClick={onToggle}
      aria-haspopup="dialog"
      aria-expanded={detailOpen}
      aria-label={t("mobileUnitCardAria", {
        unit: card.unit || "—",
        scopeSummary,
        pct,
      })}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        width: "100%",
        padding: 0,
        border: "none",
        borderRadius: 8,
        backgroundColor: "var(--neutral-0)",
        cursor: "pointer",
        textAlign: "left",
        userSelect: "none",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px 12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              flex: 1,
            }}
          >
            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "var(--neutral-900)",
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {card.unit || "—"}
            </span>
            {isBlocked && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 22,
                  height: 22,
                  borderRadius: "50%",
                  backgroundColor: "var(--warning-600)",
                  color: "var(--neutral-0)",
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "0 5px",
                  flexShrink: 0,
                }}
              >
                {blockedCount}
              </span>
            )}
            {locSegments.length > 0 ? (
              <>
                <span style={{ color: "var(--neutral-300)", flexShrink: 0 }} aria-hidden>
                  ·
                </span>
                {locSegments.map((seg, i) => (
                  <span key={seg.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {i > 0 ? (
                      <span style={{ color: "var(--neutral-300)" }} aria-hidden>
                        ·
                      </span>
                    ) : null}
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--neutral-500)",
                      }}
                    >
                      {seg.icon === "building" ? <Building2 size={12} aria-hidden /> : null}
                      {seg.icon === "map" ? <MapPin size={12} aria-hidden /> : null}
                      {seg.icon === "layers" ? <Layers size={12} aria-hidden /> : null}
                      <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {seg.label}
                      </span>
                    </span>
                  </span>
                ))}
              </>
            ) : null}
            <LocationBuilderMeta card={card} muted />
          </div>
          {card.unitType ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 99,
                backgroundColor: typeColor.bg,
                color: typeColor.text,
                flexShrink: 0,
                maxWidth: "52%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textAlign: "right",
              }}
            >
              {card.unitType}
            </span>
          ) : null}
        </div>

        {card.scopes.length > 0 ? <ScopePills scopes={card.scopes} /> : null}

        <MobileUnitInstallProgressSection scopes={card.scopes} />
      </div>
    </button>
  );
}

// ── Full unit row (collapsed header + expanded content) ───────────────────────

function UnitRow({
  card,
  projectId,
  expanded,
  onToggle,
  onSaved,
  onInstanceSaved,
  onIssueMetaUpdated,
  showBuildingInLocationLine,
  useMobileCard,
  useMobileDetailModal,
  buildingStripe,
  canManageStatus = false,
  canCalibrate = false,
  canViewLocationTracking = false,
  currentUserId,
  currentUserRole,
  onPrev,
  onNext,
  unitIndex,
  unitTotal,
  onRefreshAll,
}: {
  card: UnitCard;
  projectId: string;
  expanded: boolean;
  onToggle: () => void;
  onSaved: (scopeId: string, updates: Partial<ScopeRow>) => void;
  onInstanceSaved: (rowId: string, instanceId: string, updates: Partial<SubScopeInstance>) => void;
  onIssueMetaUpdated?: (cardKey: string, meta: UnitIssueMeta) => void;
  showBuildingInLocationLine: boolean;
  useMobileCard: boolean;
  useMobileDetailModal: boolean;
  buildingStripe?: string;
  canManageStatus?: boolean;
  canCalibrate?: boolean;
  canViewLocationTracking?: boolean;
  currentUserId?: string;
  currentUserRole?: string;
  onPrev?: () => void;
  onNext?: () => void;
  unitIndex?: number;
  unitTotal?: number;
  onRefreshAll?: () => void;
}) {
  const blockedCount = card.scopes.filter((s) => s.scopeStatus === "BLOCKED").length;
  const isBlocked = blockedCount > 0;
  const allInstallComplete = card.scopes.length > 0 && unitInstallCompletePercent(card.scopes) === 100;
  const modalOpen = useMobileDetailModal && expanded;
  const inlineExpanded = expanded && !modalOpen;

  return (
    <div
      style={{
        border: (!expanded && card.issueMeta.hasBlockingIssues) ? "2px solid var(--error-600)"
          : (!expanded && (card.issueMeta.hasOpenIssues || isBlocked)) ? "2px solid var(--warning-600)"
          : (!expanded && allInstallComplete) ? "2px solid var(--success-600)"
          : "1px solid var(--neutral-300)",
        borderRadius: 8,
        // overflow visible so Stage/Status dropdowns aren't clipped by this container.
        // Border-radius is preserved on the border itself; children handle their own corners.
        backgroundColor: (!expanded && allInstallComplete) ? "var(--success-100)" : "var(--neutral-0)",
        transition: "border-color 0.12s",
        position: "relative",
        // Expanded rows stack above collapsed rows so open dropdowns appear on top.
        zIndex: expanded ? 2 : 1,
        boxShadow: "inset 3px 0 0 0 var(--neutral-400)",
      }}
    >
      {useMobileCard ? (
        <UnitRowCollapsedMobile
          card={card}
          detailOpen={modalOpen}
          onToggle={onToggle}
          showBuildingInLocationLine={showBuildingInLocationLine}
        />
      ) : (
        <UnitRowCollapsed
          card={card}
          expanded={expanded}
          onToggle={onToggle}
          showBuildingInLocationLine={showBuildingInLocationLine}
        />
      )}
      {modalOpen && (
        <MobileUnitDetailModal
          card={card}
          projectId={projectId}
          onSaved={onSaved}
          onInstanceSaved={onInstanceSaved}
          onClose={onToggle}
          onIssueMetaUpdated={onIssueMetaUpdated}
          canManageStatus={canManageStatus}
          canCalibrate={canCalibrate}
          canViewLocationTracking={canViewLocationTracking}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onPrev={onPrev}
          onNext={onNext}
          unitIndex={unitIndex}
          unitTotal={unitTotal}
          onRefreshAll={onRefreshAll}
        />
      )}
      {inlineExpanded && (
        <UnitExpandedContent
          card={card}
          projectId={projectId}
          onSaved={onSaved}
          onInstanceSaved={onInstanceSaved}
          onIssueMetaUpdated={onIssueMetaUpdated}
          canManageStatus={canManageStatus}
          canCalibrate={canCalibrate}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onRefreshAll={onRefreshAll}
        />
      )}
    </div>
  );
}

// ── Grid card: mobile 3 cols / desktop auto-fill; reserved header; 2-col scopes.

function UnitGridCard({
  card,
  expanded,
  isManuallyExpanded = false,
  isHighlighted = false,
  hasMedia = false,
  onOpen,
  isSelectMode = false,
  isSelected = false,
  onLongPress,
  onToggleSelect,
}: {
  card: UnitCard;
  expanded: boolean;
  /** True only when this card was explicitly tapped open by the user (not via expandAll). */
  isManuallyExpanded?: boolean;
  /** True when this card was recently affected by a bulk action — shows a brief pulse animation. */
  isHighlighted?: boolean;
  /** True when album-visible media exists for this unit. */
  hasMedia?: boolean;
  onOpen: () => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onLongPress?: () => void;
  onToggleSelect?: () => void;
}) {
  const t = useTranslations("units");
  const typeColor = unitTypeColor(card.unitType);
  const blockedCount = card.scopes.filter((s) => s.scopeStatus === "BLOCKED").length;
  const allInstallComplete = card.scopes.length > 0 && unitInstallCompletePercent(card.scopes) === 100;
  const unitLabel = (card.unit || "—").trim() || "—";
  const scopeCount = card.scopes.length;
  const installPct = unitInstallCompletePercent(card.scopes);
  const hasCardIssue = card.issueMeta.hasOpenIssues || blockedCount > 0;

  // Inspection overrides are intentionally NOT fetched eagerly here.
  // Firing one API call per scope × every mounted card would cause a
  // thundering-herd that saturates the Supabase connection pool and
  // makes the whole page unresponsive. Outcomes from the new inspection
  // submission system are surfaced in the detail panel via
  // ScopeInspectionsBand (which fetches lazily on open), and the grid
  // squares continue to use the existing clearInspection.status /
  // inspectionStatus DB fields which are already loaded with the unit data.

  // Long-press detection
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPos = useRef<{ x: number; y: number } | null>(null);

  function cancelLongPress() {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStartPos.current = null;
  }

  useEffect(() => {
    return () => { if (longPressTimer.current !== null) clearTimeout(longPressTimer.current); };
  }, []);

  let outlineStyle = "none";
  if (hasCardIssue) outlineStyle = "2px solid var(--unit-grid-card-issue-outline)";
  else if (isSelected || (isManuallyExpanded && !isSelectMode)) outlineStyle = "2px solid var(--unit-grid-card-selected-outline)";

  const bgColor = isSelected
    ? "var(--unit-grid-card-selected-bg)"
    : isManuallyExpanded && !isSelectMode
    ? "var(--unit-grid-card-selected-bg)"
    : allInstallComplete
    ? "var(--unit-grid-card-complete-bg)"
    : "var(--unit-grid-card-bg)";

  return (
    <button
      type="button"
      onClick={isSelectMode ? onToggleSelect : onOpen}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (isSelectMode) return;
        longPressStartPos.current = { x: e.clientX, y: e.clientY };
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = null;
          longPressStartPos.current = null;
          onLongPress?.();
        }, 500);
      }}
      onPointerMove={(e) => {
        if (!longPressStartPos.current) return;
        const dx = e.clientX - longPressStartPos.current.x;
        const dy = e.clientY - longPressStartPos.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 8) cancelLongPress();
      }}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      aria-label={
        hasMedia
          ? t("gridUnitCardAriaWithMedia", { unit: unitLabel, pct: installPct })
          : t("gridUnitCardAria", { unit: unitLabel, pct: installPct })
      }
      aria-expanded={isSelectMode ? undefined : expanded}
      aria-pressed={isSelectMode ? isSelected : undefined}
      style={{
        position: "relative",
        width: "100%",
        minWidth: 0,
        textAlign: "left",
        border: "none",
        outline: outlineStyle,
        outlineOffset: 0,
        borderRadius: "var(--unit-grid-card-radius)",
        backgroundColor: bgColor,
        padding: 8,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "outline-color 0.12s, background-color 0.12s, transform 0.12s",
        boxShadow: "var(--unit-grid-card-shadow)",
        overflow: "hidden",
        boxSizing: "border-box",
        animation: isHighlighted ? "unit-highlight-pulse 2s ease-out forwards" : undefined,
      }}
    >
      {/* Select-mode checkbox overlay */}
      {isSelectMode && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 5,
            right: 5,
            width: 18,
            height: 18,
            borderRadius: "50%",
            backgroundColor: isSelected ? "var(--primary-500)" : "rgba(255,255,255,0.9)",
            border: isSelected ? "none" : "1.5px solid var(--neutral-400)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            zIndex: 1,
          }}
        >
          {isSelected && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <polyline
                points="1.5,5 4,7.5 8.5,2.5"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      )}

      {/* Install % + gypcrete — corner overlay so meta lines use full tile width */}
      {!isSelectMode && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 3,
            maxWidth: "42%",
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontSize: "var(--text-caption)",
              fontWeight: "var(--font-weight-black)",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
              color: installPct >= 100 ? "var(--scope-tile-verified-bg)" : "var(--unit-grid-card-meta)",
              paddingTop: 1,
            }}
          >
            {installPct}
            <span style={{ fontSize: "var(--text-micro)", fontWeight: "var(--font-weight-extrabold)", marginLeft: 1 }}>%</span>
          </span>
          {card.gypcreteInspectionStatus !== undefined ? (
            <GypcreteGridDropletIcon
              status={card.gypcreteInspectionStatus}
              ariaLabel={
                card.gypcreteInspectionStatus === "PASSED"
                  ? t("gypcreteGridAriaPassed")
                  : card.gypcreteInspectionStatus === "FAILED"
                    ? t("gypcreteGridAriaFailed")
                    : t("gypcreteGridAriaNotPerformed")
              }
            />
          ) : null}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          width: "100%",
          minWidth: 0,
          flexShrink: 0,
          boxSizing: "border-box",
          paddingRight: isSelectMode ? 0 : 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, width: "100%" }}>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-caption)",
              fontWeight: "var(--font-weight-extrabold)",
              color: "var(--unit-grid-card-fg)",
              letterSpacing: "var(--tracking-tight)",
              lineHeight: 1.08,
              minWidth: 0,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {unitLabel}
          </p>
          {hasCardIssue && (
            <span
              aria-label="Has open issues"
              title="Has open issues"
              style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}
            >
              <AlertCircle size={12} color="var(--unit-grid-card-issue-outline)" aria-hidden />
            </span>
          )}
        </div>
        {card.unitType ? (
          <span
            style={{
              fontSize: "var(--text-micro)",
              fontWeight: "var(--font-weight-semibold)",
              borderRadius: "var(--radius-pill)",
              padding: "2px 6px",
              backgroundColor: typeColor.bg,
              color: typeColor.text,
              alignSelf: "flex-start",
              maxWidth: "100%",
              lineHeight: 1.1,
              letterSpacing: "var(--tracking-ui)",
              textTransform: "uppercase",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {card.unitType}
          </span>
        ) : null}
        <LocationBuilderMeta card={card} variant="compact" muted includePhase={false} />
      </div>
      <div
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {scopeCount === 0 ? (
          <span style={{ fontSize: "var(--text-micro)", color: "var(--unit-grid-card-meta)" }}>{t("noScopesGrid")}</span>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "var(--scope-tile-gap)",
              width: "100%",
            }}
          >
            {card.scopes.map((s) => {
              // For scopes managed via sub-scope instances, derive the effective
              // stage/status from the instances so the square and dot colors
              // reflect the actual state (the parent ProjectRow fields stay stale).
              const derived = s.subScopeInstances.length > 0
                ? deriveSubScopeParentState(s.subScopeInstances)
                : null;
              // Scope has an issue if: its projectRow is in the issue set,
              // OR any of its sub-scope instances has an open issue.
              const subIssueIds = card.issueMeta.subScopeInstanceIdsWithIssues;
              const hasIssue =
                card.issueMeta.scopeRowIdsWithIssues.includes(s.id) ||
                s.subScopeInstances.some((inst) => subIssueIds.includes(inst.id));
              const hasBlockingIssue =
                (card.issueMeta.scopeRowIdsWithBlockingIssues ?? []).includes(s.id) ||
                s.subScopeInstances.some((inst) =>
                  (card.issueMeta.subScopeInstanceIdsWithBlockingIssues ?? []).includes(inst.id)
                );
              return (
                <ScopeStatusSquare
                  key={s.id}
                  scope={{
                    ...s,
                    scopeStage: derived?.scopeStage ?? s.scopeStage,
                    scopeStatus: derived?.scopeStatus ?? s.scopeStatus,
                    // Grid shields use submission-derived fields when present (2AC pass before install-complete).
                    inspectionStatus: s.gridInspectionStatus ?? s.inspectionStatus,
                    latestInspectionCategory: s.latestInspectionCategory ?? null,
                    subScopeStatuses: s.subScopeInstances.map((inst) => inst.scopeStatus),
                    hasIssue,
                    hasBlockingIssue,
                    subScopeHasIssue: s.subScopeInstances.map((inst) => subIssueIds.includes(inst.id)),
                  }}
                  layout="grid"
                />
              );
            })}
          </div>
        )}
      </div>
      <div style={{ marginTop: "auto", alignSelf: "flex-start", width: "100%" }}>
        <LocationBuilderMeta
          card={card}
          variant="compact"
          muted
          includeArea={false}
        />
      </div>
      {hasMedia && !isSelectMode ? (
        <span
          data-testid="unit-grid-media-indicator"
          aria-hidden
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <Paperclip size={11} color="var(--neutral-400)" strokeWidth={2.25} />
        </span>
      ) : null}
    </button>
  );
}

// ── Skeleton loader ────────────────────────────────────────────────────────────

function UnitCardsSkeleton() {
  const levelRows = [
    { level: "2", width: "78%" },
    { level: "3", width: "62%" },
    { level: "4", width: "44%" },
    { level: "5", width: "72%" },
    { level: "6", width: "26%" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: "12px var(--page-padding-x) var(--page-padding-x)" }}>
      {/* Compact summary row: buildings left, locations right */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)", gap: 12 }}>
        <Skeleton style={{ width: 96, height: 13, borderRadius: "var(--radius-pill)" }} />
        <Skeleton style={{ width: 132, height: 13, borderRadius: "var(--radius-pill)" }} />
      </div>

      {/* Building label row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-3)" }}>
        <div
          style={{
            width: 118,
            height: 30,
            borderRadius: "var(--radius-pill)",
            backgroundColor: "var(--building-north)",
            boxShadow: "var(--shadow-card)",
            opacity: 0.22,
          }}
        />
      </div>

      {levelRows.map((row) => (
        <div key={row.level} style={{ marginBottom: 8 }}>
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              minHeight: 44,
              padding: "10px 10px 20px 12px",
              borderRadius: "var(--radius-lg)",
              backgroundColor: "var(--level-card-collapsed-bg)",
              border: "none",
              boxShadow: "var(--shadow-card)",
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: 7,
                borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)",
                backgroundColor: "var(--building-north)",
                opacity: 0.9,
              }}
            />
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 28,
                height: 28,
                marginLeft: 6,
                padding: "0 6px",
                borderRadius: "var(--radius-pill)",
                backgroundColor: "color-mix(in srgb, var(--building-north) 14%, var(--color-surface))",
                color: "transparent",
                flexShrink: 0,
              }}
            >
              {row.level}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, marginLeft: 4, marginRight: 4 }}>
              <div style={{ flex: 1, height: 5, borderRadius: "var(--radius-pill)", backgroundColor: "var(--level-card-collapsed-track)", overflow: "hidden" }}>
                <div style={{ width: row.width, height: "100%", borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-success)", opacity: 0.2 }} />
              </div>
              <Skeleton style={{ width: 28, height: 11, borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
            </div>
            <Skeleton style={{ width: 78, height: 12, borderRadius: "var(--radius-pill)", flexShrink: 0 }} />
            <Skeleton style={{ width: 18, height: 18, borderRadius: "var(--radius-sm)", flexShrink: 0 }} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 7, display: "flex", justifyContent: "center", gap: 5 }}>
              {[0, 1, 2].map((dot) => (
                <span key={dot} style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "var(--color-text-disabled)", opacity: 0.55 }} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────────

function LocationsEmptyState({
  projectId,
  canViewUpm = false,
  variant,
}: {
  projectId: string;
  canViewUpm?: boolean;
  variant: "zero" | "filtered";
}) {
  const t = useTranslations("units");

  if (variant === "filtered") {
    return (
      <div style={{ padding: "24px 0" }}>
        <p style={{ margin: 0, fontWeight: 600, color: "var(--neutral-600)" }}>{t("noUnitsMatch")}</p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--neutral-400)" }}>{t("noUnitsMatchHint")}</p>
      </div>
    );
  }

  return (
    <div
      data-testid="locations-zero-state"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 16px",
        minHeight: 240,
      }}
    >
      <div
        aria-hidden
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: "50%",
          backgroundColor: "var(--control-bg)",
          color: "var(--control-icon)",
          marginBottom: 16,
        }}
      >
        <MapPin size={24} />
      </div>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--neutral-800)" }}>
        {t("noLocationsYet")}
      </p>
      <p
        style={{
          margin: "8px 0 0",
          maxWidth: 360,
          fontSize: 13,
          lineHeight: 1.45,
          color: "var(--neutral-500)",
        }}
      >
        {canViewUpm ? t("noLocationsYetHint") : t("noLocationsYetReadOnly")}
      </p>
      {canViewUpm ? (
        <Link
          href={`/projects/${projectId}/upm`}
          aria-label={t("openLocationBuilderAria")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 20,
            minHeight: 40,
            padding: "0 18px",
            borderRadius: "var(--radius-sm, 6px)",
            backgroundColor: "var(--primary-500)",
            color: "var(--neutral-0)",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {t("openLocationBuilder")}
        </Link>
      ) : null}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface UnitCardsProps {
  projectId: string;
  /** Scroll container for infinite-scroll observer (Location Builder list area). */
  scrollRootEl?: HTMLDivElement | null;
  onRowsLoaded?: (rows: AnomalyRow[]) => void;
  onFilterOptionsLoaded?: (opts: FilterOptions) => void;
  search?: string;
  viewMode?: "list" | "grid";
  groupByLocation?: boolean;
  expandAll?: boolean;
  activeFilters?: ActiveFilters;
  onGridCardSelect?: (key: string) => void;
  /** Whether the current user may update scopeStage, scopeStatus, and inspectionStatus.
   * Controlled by MANAGE_UNIT_STATUS permission. Defaults to false. */
  canManageStatus?: boolean;
  /** Whether the current user may perform calibration inspections (CALIBRATE_INSPECTION permission). */
  canCalibrate?: boolean;
  /** Whether the current user can open Location Builder (VIEW_UPM permission). */
  canViewUpm?: boolean;
  /** Whether the current user can view GPS / heat map on activity surfaces (VIEW_LOCATION_TRACKING). */
  canViewLocationTracking?: boolean;
  /** Called whenever the list of visible filtered card keys changes (used for Select All). */
  onFilteredKeysChange?: (keys: string[]) => void;
  /**
   * Called whenever the total or filtered unit/scope counts change.
   * Lets the filter panel show "X of Y locations · A of B scopes" in real time.
   */
  onCountsChange?: (counts: {
    filteredUnits: number;
    totalUnits: number;
    filteredScopes: number;
    totalScopes: number;
  }) => void;
  /** When true, all level sections are treated as expanded (used by desktop select mode). */
  forceExpandAllLevels?: boolean;
  /** Whether bulk-select mode is active. */
  isSelectMode?: boolean;
  /** Set of card keys that are currently selected. */
  selectedKeys?: Set<string>;
  /** Called when a card is long-pressed on mobile to enter select mode with that card pre-selected. */
  onEnterSelectMode?: (key: string) => void;
  /** Toggle selection of a specific card key. */
  onToggleSelect?: (key: string) => void;
  /** Select or deselect a specific set of card keys (for per-level select-all). */
  onSelectLevelKeys?: (keys: string[], select: boolean) => void;
  /**
   * Called whenever the set of selected scope row IDs changes.
   * Returns all scope rows (id + stage) belonging to the currently selected and visible cards.
   * Used by the parent to supply rows to the bulk-actions sheet.
   */
  onSelectedRowIdsChange?: (rows: {
    id: string;
    unitKey: string;
    unitRef: string;
    stage: ScopeStage | null;
    scopeStatus: ScopeStatus;
    inspectionStatus: InspectionStatus;
    scopeTypeName: string | null;
    scopeTypeId: string | null;
    canonicalScopeTypeId?: string | null;
    canonicalDisplayName?: string | null;
    subScopes: {
      id: string;
      name: string;
      scopeStage: ScopeStage | null;
      scopeStatus: ScopeStatus;
      inspectionStatus: InspectionStatus;
    }[];
  }[]) => void;
  /** Set of unit card keys that should show a brief highlight animation (after a bulk action). */
  highlightedUnitKeys?: Set<string>;
  /** ID of the currently authenticated user — passed through to IssueDetailModal for resolve/reopen gating. */
  currentUserId?: string;
  /** Role of the currently authenticated user — passed through to IssueDetailModal for resolve/reopen gating. */
  currentUserRole?: string;
  /**
   * When provided, the affected level-section keys are merged into the current expanded set.
   * The `seq` field acts as a version counter — incrementing it triggers the override even
   * if the set of keys is the same. Use this after a bulk action to reveal affected levels
   * without collapsing levels the user already had open.
   */
  forcedExpandLevelKeys?: { keys: Set<string>; seq: number };
  /**
   * Incrementing this number triggers a silent background re-fetch of unit data without
   * resetting any UI state (expanded levels, manual toggles, etc.).
   */
  refreshTrigger?: number;
  /** Called when a group issue resolve affects multiple units — triggers a full data refresh. */
  onRefreshAll?: () => void;
  /**
   * When set, only unit cards whose key is in this set are shown.
   * Used after a bulk action so the user can see exactly which units were affected.
   */
  postBulkFilterKeys?: Set<string>;
}

const DEFAULT_FILTERS: ActiveFilters = {
  stages: [], scopeTypeNames: [], scopeSubNames: [], unitTypes: [], locationKinds: [],
  buildings: [], levels: [], buildPhases: [], areas: [],
  issueTypes: [], responsibleParties: [], issueStatuses: [], issueBlocking: null,
  issueScopeTypeNames: [], issueSubScopeNames: [], inspectionStatuses: [], calibrationStatuses: [],
  subcontractorAssigned: null, subcontractorIds: [], unitsWithIssuesOnly: false,
};

export function UnitCards({
  projectId,
  scrollRootEl,
  onRowsLoaded,
  onFilterOptionsLoaded,
  search = "",
  viewMode = "list",
  groupByLocation = false,
  expandAll = false,
  activeFilters = DEFAULT_FILTERS,
  onGridCardSelect,
  canManageStatus = false,
  canCalibrate = false,
  canViewUpm = false,
  canViewLocationTracking = false,
  onFilteredKeysChange,
  onCountsChange,
  forceExpandAllLevels = false,
  isSelectMode = false,
  selectedKeys,
  onEnterSelectMode,
  onToggleSelect,
  onSelectLevelKeys,
  onSelectedRowIdsChange,
  highlightedUnitKeys,
  currentUserId,
  currentUserRole,
  forcedExpandLevelKeys,
  refreshTrigger,
  onRefreshAll,
  postBulkFilterKeys,
}: UnitCardsProps) {
  const t = useTranslations("units");
  const { isOnline } = useOfflineStatus();
  const [isFromCache, setIsFromCache] = useState(false);
  const [cacheDate, setCacheDate] = useState<string | null>(null);
  useRegisterOfflineCacheView(isFromCache, cacheDate);
  const [cards, setCards] = useState<UnitCard[]>([]);
  const [accumulatedRows, setAccumulatedRows] = useState<RawRow[]>([]);
  const [projectInspectionSubmissions, setProjectInspectionSubmissions] = useState<InspectionSubmission[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalScopeRows, setTotalScopeRows] = useState<number | null>(null);
  /** Distinct unit count for the project (or search), from first paginated response; not loaded-card count. */
  const [totalUnitCount, setTotalUnitCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadRetryToken, setLoadRetryToken] = useState(0);
  const [unitsInitialLoadSettled, setUnitsInitialLoadSettled] = useState(false);
  const loadRetryCountRef = useRef(0);
  const loadRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Track previous online state so we can skip re-fetches triggered by going offline.
  // null = component just mounted (no previous state), true/false = prior known state.
  const prevIsOnlineRef = useRef<boolean | null>(null);
  // Internal counter that increments each time the mutation queue finishes flushing.
  // This drives a silent re-fetch of unit rows so scope status changes made offline
  // appear in the UI immediately after sync — without waiting for a full navigation.
  const [postSyncRefreshTrigger, setPostSyncRefreshTrigger] = useState(0);
  useEffect(() => {
    const handler = () => setPostSyncRefreshTrigger((n) => n + 1);
    window.addEventListener(OFFLINE_SYNC_COMPLETE_EVENT, handler);
    return () => window.removeEventListener(OFFLINE_SYNC_COMPLETE_EVENT, handler);
  }, []);
  useEffect(() => {
    const onSnapshotSynced = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId !== projectId) return;
      if (unitsInitialLoadSettled) return;
      loadRetryCountRef.current = 0;
      setLoadRetryToken((token) => token + 1);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (unitsInitialLoadSettled || loading) return;
      if (accumulatedRows.length > 0) return;
      setLoadRetryToken((token) => token + 1);
    };
    window.addEventListener(OFFLINE_SNAPSHOT_SYNCED_EVENT, onSnapshotSynced);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(OFFLINE_SNAPSHOT_SYNCED_EVENT, onSnapshotSynced);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [projectId, unitsInitialLoadSettled, loading, accumulatedRows.length]);
  // Track individual manual toggles separately from expandAll
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(new Set());
  const [manualCollapsed, setManualCollapsed] = useState<Set<string>>(new Set());
  // Dedicated set for which unit detail panels are open — independent of expand-all state
  const [modalOpenKeys, setModalOpenKeys] = useState<Set<string>>(new Set());
  const [mobileListLayout, setMobileListLayout] = useState(false);
  const [inspectionOverlayOpen, setInspectionOverlayOpen] = useState(false);
  const [pinnedMobileListLayout, setPinnedMobileListLayout] = useState<boolean | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [locationModalState, setLocationModalState] = useState<{ building: string; level?: string; mode: "issue" | "obs" } | null>(null);
  const [unitRefsWithMedia, setUnitRefsWithMedia] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/album/coverage`, {
          signal: controller.signal,
          cache: isOnline ? "no-store" : "default",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { unitRefs: string[] };
        setUnitRefsWithMedia(new Set(data.unitRefs));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    })();
    return () => controller.abort();
  }, [projectId, isOnline, postSyncRefreshTrigger]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), FIELD_TRACKER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobileListLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const sync = () => setInspectionOverlayOpen(isInspectionOverlayChromeSuppressed());
    sync();
    return subscribeInspectionOverlayChrome(sync);
  }, []);

  /** Grid, media, and “group by location” need every row for correct grouping; list-only uses cursor pagination. */
  const loadAllRows = viewMode === "grid" || groupByLocation;

  useEffect(() => {
    // justWentOffline is only true when we had a confirmed-online previous render
    // AND the device is now offline. On fresh mount, prevIsOnlineRef is null,
    // so this guard does NOT fire — the initial fetch still runs.
    const justWentOffline = prevIsOnlineRef.current === true && !navigator.onLine;
    prevIsOnlineRef.current = navigator.onLine;

    // When going offline mid-session, keep the currently-displayed data visible.
    // The data is already in state; wiping + re-fetching only shows an error.
    if (justWentOffline) return;

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 6000);
    let abortedByCleanup = false;
    let keepLoadingAfterFetch = false;
    if (loadRetryTimeoutRef.current) {
      clearTimeout(loadRetryTimeoutRef.current);
      loadRetryTimeoutRef.current = null;
    }
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    setIsFromCache(false);
    setCacheDate(null);
    setAccumulatedRows([]);
    setHasMore(false);
    setNextCursor(null);
    setTotalScopeRows(null);
    setTotalUnitCount(null);

    const params = new URLSearchParams();
    if (!loadAllRows) {
      params.set("limit", String(FIELD_TRACKER_UNITS_PAGE_LIMIT));
    }
    const q = debouncedSearch.trim();
    if (q) params.set("search", q);
    const qs = params.toString();
    fetchUnitsWithGridInspection<RawRow>(
      projectId,
      `/api/projects/${projectId}/units${qs ? `?${qs}` : ""}`,
      loadAllRows,
      { signal: controller.signal, cache: loadAllRows ? "no-store" : "default" },
    )
      .then((result) => {
        clearTimeout(abortTimer);
        if (controller.signal.aborted) return;
        loadRetryCountRef.current = 0;
        setUnitsInitialLoadSettled(true);
        setIsFromCache(false);
        setCacheDate(null);
        const { page: data, submissions } = result;
        setProjectInspectionSubmissions(submissions);
        setAccumulatedRows(data.units);
        if (loadAllRows) {
          setHasMore(false);
          setNextCursor(null);
          setTotalScopeRows(data.units.length);
          setTotalUnitCount(distinctUnitCountFromRows(data.units));
        } else {
          setHasMore(data.hasMore === true);
          setNextCursor(data.nextCursor ?? null);
          if (typeof data.total === "number") setTotalScopeRows(data.total);
          if (typeof data.totalUnits === "number") setTotalUnitCount(data.totalUnits);
        }
      })
      .catch(async (e: Error) => {
        clearTimeout(abortTimer);
        if (abortedByCleanup) return;
        const fallback = await readSnapshotUnitsForProject<RawRow & { projectId?: string }>(projectId);
        if (fallback) {
          loadRetryCountRef.current = 0;
          setUnitsInitialLoadSettled(true);
          setAccumulatedRows(fallback.units as RawRow[]);
          setIsFromCache(true);
          setCacheDate(fallback.generatedAt);
          setLoading(false);
          return;
        }
        if (e.name === "AbortError") {
          loadRetryCountRef.current += 1;
          if (loadRetryCountRef.current <= 5) {
            keepLoadingAfterFetch = true;
            setError(null);
            loadRetryTimeoutRef.current = setTimeout(() => {
              loadRetryTimeoutRef.current = null;
              setLoadRetryToken((token) => token + 1);
            }, 2000);
            return;
          }
        }
        setUnitsInitialLoadSettled(true);
        setLoading(false);
        if (e.name === "AbortError") {
          setError(t("fetchTimeoutError"));
          return;
        }
        setError(e.message);
      })
      .finally(() => {
        clearTimeout(abortTimer);
        if (!abortedByCleanup && !keepLoadingAfterFetch) setLoading(false);
      });

    return () => {
      clearTimeout(abortTimer);
      if (loadRetryTimeoutRef.current) {
        clearTimeout(loadRetryTimeoutRef.current);
        loadRetryTimeoutRef.current = null;
      }
      abortedByCleanup = true;
      controller.abort();
    };
  }, [projectId, debouncedSearch, loadAllRows, isOnline, t, loadRetryToken]);

  useEffect(() => {
    const grouped = mergeUnitGypcreteOntoCards(
      groupIntoCards(accumulatedRows),
      projectInspectionSubmissions,
    );
    setCards(grouped);
    if (loading && accumulatedRows.length === 0) return;
    onFilterOptionsLoaded?.(extractFilterOptions(grouped));
    onRowsLoaded?.(accumulatedRows.map((r) => ({
      id: r.id, building: r.building, level: r.level, unit: r.unit,
      description: r.description, scopeStage: r.scopeStage,
      scopeStatus: r.scopeStatus, percentComplete: r.percentComplete, finishDate: null,
    })));
  }, [accumulatedRows, loading, projectInspectionSubmissions, onFilterOptionsLoaded, onRowsLoaded]);

  /** Re-apply submission-derived grid shields when project submissions refresh after unit rows load. */
  useEffect(() => {
    if (!loadAllRows || projectInspectionSubmissions.length === 0) return;
    setAccumulatedRows((prev) => {
      if (prev.length === 0) return prev;
      const merged = mergeGridInspectionFromSubmissions(prev, projectInspectionSubmissions);
      const changed = merged.some(
        (row, i) =>
          row.gridInspectionStatus !== prev[i]?.gridInspectionStatus ||
          row.latestInspectionCategory !== prev[i]?.latestInspectionCategory,
      );
      return changed ? merged : prev;
    });
  }, [projectInspectionSubmissions, loadAllRows]);

  /** Re-merge grid when inspections change (queued offline submit or post-sync). */
  useEffect(() => {
    if (!loadAllRows) return;
    const onInspectionUpdate = () => {
      void listByProject(projectId).then((subs) => {
        setProjectInspectionSubmissions(subs);
        setAccumulatedRows((prev) => {
          if (prev.length === 0) return prev;
          const merged = mergeGridInspectionFromSubmissions(prev, subs);
          const changed = merged.some(
            (row, i) =>
              row.gridInspectionStatus !== prev[i]?.gridInspectionStatus ||
              row.latestInspectionCategory !== prev[i]?.latestInspectionCategory,
          );
          return changed ? merged : prev;
        });
      });
    };
    window.addEventListener("inspections:updated", onInspectionUpdate);
    return () => window.removeEventListener("inspections:updated", onInspectionUpdate);
  }, [projectId, loadAllRows]);

  const loadNextPage = useCallback(async () => {
    if (loadingMoreRef.current || nextCursor == null || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const params = new URLSearchParams({
        limit: String(FIELD_TRACKER_UNITS_PAGE_LIMIT),
        cursor: nextCursor,
      });
      const q = debouncedSearch.trim();
      if (q) params.set("search", q);
      const res = await fetch(`/api/projects/${projectId}/units?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        units: RawRow[];
        hasMore?: boolean;
        nextCursor?: string | null;
      };
      setAccumulatedRows((prev) => [...prev, ...data.units]);
      setHasMore(data.hasMore === true);
      setNextCursor(data.nextCursor ?? null);
    } catch (e: unknown) {
      setLoadMoreError(e instanceof Error ? e.message : String(e));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [projectId, nextCursor, hasMore, debouncedSearch]);

  useEffect(() => {
    const root = scrollRootEl;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || loading || !hasMore || nextCursor == null) return;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit || loadingMoreRef.current || loadingMore) return;
        void loadNextPage();
      },
      { root, rootMargin: "160px", threshold: 0 }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [scrollRootEl, loading, hasMore, nextCursor, loadingMore, loadMoreError, loadNextPage, debouncedSearch]);

  // Silent background refresh — re-fetches unit data without resetting any UI state.
  // Triggered by incrementing the refreshTrigger prop (e.g. after bulk actions, sub-scope changes).
  const refreshTriggerRef = useRef(refreshTrigger ?? 0);
  useEffect(() => {
  // Run a silent re-fetch when an explicit refreshTrigger is provided by the parent
  // OR after the mutation queue finishes flushing (postSyncRefreshTrigger). Both
  // update unit rows without resetting any UI state (no loading spinner, no cleared
  // cards) so scope status changes made offline appear immediately after sync.
    if (refreshTrigger === undefined && postSyncRefreshTrigger === 0) return;
    const combinedTrigger = (refreshTrigger ?? 0) + postSyncRefreshTrigger;
    if (combinedTrigger === refreshTriggerRef.current) { refreshTriggerRef.current = combinedTrigger; return; }
    refreshTriggerRef.current = combinedTrigger;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (!loadAllRows) params.set("limit", String(FIELD_TRACKER_UNITS_PAGE_LIMIT));
    const q = debouncedSearch.trim();
    if (q) params.set("search", q);
    const qs = params.toString();
    fetchUnitsWithGridInspection<RawRow>(
      projectId,
      `/api/projects/${projectId}/units${qs ? `?${qs}` : ""}`,
      loadAllRows,
      { signal: controller.signal, cache: loadAllRows ? "no-store" : "default" },
    )
      .then(({ page, submissions }) => {
        setIsFromCache(false);
        setCacheDate(null);
        const units = page.units;
        setProjectInspectionSubmissions(submissions);
        setAccumulatedRows(units);
        const grouped = groupIntoCards(units);
        setCards(grouped);
        onRowsLoaded?.(units.map((r) => ({
          id: r.id, building: r.building, level: r.level, unit: r.unit,
          description: r.description, scopeStage: r.scopeStage,
          scopeStatus: r.scopeStatus, percentComplete: r.percentComplete, finishDate: null,
        })));
        onFilterOptionsLoaded?.(extractFilterOptions(grouped));
      })
      .catch((e: Error) => { if (e.name !== "AbortError") console.error("Silent refresh failed:", e.message); });
    return () => controller.abort();
   
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, postSyncRefreshTrigger, loadAllRows]);

  // Derive which keys are expanded — pure computation, no effect needed
  const expandedKeys = useMemo(() => {
    if (expandAll) {
      return new Set(cards.map((c) => c.key).filter((k) => !manualCollapsed.has(k)));
    }
    return manualExpanded;
  }, [expandAll, cards, manualExpanded, manualCollapsed]);

  /** Pin mobile layout while unit detail or inspection overlay is open — rotate must not unmount. */
  const preserveUnitChrome =
    inspectionOverlayOpen ||
    modalOpenKeys.size > 0 ||
    (viewMode === "list" && !expandAll && expandedKeys.size > 0);

  useEffect(() => {
    setPinnedMobileListLayout((pinned) =>
      nextPinnedBoolean({
        live: mobileListLayout,
        pinned,
        preserveChrome: preserveUnitChrome,
      }),
    );
  }, [mobileListLayout, preserveUnitChrome]);

  const effectiveMobileListLayout = effectiveBoolean({
    live: mobileListLayout,
    pinned: preserveUnitChrome ? pinnedMobileListLayout : null,
  });

  // Detail modals/panels must only open for cards explicitly tapped by the user.
  // modalOpenKeys is a dedicated set — it is never polluted by expandAll state.

  const handleSaved = useCallback((scopeId: string, updates: Partial<ScopeRow>) => {
    setAccumulatedRows((prev) =>
      prev.map((row) => (row.id === scopeId ? { ...row, ...updates } : row)),
    );
    setCards((prev) => prev.map((card) => ({
      ...card,
      scopes: card.scopes.map((s) => s.id === scopeId ? { ...s, ...updates } : s),
    })));
  }, []);

  const handleIssueMetaUpdated = useCallback((cardKey: string, meta: UnitIssueMeta) => {
    setCards((prev) => prev.map((card) =>
      card.key === cardKey ? { ...card, issueMeta: meta } : card
    ));
  }, []);

  const handleInstanceSaved = useCallback(
    (rowId: string, instanceId: string, updates: Partial<SubScopeInstance>) => {
      setCards((prev) =>
        prev.map((card) => ({
          ...card,
          scopes: card.scopes.map((s) =>
            s.id !== rowId
              ? s
              : {
                  ...s,
                  subScopeInstances: s.subScopeInstances.map((inst) =>
                    inst.id === instanceId ? { ...inst, ...updates } : inst
                  ),
                }
          ),
        }))
      );
    },
    []
  );

  function toggleExpand(key: string) {
    if (expandAll) {
      // When expandAll is active, toggle into manual-collapsed set
      setManualCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    } else {
      // Normal mode: toggle into manual-expanded set
      setManualExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }
  }

  function toggleModalOpen(key: string) {
    setModalOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Close one unit's detail modal and open another without a flicker.
   *  Also auto-expands the target unit's level section so the modal always renders,
   *  even when navigating across building/level groups that start collapsed. */
  function navigateToUnit(fromKey: string, toKey: string) {
    const toCard = filteredCards.find((c) => c.key === toKey);
    if (toCard) {
      const buildingKey = toCard.building || MISSING_LOCATION_LABEL;
      const levelKey = (toCard.level ?? "").trim() || MISSING_LOCATION_LABEL;
      const targetSectionKey = `${buildingKey}::${levelKey}`;
      setExpandedLevelSections((prev) => {
        if (prev.has(targetSectionKey)) return prev;
        const next = new Set(prev);
        next.add(targetSectionKey);
        return next;
      });
    }

    if (expandAll) {
      setManualCollapsed((prev) => {
        const next = new Set(prev);
        next.add(fromKey);
        next.delete(toKey);
        return next;
      });
    } else {
      setManualExpanded((prev) => {
        const next = new Set(prev);
        next.delete(fromKey);
        next.add(toKey);
        return next;
      });
    }

    setModalOpenKeys((prev) => {
      const next = new Set(prev);
      next.delete(fromKey);
      next.add(toKey);
      return next;
    });
  }

  const serverSearchActive = debouncedSearch.trim().length > 0;

   
  const filteredCards = useMemo(() => {
    const base = applyUnitCardFilters(cards, search, activeFilters, serverSearchActive);
    if (!postBulkFilterKeys || postBulkFilterKeys.size === 0) return base;
    return base.filter((c) => postBulkFilterKeys.has(c.key));
  }, [cards, search, activeFilters, serverSearchActive, postBulkFilterKeys]);

  const showCustomSiteLocations = useMemo(
    () => shouldShowCustomSiteLocations(activeFilters),
    [activeFilters],
  );

  // Notify parent of the current filtered key list so it can implement Select All correctly.
  const onFilteredKeysChangeRef = useRef(onFilteredKeysChange);
  useEffect(() => { onFilteredKeysChangeRef.current = onFilteredKeysChange; });
  useEffect(() => {
    onFilteredKeysChangeRef.current?.(filteredCards.map((c) => c.key));
  }, [filteredCards]);

  // Notify parent of live unit + scope counts (filtered vs total) for the filter panel header.
  const onCountsChangeRef = useRef(onCountsChange);
  useEffect(() => { onCountsChangeRef.current = onCountsChange; });
  useEffect(() => {
    onCountsChangeRef.current?.({
      filteredUnits: filteredCards.length,
      totalUnits: cards.length,
      filteredScopes: filteredCards.reduce((sum, c) => sum + c.scopes.length, 0),
      totalScopes: cards.reduce((sum, c) => sum + c.scopes.length, 0),
    });
  }, [filteredCards, cards]);

  // Notify parent of scope row IDs for all currently selected + visible cards.
  // The parent uses this to supply row IDs to the bulk-actions sheet.
  const onSelectedRowIdsChangeRef = useRef(onSelectedRowIdsChange);
  useEffect(() => { onSelectedRowIdsChangeRef.current = onSelectedRowIdsChange; });
  useEffect(() => {
    if (!onSelectedRowIdsChangeRef.current) return;
    const rows = filteredCards
      .filter((c) => selectedKeys?.has(c.key))
      .flatMap((c) => c.scopes.map((s) => ({
        id: s.id,
        unitKey: c.key,
        unitRef: c.key, // c.key === `${building}|${level}|${unit}` — same as unitRef on issues/observations
        stage: s.scopeStage ?? null,
        scopeStatus: s.scopeStatus ?? "NOT_STARTED",
        // ProjectRow.inspectionStatus is the authoritative source.
        // Legacy clearInspection records are no longer read.
        inspectionStatus: s.inspectionStatus ?? null,
        scopeTypeName: s.scopeType?.canonicalScopeType?.displayName ?? s.scopeType?.name ?? null,
        scopeTypeId: s.scopeType?.id ?? null,
        canonicalScopeTypeId: s.scopeType?.canonicalScopeType?.id ?? null,
        canonicalDisplayName: s.scopeType?.canonicalScopeType?.displayName ?? null,
        subScopes: s.subScopeInstances.map((i) => ({
          id: i.id,
          name: i.subScope.name,
          scopeStage: i.scopeStage ?? null,
          scopeStatus: i.scopeStatus ?? "NOT_STARTED",
          inspectionStatus: i.inspectionStatus ?? null,
        })),
      })));
    onSelectedRowIdsChangeRef.current(rows);
  }, [selectedKeys, filteredCards]);

  const showBuildingInLocationLine = useMemo(() => shouldShowBuildingInLocationLine(cards), [cards]);
  const locationMetaLabels = useMemo(
    () => ({
      buildPhase: (phase: string) => t("locationMetaBuildPhaseShort", { phase }),
      area: (area: string) => t("locationMetaArea", { area }),
    }),
    [t],
  );
  const metaSuffixForCards = useCallback(
    (sectionCards: UnitCard[]) =>
      joinLocationBuilderMetaParts(
        labeledLocationBuilderMetaParts(
          sharedLocationBuilderFields(sectionCards),
          locationMetaLabels,
        ),
      ),
    [locationMetaLabels],
  );

  /** Grid always groups by building+level; list uses the toolbar toggle only. */
  const effectiveGroupByLocation = viewMode === "grid" || groupByLocation;

  const locationGroups = useMemo(
    () => buildBuildingLevelGroups(filteredCards, effectiveGroupByLocation),
    [filteredCards, effectiveGroupByLocation]
  );

  /**
   * Cards in visual order: within each level section, common areas appear before
   * regular units (matching the in-section divider render order). Custom site
   * locations render above common areas but are not part of this card list.
   * Used for prev/next navigation in detail panels.
   */
  const visuallyOrderedCards = useMemo(
    () =>
      locationGroups.flatMap((g) =>
        g.levelSections.flatMap((s) => [
          ...s.cards.filter((c) => isCommonAreaCard(c)),
          ...s.cards.filter((c) => !isCommonAreaCard(c)),
        ])
      ),
    [locationGroups]
  );

  const buildingKeysOrder = useMemo(() => buildingKeysInViewOrder(filteredCards), [filteredCards]);

  const customSiteFilterOpts = useMemo(() => extractFilterOptions(cards), [cards]);
  const customSiteLevelOptions = useMemo(() => {
    const levels: string[] = [];
    for (const building of customSiteFilterOpts.buildings) {
      const buildingLevels = customSiteFilterOpts.buildingLevels[building] ?? [];
      for (const level of buildingLevels) {
        levels.push(`${building}|${level}`);
      }
    }
    return levels;
  }, [customSiteFilterOpts.buildings, customSiteFilterOpts.buildingLevels]);

  const totalBuildingCount = useMemo(() => buildingKeysInViewOrder(cards).length, [cards]);
  const visibleBuildingCount = useMemo(
    () => buildingKeysInViewOrder(filteredCards).length,
    [filteredCards]
  );
   

  /** Level rows user has opened (list + grid); absent keys stay collapsed (no sync effect). */
  const [expandedLevelSections, setExpandedLevelSections] = useState<Set<string>>(() => new Set());

  // When the parent fires a forcedExpandLevelKeys directive (e.g. after bulk action),
  // merge the affected keys into the current expanded set so already-open levels stay open.
  // The seq counter lets the parent re-trigger even if the key set is identical.
  const lastForcedSeqRef = useRef(0);
  useEffect(() => {
    if (!forcedExpandLevelKeys) return;
    if (forcedExpandLevelKeys.seq <= lastForcedSeqRef.current) return;
    lastForcedSeqRef.current = forcedExpandLevelKeys.seq;
    setExpandedLevelSections((prev) => {
      const next = new Set(prev);
      for (const k of forcedExpandLevelKeys.keys) next.add(k);
      return next;
    });
  }, [forcedExpandLevelKeys]);

  // Auto-expand all level sections when entering select mode so units are visible.
  // Uses a separate effect so manual collapse/expand still works while in select mode.
  useEffect(() => {
    if (!isSelectMode) return;
    setExpandedLevelSections((prev) => {
      const allKeys = locationGroups.flatMap((g) =>
        g.levelSections.filter((s) => s.levelKey !== "__all").map((s) => `${g.buildingKey}::${s.levelKey}`)
      );
      if (allKeys.every((k) => prev.has(k))) return prev; // already all expanded
      const next = new Set(prev);
      for (const k of allKeys) next.add(k);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelectMode]);

  // Track whether filters were active on the previous render so we can detect
  // the transition from filtered → unfiltered without triggering on data refreshes.
  const prevWasFilteredRef = useRef(false);

  // Auto-expand level sections that contain results whenever filters or search are active.
  // When filters are fully cleared (transition from active → inactive), collapse all levels
  // back to default. A background data refresh that changes filteredCards while no filters
  // are active does NOT collapse levels (prevWasFilteredRef stays false).
  useEffect(() => {
    const isFiltered =
      search.trim().length > 0 ||
      activeFilters.stages.length > 0 ||
      activeFilters.scopeTypeNames.length > 0 ||
      activeFilters.scopeSubNames.length > 0 ||
      activeFilters.unitTypes.length > 0 ||
      (activeFilters.locationKinds ?? []).length > 0 ||
      activeFilters.buildings.length > 0 ||
      activeFilters.levels.length > 0 ||
      activeFilters.buildPhases.length > 0 ||
      activeFilters.areas.length > 0 ||
      activeFilters.issueTypes.length > 0 ||
      activeFilters.responsibleParties.length > 0 ||
      activeFilters.issueStatuses.length > 0 ||
      activeFilters.issueBlocking !== null ||
      activeFilters.unitsWithIssuesOnly ||
      (activeFilters.inspectionStatuses ?? []).length > 0 ||
      (activeFilters.calibrationStatuses ?? []).length > 0;

    if (!isFiltered) {
      // Only collapse when transitioning from active filters → no filters.
      // Skip when filteredCards changes due to a background data refresh
      // (e.g. unit detail modal opening), which would wrongly kick users out.
      if (prevWasFilteredRef.current) {
        setExpandedLevelSections((prev) => (prev.size === 0 ? prev : new Set()));
      }
      prevWasFilteredRef.current = false;
      return;
    }

    prevWasFilteredRef.current = true;
    setExpandedLevelSections((prev) => {
      const keysWithResults = locationGroups.flatMap((g) =>
        g.levelSections
          .filter((s) => s.levelKey !== "__all" && s.cards.length > 0)
          .map((s) => `${g.buildingKey}::${s.levelKey}`)
      );
      if (keysWithResults.every((k) => prev.has(k))) return prev; // already expanded
      const next = new Set(prev);
      for (const k of keysWithResults) next.add(k);
      return next;
    });
  // filteredCards changing is the signal that search/filters changed the visible set
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCards]);

   
  const toggleLevelSectionVisibility = useCallback((sectionKey: string) => {
    setExpandedLevelSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }, []);

  const toggleExpandAllLevelsForGroup = useCallback(
    (g: { buildingKey: string; levelSections: { levelKey: string }[] }) => {
      const keys = levelSectionKeysForBuilding(g);
      if (keys.length === 0) return;
      setExpandedLevelSections((prev) => {
        const allExpanded = keys.every((k) => prev.has(k));
        const next = new Set(prev);
        if (allExpanded) {
          for (const k of keys) next.delete(k);
        } else {
          for (const k of keys) next.add(k);
        }
        return next;
      });
    },
    []
  );
   

  const toggleExpandAllUnitsInSection = useCallback(
    (cardKeys: string[]) => {
      if (cardKeys.length === 0) return;
      const rowExpanded = (k: string) => (expandAll ? !manualCollapsed.has(k) : manualExpanded.has(k));
      const allExpanded = cardKeys.every((k) => rowExpanded(k));

      if (allExpanded) {
        if (expandAll) {
          setManualCollapsed((mc) => {
            const n = new Set(mc);
            for (const k of cardKeys) n.add(k);
            return n;
          });
        } else {
          setManualExpanded((me) => {
            const n = new Set(me);
            for (const k of cardKeys) n.delete(k);
            return n;
          });
        }
      } else if (expandAll) {
        setManualCollapsed((mc) => {
          const n = new Set(mc);
          for (const k of cardKeys) n.delete(k);
          return n;
        });
      } else {
        setManualExpanded((me) => {
          const n = new Set(me);
          for (const k of cardKeys) n.add(k);
          return n;
        });
      }
    },
    [expandAll, manualCollapsed, manualExpanded]
  );

  if (loading) return <UnitCardsSkeleton />;

  if (error) return <div style={{ padding: 20, color: "var(--error-600)", fontSize: 14 }}>{t("error", { error })}</div>;

  const showInfiniteFooter = hasMore || loadingMore || loadMoreError != null;
  const showRowsProgress =
    totalScopeRows != null && totalScopeRows > 0 && (hasMore || loadingMore);
  const loadingRowsToast = (
    <LoadingRowsToast
      show={showInfiniteFooter}
      progressText={
        showRowsProgress
          ? t("scopesLoadedProgress", { loaded: accumulatedRows.length, total: totalScopeRows })
          : null
      }
      loading={loadingMore}
      loadingLabel={t("loadingMoreUnits")}
      errorMessage={loadMoreError ? t("loadMoreError", { error: loadMoreError }) : null}
      onRetry={() => void loadNextPage()}
      retryLabel={t("loadMoreRetry")}
      testId="units-loading-rows-toast"
    />
  );
  const infiniteScrollSentinel =
    hasMore && nextCursor != null ? (
      <div ref={sentinelRef} data-testid="units-load-more-sentinel" style={{ height: 1, width: "100%" }} aria-hidden />
    ) : null;

  /** Overall distinct-unit total (API); falls back to loaded cards when absent. */
  const summaryTotalUnits = totalUnitCount ?? cards.length;
  const showCount = filteredCards.length;
  const isMobileList = effectiveMobileListLayout && viewMode === "list";
  const useMobileDetailModal = isMobileList && !expandAll;
  /** Mobile grid: tap opens same full-screen detail modal as mobile list (not desktop list-switch). */
  const useMobileGridDetailModal = effectiveMobileListLayout && viewMode === "grid";
  /** Desktop grid: tap opens a right-side slide-in panel. */
  const useDesktopGridDetailPanel = !effectiveMobileListLayout && viewMode === "grid";
  const showLevelExpandAllUnits = !effectiveMobileListLayout;

  const unitBuildingSummary = (margin: string) => (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        margin,
        flexWrap: "nowrap",
      }}
    >
      {cards.length > 0 ? (
        <span style={{ fontSize: 13, color: "var(--neutral-500)", fontWeight: 600, whiteSpace: "nowrap" }}>
          {t("buildingsCompactSummary", { visible: visibleBuildingCount, total: totalBuildingCount })}
        </span>
      ) : (
        <span />
      )}
      <span style={{ fontSize: 13, color: "var(--neutral-500)", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>
        {t("locationsCompactSummary", { visible: showCount, total: summaryTotalUnits })}
        </span>
    </div>
  );

  const customSiteSection = showCustomSiteLocations ? <CustomSiteLocationsSection /> : null;

  const customSiteProviderProps = {
    projectId,
    buildingOptions: customSiteFilterOpts.buildings,
    levelOptions: customSiteLevelOptions,
    currentUserId,
    currentUserRole,
    locationsFilterVisible: showCustomSiteLocations,
    detailDesktopPanel: !effectiveMobileListLayout,
  };

  // Grid view
  if (viewMode === "grid") {
    /** Render a set of unit cards as a grid row, with modals wired up. */
    const renderCardGrid = (cards: UnitCard[]) => (
      <div className="units-grid-squares">
        {cards.map((card) => (
          <div key={card.key} style={{ minWidth: 0 }}>
            <UnitGridCard
              card={card}
              expanded={expandedKeys.has(card.key)}
              isManuallyExpanded={manualExpanded.has(card.key)}
              isHighlighted={highlightedUnitKeys?.has(card.key) ?? false}
              hasMedia={unitRefsWithMedia.has(card.key)}
              onOpen={() => {
                if (!isSelectMode) toggleModalOpen(card.key);
              }}
              isSelectMode={isSelectMode}
              isSelected={selectedKeys?.has(card.key) ?? false}
              onLongPress={() => onEnterSelectMode?.(card.key)}
              onToggleSelect={() => onToggleSelect?.(card.key)}
            />
            {(useMobileGridDetailModal || useDesktopGridDetailPanel) && modalOpenKeys.has(card.key) ? (
              (() => {
                const cardIdx = visuallyOrderedCards.findIndex((c) => c.key === card.key);
                const prevCard = cardIdx > 0 ? visuallyOrderedCards[cardIdx - 1] : undefined;
                const nextCard = cardIdx < visuallyOrderedCards.length - 1 ? visuallyOrderedCards[cardIdx + 1] : undefined;
                return (
                  <MobileUnitDetailModal
                    card={card}
                    projectId={projectId}
                    onSaved={handleSaved}
                    onInstanceSaved={handleInstanceSaved}
                    onClose={() => toggleModalOpen(card.key)}
                    onIssueMetaUpdated={handleIssueMetaUpdated}
                    canManageStatus={canManageStatus}
                    canCalibrate={canCalibrate}
                    canViewLocationTracking={canViewLocationTracking}
                    currentUserId={currentUserId}
                    currentUserRole={currentUserRole}
                    unitIndex={cardIdx + 1}
                    unitTotal={visuallyOrderedCards.length}
                    onPrev={prevCard ? () => navigateToUnit(card.key, prevCard.key) : undefined}
                    onNext={nextCard ? () => navigateToUnit(card.key, nextCard.key) : undefined}
                    desktopPanel={useDesktopGridDetailPanel}
                    onRefreshAll={onRefreshAll}
                  />
                );
              })()
            ) : null}
          </div>
        ))}
      </div>
    );

    return (
      <CustomSiteLocationsProvider {...customSiteProviderProps}>
      <ProjectInspectionSubmissionsProvider submissions={projectInspectionSubmissions}>
      <>
        <div style={{ padding: "var(--card-padding) var(--page-padding-x)" }}>
          {unitBuildingSummary("0 0 var(--inline-gap)")}
          {customSiteSection}
          {cards.length === 0 && unitsInitialLoadSettled ? (
            <LocationsEmptyState projectId={projectId} canViewUpm={canViewUpm} variant="zero" />
          ) : filteredCards.length === 0 ? (
            <LocationsEmptyState projectId={projectId} canViewUpm={canViewUpm} variant="filtered" />
          ) : (
            locationGroups.map((g, gIdx) => {
              const buildingStripe = buildingStripeForKey(
                g.buildingKey === "__flat" ? MISSING_LOCATION_LABEL : g.buildingKey,
                buildingKeysOrder
              );
              const showBuildingHeader = effectiveGroupByLocation && g.buildingKey !== "__flat";
              const isOnlyBuilding = locationGroups.length === 1;
              const buildingUnitCount = g.levelSections.reduce((n, s) => n + s.cards.length, 0);
              const buildingLevelKeys = levelSectionKeysForBuilding(g);
            const allLevelsExpandedInBuilding =
              buildingLevelKeys.length > 0 && buildingLevelKeys.every((k) => expandedLevelSections.has(k));
            const buildingCards = g.levelSections.flatMap((s) => s.cards);
            const buildingMetaSuffix = metaSuffixForCards(buildingCards);
            return (
              <div key={g.buildingKey}>
                {gIdx > 0 && effectiveGroupByLocation && (
                  <hr style={{ border: "none", borderTop: "1px solid var(--neutral-200)", margin: "16px 0" }} />
                )}
                {showBuildingHeader && buildingLevelKeys.length > 0 && (
                  <BuildingGroupHeaderRow
                    buildingKey={g.buildingKey}
                    buildingUnitCount={buildingUnitCount}
                    buildingStripe={buildingStripe}
                    density="grid"
                    allLevelsExpanded={allLevelsExpandedInBuilding}
                    onToggleAllLevels={() => toggleExpandAllLevelsForGroup(g)}
                    onAddLocationEntry={(mode) => setLocationModalState({ building: g.buildingKey, mode })}
                    locationMetaSuffix={buildingMetaSuffix || undefined}
                  />
                )}
                  {g.buildingKey !== "__flat" && (
                    <BuildingCustomSiteLocationsStrip
                      buildingKey={g.buildingKey}
                      buildingStripe={buildingStripe}
                    />
                  )}
                  {g.levelSections.map((section, sectionIdx) => {
                    const sectionKey = `${g.buildingKey}::${section.levelKey}`;
                    const contentId = levelSectionContentDomId(sectionKey);
                    const levelUnitsExpanded =
                      section.levelKey === "__all" || forceExpandAllLevels || expandedLevelSections.has(sectionKey);
                    const allUnitsInLevelExpanded =
                      section.cards.length > 0 && section.cards.every((c) => expandedKeys.has(c.key));
                    const levelCardKeys = section.cards.map((c) => c.key);
                    const allInLevelSelected = isSelectMode && levelCardKeys.length > 0 && levelCardKeys.every((k) => selectedKeys?.has(k));
                    const someInLevelSelected = isSelectMode && !allInLevelSelected && levelCardKeys.some((k) => selectedKeys?.has(k));

                    // Partition cards within this level section into units and common areas
                    const sectionUnitCards = section.cards.filter((c) => !isCommonAreaCard(c));
                    const sectionCommonAreaCards = section.cards.filter((c) => isCommonAreaCard(c));
                    const showLevelFooter = effectiveGroupByLocation && section.levelKey !== "__all" && g.buildingKey !== "__flat";

                    // Aggregate install-complete percent across all units in this level
                    const levelPct = section.cards.length === 0 ? 0 : Math.round(
                      section.cards.reduce((sum, c) => sum + unitInstallCompletePercent(c.scopes), 0) / section.cards.length
                    );
                    const levelSubPct = section.cards.length === 0 ? 0 : Math.round(
                      section.cards.reduce((sum, c) => sum + unitQtyInstallSubPercent(c.scopes), 0) / section.cards.length
                    );
                    const levelScopeStats = computeLevelScopeStats(section.cards);

                    return (
                      <div key={sectionKey} style={{ marginBottom: 6 }}>
                        {effectiveGroupByLocation && section.levelKey !== "__all" && (
                          <LevelSectionBar
                            levelKey={section.levelKey}
                            unitCount={section.cards.length}
                            levelPct={levelPct}
                            levelSubPct={levelSubPct}
                            isFirstInBuilding={sectionIdx === 0}
                            contentId={contentId}
                            unitsExpanded={levelUnitsExpanded}
                            buildingStripe={buildingStripe}
                            allUnitsInLevelExpanded={allUnitsInLevelExpanded}
                            showExpandAllUnits={false}
                            buildingKey={showBuildingHeader && !isOnlyBuilding ? g.buildingKey : undefined}
                            stickyTop={0}
                            isSelectMode={isSelectMode}
                            allInLevelSelected={allInLevelSelected}
                            someInLevelSelected={someInLevelSelected}
                            onLevelSelectAll={onSelectLevelKeys ? () => onSelectLevelKeys(levelCardKeys, !allInLevelSelected) : undefined}
                            onToggleLevel={() => toggleLevelSectionVisibility(sectionKey)}
                            onToggleExpandAllUnits={() =>
                              toggleExpandAllUnitsInSection(section.cards.map((c) => c.key))
                            }
                          />
                        )}
                        {levelUnitsExpanded && (
                          <div
                            id={section.levelKey === "__all" ? undefined : contentId}
                            role={effectiveGroupByLocation && section.levelKey !== "__all" ? "region" : undefined}
                            aria-labelledby={effectiveGroupByLocation && section.levelKey !== "__all" ? `${contentId}-label` : undefined}
                          >
                            <LevelLocationSections
                              buildingKey={g.buildingKey}
                              levelKey={section.levelKey}
                              commonAreaCards={sectionCommonAreaCards}
                              unitCards={sectionUnitCards}
                              allCards={section.cards}
                              scopeStats={levelScopeStats}
                              renderCardGrid={renderCardGrid}
                            />
                            {showLevelFooter && (
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--neutral-150)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() => setLocationModalState({ building: g.buildingKey, level: section.levelKey, mode: "issue" })}
                                  style={{ background: "none", border: "none", padding: "2px 0", color: "var(--error-500)", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.8 }}
                                >
                                  <AlertCircle size={12} style={{ flexShrink: 0 }} />
                                  + Level Issue
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setLocationModalState({ building: g.buildingKey, level: section.levelKey, mode: "obs" })}
                                  style={{ background: "none", border: "none", padding: "2px 0", color: "var(--primary-500)", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.8 }}
                                >
                                  <Eye size={12} style={{ flexShrink: 0 }} />
                                  + Level Observation
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes unit-highlight-pulse {
            0%   { background-color: var(--primary-100); border-color: var(--primary-400); }
            60%  { background-color: var(--primary-50);  border-color: var(--primary-300); }
            100% { background-color: transparent;        border-color: var(--neutral-200); }
          }
          .units-grid-squares {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 6px;
            margin-bottom: 8px;
            align-items: start;
          }
          @media (min-width: 640px) {
            .units-grid-squares {
              grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
            }
          }
        `}</style>
        {loadingRowsToast}
        {infiniteScrollSentinel}
        {locationModalState?.mode === "issue" && (
          <AddLocationIssueModal
            projectId={projectId}
            building={locationModalState.building}
            level={locationModalState.level}
            onClose={() => setLocationModalState(null)}
            onCreated={() => setLocationModalState(null)}
          />
        )}
        {locationModalState?.mode === "obs" && (
          <AddLocationObservationModal
            projectId={projectId}
            currentUserId={currentUserId}
            building={locationModalState.building}
            level={locationModalState.level}
            onClose={() => setLocationModalState(null)}
            onCreated={() => setLocationModalState(null)}
          />
        )}
      </>
      </ProjectInspectionSubmissionsProvider>
      </CustomSiteLocationsProvider>
    );
  }

  // List view — desktop table rows
  return (
    <CustomSiteLocationsProvider {...customSiteProviderProps}>
    <ProjectInspectionSubmissionsProvider submissions={projectInspectionSubmissions}>
    <>
      <div style={{ padding: "0 var(--page-padding-x) var(--card-padding)" }}>
        {unitBuildingSummary("var(--inline-gap) 0")}
        {customSiteSection}

        {cards.length === 0 ? (
          <LocationsEmptyState projectId={projectId} canViewUpm={canViewUpm} variant="zero" />
        ) : filteredCards.length === 0 ? (
          <LocationsEmptyState projectId={projectId} canViewUpm={canViewUpm} variant="filtered" />
        ) : (
          locationGroups.map((g, gIdx) => {
            const buildingStripe = buildingStripeForKey(
              g.buildingKey === "__flat" ? MISSING_LOCATION_LABEL : g.buildingKey,
              buildingKeysOrder
            );
            const showBuildingHeader = effectiveGroupByLocation && g.buildingKey !== "__flat";
            const isOnlyBuilding = locationGroups.length === 1;
            const buildingUnitCount = g.levelSections.reduce((n, s) => n + s.cards.length, 0);
            const buildingLevelKeys = levelSectionKeysForBuilding(g);
            const allLevelsExpandedInBuilding =
              buildingLevelKeys.length > 0 && buildingLevelKeys.every((k) => expandedLevelSections.has(k));
            const buildingCards = g.levelSections.flatMap((s) => s.cards);
            const buildingMetaSuffix = metaSuffixForCards(buildingCards);
            return (
              <div key={g.buildingKey} style={{ marginBottom: effectiveGroupByLocation ? 12 : "var(--component-gap)" }}>
                {gIdx > 0 && effectiveGroupByLocation && (
                  <hr style={{ border: "none", borderTop: "1px solid var(--neutral-200)", margin: "16px 0" }} />
                )}
                {showBuildingHeader && buildingLevelKeys.length > 0 && (
                  <BuildingGroupHeaderRow
                    buildingKey={g.buildingKey}
                    buildingUnitCount={buildingUnitCount}
                    buildingStripe={buildingStripe}
                    density="list"
                    allLevelsExpanded={allLevelsExpandedInBuilding}
                    onToggleAllLevels={() => toggleExpandAllLevelsForGroup(g)}
                    onAddLocationEntry={(mode) => setLocationModalState({ building: g.buildingKey, mode })}
                    locationMetaSuffix={buildingMetaSuffix || undefined}
                  />
                )}
                {g.buildingKey !== "__flat" && (
                  <BuildingCustomSiteLocationsStrip
                    buildingKey={g.buildingKey}
                    buildingStripe={buildingStripe}
                  />
                )}
                {g.levelSections.map((section, sectionIdx) => {
                  const sectionKey = `${g.buildingKey}::${section.levelKey}`;
                  const contentId = levelSectionContentDomId(sectionKey);
                  const levelUnitsExpanded =
                    section.levelKey === "__all" || forceExpandAllLevels || expandedLevelSections.has(sectionKey);
                  const allUnitsInLevelExpanded =
                    section.cards.length > 0 && section.cards.every((c) => expandedKeys.has(c.key));
                  const levelCardKeys = section.cards.map((c) => c.key);
                  const allInLevelSelected = isSelectMode && levelCardKeys.length > 0 && levelCardKeys.every((k) => selectedKeys?.has(k));
                  const someInLevelSelected = isSelectMode && !allInLevelSelected && levelCardKeys.some((k) => selectedKeys?.has(k));
                  const showLevelFooter = effectiveGroupByLocation && section.levelKey !== "__all" && g.buildingKey !== "__flat";
                  const levelPct = section.cards.length === 0 ? 0 : Math.round(
                    section.cards.reduce((sum, c) => sum + unitInstallCompletePercent(c.scopes), 0) / section.cards.length
                  );
                  const levelSubPct = section.cards.length === 0 ? 0 : Math.round(
                    section.cards.reduce((sum, c) => sum + unitQtyInstallSubPercent(c.scopes), 0) / section.cards.length
                  );
                  const levelScopeStats = computeLevelScopeStats(section.cards);
                  return (
                    <div key={sectionKey} style={{ marginBottom: effectiveGroupByLocation ? 8 : 0 }}>
                      {effectiveGroupByLocation && section.levelKey !== "__all" && (
                        <LevelSectionBar
                          levelKey={section.levelKey}
                          unitCount={section.cards.length}
                          levelPct={levelPct}
                          levelSubPct={levelSubPct}
                          isFirstInBuilding={sectionIdx === 0}
                          contentId={contentId}
                          unitsExpanded={levelUnitsExpanded}
                          buildingStripe={buildingStripe}
                          allUnitsInLevelExpanded={allUnitsInLevelExpanded}
                          showExpandAllUnits={showLevelExpandAllUnits}
                          buildingKey={showBuildingHeader && !isOnlyBuilding ? g.buildingKey : undefined}
                          stickyTop={0}
                          isSelectMode={isSelectMode}
                          allInLevelSelected={allInLevelSelected}
                          someInLevelSelected={someInLevelSelected}
                          onLevelSelectAll={onSelectLevelKeys ? () => onSelectLevelKeys(levelCardKeys, !allInLevelSelected) : undefined}
                          onToggleLevel={() => toggleLevelSectionVisibility(sectionKey)}
                          onToggleExpandAllUnits={() =>
                            toggleExpandAllUnitsInSection(section.cards.map((c) => c.key))
                          }
                        />
                      )}
                      {levelUnitsExpanded && (
                        <div
                          id={section.levelKey === "__all" ? undefined : contentId}
                          role={effectiveGroupByLocation && section.levelKey !== "__all" ? "region" : undefined}
                          aria-labelledby={effectiveGroupByLocation && section.levelKey !== "__all" ? `${contentId}-label` : undefined}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: isMobileList ? 12 : "var(--inline-gap)",
                          }}
                        >
                          <LevelScopeBreakdownPanel scopeStats={levelScopeStats} />
                          <LevelCustomSiteLocationsStrip
                            buildingKey={g.buildingKey}
                            levelKey={section.levelKey}
                          />
                          {section.cards.map((card) => {
                            const cardIdx = visuallyOrderedCards.findIndex((c) => c.key === card.key);
                            const prevCard = cardIdx > 0 ? visuallyOrderedCards[cardIdx - 1] : undefined;
                            const nextCard = cardIdx < visuallyOrderedCards.length - 1 ? visuallyOrderedCards[cardIdx + 1] : undefined;
                            return (
                              <UnitRow
                                key={card.key}
                                card={card}
                                projectId={projectId}
                                showBuildingInLocationLine={showBuildingInLocationLine}
                                useMobileCard={isMobileList}
                                useMobileDetailModal={useMobileDetailModal}
                                expanded={expandedKeys.has(card.key)}
                                onToggle={() => toggleExpand(card.key)}
                                onSaved={handleSaved}
                                onInstanceSaved={handleInstanceSaved}
                                onIssueMetaUpdated={handleIssueMetaUpdated}
                                buildingStripe={buildingStripeForKey(card.building || MISSING_LOCATION_LABEL, buildingKeysOrder)}
                                canManageStatus={canManageStatus}
                                canCalibrate={canCalibrate}
                                canViewLocationTracking={canViewLocationTracking}
                                currentUserId={currentUserId}
                                currentUserRole={currentUserRole}
                                unitIndex={cardIdx + 1}
                                unitTotal={visuallyOrderedCards.length}
                                onPrev={prevCard ? () => navigateToUnit(card.key, prevCard.key) : undefined}
                                onNext={nextCard ? () => navigateToUnit(card.key, nextCard.key) : undefined}
                                onRefreshAll={onRefreshAll}
                              />
                            );
                          })}
                          {showLevelFooter && (
                            <div style={{ paddingTop: 8, borderTop: "1px solid var(--neutral-150)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                onClick={() => setLocationModalState({ building: g.buildingKey, level: section.levelKey, mode: "issue" })}
                                style={{ background: "none", border: "none", padding: "2px 0", color: "var(--error-500)", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.8 }}
                              >
                                <AlertCircle size={12} style={{ flexShrink: 0 }} />
                                + Level Issue
                              </button>
                              <button
                                type="button"
                                onClick={() => setLocationModalState({ building: g.buildingKey, level: section.levelKey, mode: "obs" })}
                                style={{ background: "none", border: "none", padding: "2px 0", color: "var(--primary-500)", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, opacity: 0.8 }}
                              >
                                <Eye size={12} style={{ flexShrink: 0 }} />
                                + Level Observation
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
      {loadingRowsToast}
      {infiniteScrollSentinel}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {locationModalState?.mode === "issue" && (
        <AddLocationIssueModal
          projectId={projectId}
          building={locationModalState.building}
          level={locationModalState.level}
          onClose={() => setLocationModalState(null)}
          onCreated={() => setLocationModalState(null)}
        />
      )}
      {locationModalState?.mode === "obs" && (
        <AddLocationObservationModal
          projectId={projectId}
          currentUserId={currentUserId}
          building={locationModalState.building}
          level={locationModalState.level}
          onClose={() => setLocationModalState(null)}
          onCreated={() => setLocationModalState(null)}
        />
      )}
    </>
    </ProjectInspectionSubmissionsProvider>
    </CustomSiteLocationsProvider>
  );
}

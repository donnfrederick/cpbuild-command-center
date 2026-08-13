"use client";

import { useEffect, useId, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, AlignLeft, ArrowLeft, Camera, Check, ChevronDown, ChevronRight, Images, Loader2, Mic, Pencil, Trash2, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useUnitsTranslator } from "@/lib/units-i18n";
import { toast } from "sonner";
import { CameraCapture } from "@/components/projects/CameraCapture";
import type { CapturedFile } from "@/components/projects/CameraCapture";
import { ImageAnnotationEditor, isFlattenAnnotationSave, type AnnotationSaveResult } from "@/components/projects/ImageAnnotationEditor";
import { resolveClientMime, isFieldMediaImageFile } from "@/lib/image-utils";
import { processLibraryMediaFile, toastImagePrepareFailure } from "@/lib/stage-library-field-media";
import { uploadWithRetry } from "@/lib/upload-with-retry";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { appendTranscriptSegment } from "@/lib/browser-speech";
import {
  resolveIssueTypeLabel,
  resolvePartyLabel,
  useIssueCatalog,
} from "@/lib/issues/use-issue-catalog";
import { useObservationCatalog, resolveObservationTypeLabel } from "@/lib/observations/use-observation-catalog";
import { DictationButton } from "@/components/ui/DictationButton";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";
import { useFileDrop } from "@/hooks/use-file-drop";
import type { BulkStatusUndoPayload } from "@/lib/bulk-status-undo-client";
import { computeBulkScopeTypeGroups } from "@/lib/bulk-scope-type-groups";
import type { SubItem } from "@/components/projects/SubcontractorPicker";
import { readRecentSubs, writeRecentSub } from "@/components/projects/SubcontractorPicker";
import { unitKeysForBulkInstallerUpdate } from "@/lib/bulk-installer-complete";
import { enrichBodyWithActivityLocation } from "@/lib/activity/enrich-body-with-activity-location";

const FIELD_MEDIA_ACCEPT = "image/*,image/heic,image/heif,video/*,audio/*";

// ── Sheet animation CSS ────────────────────────────────────────────────────────
// Mobile: slides from the bottom (tall — ≥65 vh so future actions are visible).
// Desktop (≥768px): slides from the right, full height.

const SHEET_CSS = `
  .bas-backdrop { position: fixed; inset: 0; z-index: 500; display: flex; align-items: flex-end; justify-content: center; background: rgba(0,0,0,0); transition: background-color 0.26s ease; }
  .bas-backdrop.bas-visible { background: rgba(0,0,0,0.45); }
  .bas-sheet { width: 100%; max-width: 520px; min-height: 65vh; max-height: 92vh; background: var(--neutral-0); border-radius: 16px 16px 0 0; box-shadow: 0 -4px 32px rgba(0,0,0,0.16); overflow: hidden; display: flex; flex-direction: column; transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); }
  .bas-sheet.bas-visible { transform: translateY(0); }
  .bas-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 4px; flex-shrink: 0; }
  .bas-body { flex: 1; overflow-y: auto; }
  @media (min-width: 768px) {
    .bas-backdrop { align-items: stretch; justify-content: flex-end; pointer-events: none; }
    .bas-sheet { width: min(420px, 100vw); max-width: none; min-height: unset; max-height: unset; height: 100%; border-radius: 0; transform: translateX(105%); box-shadow: -4px 0 32px rgba(0,0,0,0.16); pointer-events: all; }
    .bas-sheet.bas-visible { transform: translateX(0); }
    .bas-handle { display: none; }
  }
`;

// ── Media types (bulk issue attachments) ──────────────────────────────────────

const VIDEO_SIZE_LIMIT_BULK = 50 * 1024 * 1024; // 50 MB

interface StagedBulkMedia {
  clientId: string; file: File; localUrl: string; mimeType: string; caption: string;
}
interface UploadedBulkMedia {
  clientId: string; storageKey: string; storageUrl: string; mimeType: string;
  fileSizeBytes: number; localUrl: string; fileName: string; caption: string;
}
export type BulkMediaItem = ({ kind: "staged" } & StagedBulkMedia) | ({ kind: "uploaded" } & UploadedBulkMedia);

// ── Types ──────────────────────────────────────────────────────────────────────

type ScopeStage = "STAGING" | "ASSEMBLY" | "INSTALL";
type ScopeStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "PENDING_VERIFICATION" | "COMPLETE" | null;
type InspectionStatus = "READY" | "PASSED" | "FAILED" | null;

/** Values to restore on bulk-status undo (captured before apply). */
export interface BulkStatusRevertSnapshot {
  scopeStage: ScopeStage | null;
  scopeStatus: ScopeStatus;
  inspectionStatus: InspectionStatus;
}

export interface ScopedRow {
  id: string;
  /** Unit card key — used to count unique units affected by the bulk action. */
  unitKey: string;
  /** "${building}|${level}|${unit}" — stored on ProjectIssue/Observation.unitRef */
  unitRef: string;
  stage: ScopeStage | null;
  scopeStatus: ScopeStatus;
  inspectionStatus: InspectionStatus;
  scopeTypeName: string | null;
  scopeTypeId: string | null;
  /** Canonical scope type ID — when set, rows with different raw scopeTypeIds but the same
   * canonical ID (e.g. CABIU + Cabinetry → CAB) are grouped into one filter option. */
  canonicalScopeTypeId?: string | null;
  canonicalDisplayName?: string | null;
  /** Sub-scope instances within this row (empty when no sub-scopes). */
  subScopes: Array<{
    id: string;
    name: string;
    scopeStage: ScopeStage | null;
    scopeStatus: ScopeStatus;
    inspectionStatus: InspectionStatus;
  }>;
}

interface BulkStatusOption {
  key: string;
  label: string;
  /** When undefined, the row's existing stage is preserved. */
  stageSend: ScopeStage | null | undefined;
  status: ScopeStatus;
  dotColor: string;
  bg: string;
  borderColor: string;
}

type Phase = "list" | "confirming" | "loading" | "inspectionConfirm" | "inspectionLoading" | "reportForm" | "reportConfirm" | "reportLoading" | "subcontractorPick" | "subcontractorLoading";

interface BulkInspectionOption {
  key: string;
  label: string;
  /** The value sent to the API as a Procore clear-inspection outcome. */
  value: InspectionStatus;
  dotColor: string;
  bg: string;
  borderColor: string;
}
type ReportType = "issue" | "observation";

// ── Report form state types ────────────────────────────────────────────────────

interface IssueFormState {
  shortDescription: string;
  issueType: string;
  responsibleParties: string[];
  isBlockingWork: boolean;
  notes: string;
}

interface ObsFormState {
  title: string;
  description: string;
  observationType: string;
}

const EMPTY_ISSUE_FORM: IssueFormState = {
  shortDescription: "", issueType: "", responsibleParties: [], isBlockingWork: false, notes: "",
};
const EMPTY_OBS_FORM: ObsFormState = {
  title: "", description: "", observationType: "",
};

// ── Status options (matches individual scope picker workflow) ──────────────────

const BULK_STATUS_OPTIONS: BulkStatusOption[] = [
  {
    key: "not_started",
    label: "Not Started",
    stageSend: null,
    status: "NOT_STARTED",
    dotColor: "var(--neutral-400)",
    bg: "var(--neutral-100)",
    borderColor: "var(--neutral-300)",
  },
  {
    key: "in_staging",
    label: "In Staging",
    stageSend: "STAGING",
    status: "IN_PROGRESS",
    dotColor: "var(--scope-tile-staging-fg)",
    bg: "var(--scope-tile-staging-bg)",
    borderColor: "var(--scope-tile-staging-fg)",
  },
  {
    key: "in_assembly",
    label: "In Assembly",
    stageSend: "ASSEMBLY",
    status: "IN_PROGRESS",
    dotColor: "var(--scope-tile-assembly-fg)",
    bg: "var(--scope-tile-assembly-bg)",
    borderColor: "var(--scope-tile-assembly-fg)",
  },
  {
    key: "install_progress",
    label: "Install: In Progress",
    stageSend: "INSTALL",
    status: "IN_PROGRESS",
    dotColor: "var(--warning-700)",
    bg: "var(--warning-100)",
    borderColor: "#fdba74",
  },
  {
    key: "install_complete_sub",
    label: "Install Complete-Unverified",
    stageSend: "INSTALL",
    status: "PENDING_VERIFICATION",
    dotColor: "var(--success-500)",
    bg: "var(--success-50)",
    borderColor: "var(--success-400)",
  },
  {
    key: "install_complete",
    label: "Install Complete-Verified",
    stageSend: "INSTALL",
    status: "COMPLETE",
    dotColor: "var(--success-700)",
    bg: "var(--success-100)",
    borderColor: "var(--success-500)",
  },
];

/** Scope rows + sub-scope instances per request — keeps requests small enough for timeouts and shows progress between chunks. */
const BULK_STATUS_CHUNK_SIZE = 50;

function chunkBulkStatusPayload(
  rowIds: string[],
  subScopeInstanceIds: string[],
  chunkSize: number
): Array<{ rowIds: string[]; subScopeInstanceIds: string[] }> {
  const chunks: Array<{ rowIds: string[]; subScopeInstanceIds: string[] }> = [];
  let ri = 0;
  let si = 0;
  while (ri < rowIds.length || si < subScopeInstanceIds.length) {
    const rowBatch: string[] = [];
    const subBatch: string[] = [];
    while (rowBatch.length + subBatch.length < chunkSize && ri < rowIds.length) {
      rowBatch.push(rowIds[ri++]);
    }
    while (rowBatch.length + subBatch.length < chunkSize && si < subScopeInstanceIds.length) {
      subBatch.push(subScopeInstanceIds[si++]);
    }
    chunks.push({ rowIds: rowBatch, subScopeInstanceIds: subBatch });
  }
  return chunks;
}

function buildBulkStatusSnapshotMaps(
  filteredScopeRows: ScopedRow[],
  targetSubScopeMap: Map<string, Set<string>>
): {
  rowSnap: Map<string, BulkStatusRevertSnapshot>;
  instSnap: Map<string, BulkStatusRevertSnapshot>;
} {
  const rowSnap = new Map<string, BulkStatusRevertSnapshot>();
  const instSnap = new Map<string, BulkStatusRevertSnapshot>();
  for (const row of filteredScopeRows) {
    if (row.subScopes.length === 0) {
      rowSnap.set(row.id, {
        scopeStage: row.stage ?? null,
        scopeStatus: row.scopeStatus,
        inspectionStatus: row.inspectionStatus ?? null,
      });
    } else {
      const groupKey = row.canonicalScopeTypeId ?? row.scopeTypeId ?? "";
      const selectedSubNames = targetSubScopeMap.get(groupKey) ?? new Set<string>();
      for (const sub of row.subScopes) {
        if (selectedSubNames.has(sub.name)) {
          instSnap.set(sub.id, {
            scopeStage: sub.scopeStage ?? null,
            scopeStatus: sub.scopeStatus,
            inspectionStatus: sub.inspectionStatus ?? null,
          });
        }
      }
    }
  }
  return { rowSnap, instSnap };
}

function revertPayloadFromApplied(
  appliedRowIds: string[],
  appliedSubScopeInstanceIds: string[],
  rowSnap: Map<string, BulkStatusRevertSnapshot>,
  instSnap: Map<string, BulkStatusRevertSnapshot>
): {
  revertRows: Array<{ id: string } & BulkStatusRevertSnapshot>;
  revertInstances: Array<{ id: string } & BulkStatusRevertSnapshot>;
} {
  const revertRows = appliedRowIds
    .map((id) => {
      const snap = rowSnap.get(id);
      return snap ? { id, ...snap } : null;
    })
    .filter((x): x is { id: string } & BulkStatusRevertSnapshot => x !== null);
  const revertInstances = appliedSubScopeInstanceIds
    .map((id) => {
      const snap = instSnap.get(id);
      return snap ? { id, ...snap } : null;
    })
    .filter((x): x is { id: string } & BulkStatusRevertSnapshot => x !== null);
  return { revertRows, revertInstances };
}

function getUnitKeysFromApplied(
  appliedRowIds: string[],
  appliedSubScopeInstanceIds: string[],
  filteredScopeRows: ScopedRow[]
): string[] {
  const rowSet = new Set(appliedRowIds);
  const subSet = new Set(appliedSubScopeInstanceIds);
  const keys = new Set<string>();
  for (const row of filteredScopeRows) {
    if (row.subScopes.length === 0) {
      if (rowSet.has(row.id)) keys.add(row.unitKey);
    } else if (row.subScopes.some((s) => subSet.has(s.id))) {
      keys.add(row.unitKey);
    }
  }
  return Array.from(keys);
}

function statusUndoMeta(
  payload: {
    revertRows: Array<{ id: string } & BulkStatusRevertSnapshot>;
    revertInstances: Array<{ id: string } & BulkStatusRevertSnapshot>;
  }
): BulkStatusUndoPayload | null {
  if (payload.revertRows.length + payload.revertInstances.length === 0) return null;
  return payload as BulkStatusUndoPayload;
}

interface BulkStatusApiResponse {
  updated: number;
  skipped: number;
  appliedRowIds: string[];
  appliedSubScopeInstanceIds: string[];
  blockedByBlockingIssue?: string[];
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface BulkActionsSheetProps {
  open: boolean;
  onClose: () => void;
  /** Number of currently-visible selected units (for display). */
  selectedUnitCount: number;
  /** All scope rows (id + stage) within the selected units. */
  scopeRows: ScopedRow[];
  projectId: string;
  /** Current user ID — used to scope recent subcontractor picks per user in localStorage. */
  userId?: string;
  /** Called after a successful bulk update so the parent can refresh data. */
  onSuccess: () => void;
  /**
   * Called after a bulk action that should show the post-bulk banner (units filter).
   * For bulk status updates, `statusUndoPayload` restores prior scope state from the banner.
   */
  onBulkComplete?: (
    affectedUnitKeys: string[],
    meta: {
      actionLabel: string;
      statusUndoPayload?: BulkStatusUndoPayload | null;
      /** Parent rows + sub-scope instances updated (for banner/toast vs unit count). */
      scopesAffected?: number;
    }
  ) => void;
}

// ── Scope target selector ──────────────────────────────────────────────────────

interface ScopeTypeInfo {
  name: string;
  /** The canonical scope type ID when available; otherwise the raw scopeTypeId of the first row
   * in the group. Used as the stable key for filter selections. */
  id: string;
  /** Distinct units in the selection that have at least one row of this scope type. */
  rowCount: number;
  /** All raw scopeTypeIds that belong to this group (may be >1 when canonical groups variants). */
  rawScopeTypeIds: string[];
  /** Unique sub-scope names across all rows of this scope type in the selection. */
  subScopeNames: string[];
  hasSubScopes: boolean;
}

function CheckboxIcon({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 15, height: 15, borderRadius: 3, flexShrink: 0,
        border: `1.5px solid ${checked ? "var(--primary-500)" : "var(--neutral-400)"}`,
        backgroundColor: checked ? "var(--primary-500)" : "transparent",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/**
 * Shows every scope type present across the selected units as checkboxes.
 * Beneath each checked type that has sub-scopes, the individual sub-scope names
 * are shown as selectable chips — the user can target all or specific sub-scopes.
 */
function ScopeTargetSelector({
  scopeTypes,
  targetTypeIds,
  targetSubScopeMap,
  onToggle,
  onToggleSubScope,
  totalRows,
  filteredRows,
}: {
  scopeTypes: ScopeTypeInfo[];
  targetTypeIds: Set<string>;
  targetSubScopeMap: Map<string, Set<string>>;
  onToggle: (id: string) => void;
  onToggleSubScope: (scopeTypeId: string, subScopeName: string) => void;
  totalRows: number;
  filteredRows: number;
}) {
  if (scopeTypes.length <= 1) return null;

  return (
    <div
      style={{
        margin: "8px 12px 4px",
        border: "1px solid var(--neutral-200)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px 8px",
          backgroundColor: "var(--neutral-50)",
          borderBottom: "1px solid var(--neutral-200)",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--neutral-700)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Relevant Scopes
        </span>
        <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>
          {filteredRows} of {totalRows} scope{totalRows !== 1 ? "s" : ""}
        </span>
      </div>

      {/* One row per scope type */}
      {scopeTypes.map((st, i) => {
        const checked = targetTypeIds.has(st.id);
        const isLast = targetTypeIds.size === 1 && checked;
        const isLastRow = i === scopeTypes.length - 1;
        const selectedSubScopes = targetSubScopeMap.get(st.id) ?? new Set<string>();

        return (
          <div key={st.id} style={{ backgroundColor: "var(--neutral-0)" }}>
            {/* Scope type row */}
            <button
              type="button"
              disabled={isLast}
              onClick={() => onToggle(st.id)}
              aria-pressed={checked}
              style={{
                width: "100%",
                display: "flex", alignItems: "center", gap: 10,
                padding: "11px 14px",
                background: checked ? "var(--primary-50)" : "var(--neutral-0)",
                border: "none",
                borderTop: i === 0 ? "none" : "1px solid var(--neutral-100)",
                cursor: isLast ? "not-allowed" : "pointer",
                textAlign: "left",
                transition: "background-color 0.12s",
                opacity: isLast ? 0.55 : 1,
              }}
            >
              <CheckboxIcon checked={checked} />
              <span style={{
                flex: 1, fontSize: 14,
                fontWeight: checked ? 600 : 400,
                color: checked ? "var(--primary-700)" : "var(--neutral-700)",
              }}>
                {st.name}
              </span>
              {/* Unit count */}
              <span style={{
                fontSize: 11, fontWeight: 500,
                backgroundColor: checked ? "var(--primary-100)" : "var(--neutral-100)",
                color: checked ? "var(--primary-700)" : "var(--neutral-500)",
                borderRadius: 10, padding: "2px 7px",
              }}>
                {st.rowCount} unit{st.rowCount !== 1 ? "s" : ""}
              </span>
              {st.hasSubScopes && (
                <span style={{ fontSize: 11, color: "var(--neutral-400)" }} title="Has sub-scopes">◉</span>
              )}
            </button>

            {/* Sub-scope expansion — selectable chips for checked types with sub-scopes */}
            {checked && st.hasSubScopes && (
              <div
                style={{
                  padding: "8px 14px 10px 38px",
                  backgroundColor: "var(--primary-50)",
                  borderTop: "1px solid var(--primary-100)",
                  borderBottom: isLastRow ? "none" : "1px solid var(--neutral-100)",
                }}
              >
                <p style={{ margin: "0 0 7px", fontSize: 11, color: "var(--primary-700)", fontWeight: 600 }}>
                  Sub-scopes — tap to include/exclude:
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {st.subScopeNames.map((sub) => {
                    const subChecked = selectedSubScopes.has(sub);
                    const isLastSub = selectedSubScopes.size === 1 && subChecked;
                    return (
                      <button
                        key={sub}
                        type="button"
                        disabled={isLastSub}
                        onClick={() => onToggleSubScope(st.id, sub)}
                        aria-pressed={subChecked}
                        style={{
                          fontSize: 12, padding: "4px 10px",
                          borderRadius: 10,
                          backgroundColor: subChecked ? "var(--primary-600, var(--primary-700))" : "transparent",
                          color: subChecked ? "var(--neutral-0)" : "var(--primary-700)",
                          border: `1.5px solid ${subChecked ? "var(--primary-600, var(--primary-700))" : "var(--primary-300)"}`,
                          cursor: isLastSub ? "not-allowed" : "pointer",
                          fontWeight: subChecked ? 600 : 400,
                          opacity: isLastSub ? 0.6 : 1,
                          transition: "background-color 0.12s, border-color 0.12s, color 0.12s",
                        }}
                      >
                        {sub}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Bulk status progress (centered overlay above sheet) ───────────────────────

function BulkStatusProgressOverlay({
  progress,
  stopping,
  onStop,
}: {
  progress: { current: number; total: number };
  stopping: boolean;
  onStop: () => void;
}) {
  const tOverlay = useUnitsTranslator();

  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-label={
        stopping
          ? tOverlay("bulkActionStopping")
          : tOverlay("bulkActionProgressPercent", { percent: pct })
      }
      aria-busy={stopping}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 560,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))",
        backgroundColor: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        pointerEvents: "auto",
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 340,
          borderRadius: 16,
          padding: "22px 20px 20px",
          backgroundColor: "var(--neutral-0)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.22)",
          border: "1px solid var(--neutral-200)",
        }}
      >
        <p
          style={{
            margin: "0 0 14px",
            fontSize: 15,
            fontWeight: 700,
            color: "var(--neutral-900)",
            textAlign: "center",
          }}
        >
          {stopping ? tOverlay("bulkActionStopping") : tOverlay("bulkActionApplying")}
        </p>
        <div
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: "var(--neutral-200)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              backgroundColor: "var(--primary-600, var(--primary-700))",
              transition: "width 0.2s ease-out",
            }}
          />
        </div>
        <p
          style={{
            margin: "12px 0 0",
            fontSize: 13,
            color: "var(--neutral-600)",
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          {tOverlay("bulkActionProgressPercent", { percent: pct })}
        </p>
        <button
          type="button"
          onClick={onStop}
          disabled={stopping}
          aria-busy={stopping}
          style={{
            display: "block",
            width: "100%",
            marginTop: 18,
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid var(--neutral-300)",
            backgroundColor: stopping ? "var(--neutral-100)" : "var(--neutral-50)",
            color: "var(--neutral-900)",
            fontSize: 14,
            fontWeight: 600,
            cursor: stopping ? "default" : "pointer",
          }}
        >
          {stopping ? tOverlay("bulkActionStoppingButton") : tOverlay("bulkActionCancelUpdate")}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ── Sub-views ──────────────────────────────────────────────────────────────────

function ListView({
  t,
  onStartUpdateStatus,
  onStartInspection,
  onStartIssue,
  onStartObservation,
  onStartSubcontractor,
}: {
  t: ReturnType<typeof useUnitsTranslator>;
  onStartUpdateStatus: () => void;
  onStartInspection: () => void;
  onStartIssue: () => void;
  onStartObservation: () => void;
  onStartSubcontractor: () => void;
}) {
  return (
    <div style={{ padding: "4px 0 calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
      {/* Update Status row — pushes to confirming view */}
      <button
        type="button"
        onClick={onStartUpdateStatus}
        style={{
          width: "100%", padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 12,
          background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            backgroundColor: "var(--primary-50)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="2" y="3" width="12" height="2.5" rx="1.25" fill="var(--primary-500)" />
            <rect x="2" y="7" width="8" height="2.5" rx="1.25" fill="var(--primary-400)" />
            <rect x="2" y="11" width="10" height="2.5" rx="1.25" fill="var(--primary-300)" />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--neutral-900)" }}>{t("bulkActionUpdateStatus")}</div>
          <div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 1 }}>Apply to all scopes, or select specific ones inside</div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--neutral-400)", flexShrink: 0 }} aria-hidden />
      </button>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: "var(--neutral-100)", margin: "0 20px" }} />

      {/* Report Issue action */}
      <button
        type="button"
        onClick={onStartIssue}
        style={{
          width: "100%", padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 12,
          background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            backgroundColor: "var(--error-50)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 2L14 13H2L8 2Z" fill="var(--error-500)" />
            <path d="M8 6V9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11.2" r="0.7" fill="white" />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--neutral-900)" }}>Report Issue</div>
          <div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 1 }}>Added individually to each selected unit</div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--neutral-400)", flexShrink: 0 }} aria-hidden />
      </button>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: "var(--neutral-100)", margin: "0 20px" }} />

      {/* Report Observation action */}
      <button
        type="button"
        onClick={onStartObservation}
        style={{
          width: "100%", padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 12,
          background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            backgroundColor: "var(--warning-50, #fffbeb)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="6" stroke="var(--warning-500, #f59e0b)" strokeWidth="1.5" />
            <path d="M8 5v3.5" stroke="var(--warning-500, #f59e0b)" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11" r="0.7" fill="var(--warning-500, #f59e0b)" />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--neutral-900)" }}>Add Observation</div>
          <div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 1 }}>Added individually to each selected unit</div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--neutral-400)", flexShrink: 0 }} aria-hidden />
      </button>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: "var(--neutral-100)", margin: "0 20px" }} />

      {/* Set Inspection Status action */}
      <button
        type="button"
        onClick={onStartInspection}
        style={{
          width: "100%", padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 12,
          background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            backgroundColor: "var(--success-50)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="3" y="1.5" width="10" height="13" rx="1.5" stroke="var(--success-600)" strokeWidth="1.4" />
            <path d="M5.5 8.5L7 10L10.5 6.5" stroke="var(--success-600)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.5 4H10.5" stroke="var(--success-600)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--neutral-900)" }}>{t("bulkActionSetInspection")}</div>
          <div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 1 }}>{t("bulkActionSetInspectionSubtitle")}</div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--neutral-400)", flexShrink: 0 }} aria-hidden />
      </button>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: "var(--neutral-100)", margin: "0 20px" }} />

      {/* Set Subcontractor action */}
      <button
        type="button"
        onClick={onStartSubcontractor}
        style={{
          width: "100%", padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 12,
          background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            backgroundColor: "var(--primary-50)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Users size={16} style={{ color: "var(--primary-600)" }} aria-hidden />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--neutral-900)" }}>Set Subcontractor</div>
          <div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 1 }}>Assign an installer to one scope type across selected units</div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--neutral-400)", flexShrink: 0 }} aria-hidden />
      </button>
    </div>
  );
}

/** Set Subcontractor view — pick one scope type, then pick one subcontractor. */
function SubcontractorPickView({
  scopeTypes,
  pickedScopeTypeId,
  onPickScopeType,
  subs,
  subsLoading,
  pickedSubId,
  onPickSub,
  affectedUnitCount,
  skippedUnitCount,
  loading,
  onConfirm,
  onBack,
  userId,
  projectId,
}: {
  scopeTypes: ScopeTypeInfo[];
  pickedScopeTypeId: string | null;
  onPickScopeType: (id: string) => void;
  subs: SubItem[];
  subsLoading: boolean;
  pickedSubId: string | null;
  onPickSub: (id: string) => void;
  affectedUnitCount: number;
  skippedUnitCount: number;
  loading: boolean;
  onConfirm: () => void;
  onBack: () => void;
  userId?: string;
  projectId: string;
}) {
  const t = useUnitsTranslator();
  const recentsLabelId = useId();
  const [subSearch, setSubSearch] = useState("");
  const canConfirm = pickedScopeTypeId !== null && pickedSubId !== null && affectedUnitCount > 0 && !loading;
  const filteredSubs = subSearch.trim()
    ? subs.filter((s) => s.name.toLowerCase().includes(subSearch.toLowerCase()))
    : subs;

  // Recents: cross-reference localStorage entries with the live subs list
  const recentEntries = subSearch.trim() ? [] : readRecentSubs(userId, projectId);
  const recentSubs: SubItem[] = recentEntries
    .map((r) => subs.find((s) => s.id === r.id))
    .filter((s): s is SubItem => s !== undefined);
  const recentIds = new Set(recentSubs.map((s) => s.id));
  const showRecents = !subSearch.trim() && recentSubs.length > 0;
  const mainSubs = showRecents ? filteredSubs.filter((s) => !recentIds.has(s.id)) : filteredSubs;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Back link */}
      <div style={{ padding: "8px 20px 4px" }}>
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "none", border: "none", cursor: loading ? "default" : "pointer",
            color: "var(--neutral-500)", fontSize: 13, fontWeight: 500, padding: "4px 0",
            opacity: loading ? 0.4 : 1,
          }}
        >
          <ArrowLeft size={14} aria-hidden />
          Back
        </button>
      </div>

      {/* Title */}
      <div style={{ padding: "4px 20px 12px", borderBottom: "1px solid var(--neutral-100)" }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--neutral-900)" }}>
          Set Subcontractor
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--neutral-500)" }}>
          Select a scope type, then choose the installer to assign.
          Units without the selected scope will be skipped.
        </p>
      </div>

      {/* Step 1: Scope type (radio — must pick exactly one) */}
      <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid var(--neutral-100)" }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          1 · Select scope type
        </p>
        {scopeTypes.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-400)" }}>No scope types in selection</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {scopeTypes.map((st) => {
              const active = pickedScopeTypeId === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onPickScopeType(st.id)}
                  disabled={loading}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 12px", borderRadius: 8, textAlign: "left",
                    border: `1.5px solid ${active ? "var(--primary-400)" : "var(--neutral-200)"}`,
                    backgroundColor: active ? "var(--primary-50)" : "var(--neutral-0)",
                    cursor: loading ? "default" : "pointer",
                    transition: "all 0.1s",
                  }}
                >
                  {/* Radio dot */}
                  <span
                    style={{
                      width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                      border: `2px solid ${active ? "var(--primary-500)" : "var(--neutral-300)"}`,
                      backgroundColor: active ? "var(--primary-500)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {active && <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#fff" }} />}
                  </span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: active ? 600 : 400, color: "var(--neutral-900)" }}>
                    {st.name}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--neutral-400)", flexShrink: 0 }}>
                    {st.rowCount} {st.rowCount === 1 ? "unit" : "units"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Step 2: Subcontractor (only shown once scope type is picked) */}
      {pickedScopeTypeId !== null && (
        <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid var(--neutral-100)" }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            2 · Select subcontractor
          </p>
          {subsLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", color: "var(--neutral-400)" }}>
              <Loader2 size={14} style={{ animation: "bas-spin 0.8s linear infinite" }} aria-hidden />
              <span style={{ fontSize: 13 }}>Loading subcontractors…</span>
            </div>
          ) : subs.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-400)" }}>No subcontractors found</p>
          ) : (
            <>
              {/* Search input */}
              <div style={{ position: "relative", marginBottom: 8 }}>
                <input
                  type="search"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  placeholder="Search subcontractors…"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "7px 10px",
                    borderRadius: 8, border: "1.5px solid var(--neutral-200)",
                    backgroundColor: "var(--neutral-0)",
                    fontSize: 13, color: "var(--neutral-900)", outline: "none",
                    fontFamily: "inherit",
                  }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
              {/* Recent picks section */}
              {showRecents && (
                <div role="group" aria-labelledby={recentsLabelId}>
                  <p id={recentsLabelId} style={{ margin: "2px 0 2px", fontSize: 10, fontWeight: 700, color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {t("recentSubcontractors")}
                  </p>
                  {recentSubs.map((sub) => {
                    const active = pickedSubId === sub.id;
                    return (
                      <button
                        key={`recent-${sub.id}`}
                        type="button"
                        onClick={() => onPickSub(sub.id)}
                        disabled={loading}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "9px 12px", borderRadius: 8, textAlign: "left",
                          border: `1.5px solid ${active ? "var(--primary-400)" : "var(--neutral-200)"}`,
                          backgroundColor: active ? "var(--primary-50)" : "var(--neutral-0)",
                          cursor: loading ? "default" : "pointer",
                          transition: "all 0.1s",
                        }}
                      >
                        <span
                          style={{
                            width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                            border: `2px solid ${active ? "var(--primary-500)" : "var(--neutral-300)"}`,
                            backgroundColor: active ? "var(--primary-500)" : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          {active && <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#fff" }} />}
                        </span>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: active ? 600 : 400, color: "var(--neutral-900)" }}>
                          {sub.name}
                        </span>
                      </button>
                    );
                  })}
                  <div style={{ height: 1, backgroundColor: "var(--neutral-100)", margin: "2px 0" }} aria-hidden />
                </div>
              )}
              {mainSubs.length === 0 && subSearch ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-400)", fontStyle: "italic" }}>No results for &quot;{subSearch}&quot;</p>
              ) : mainSubs.map((sub) => {
                const active = pickedSubId === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => onPickSub(sub.id)}
                    disabled={loading}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 12px", borderRadius: 8, textAlign: "left",
                      border: `1.5px solid ${active ? "var(--primary-400)" : "var(--neutral-200)"}`,
                      backgroundColor: active ? "var(--primary-50)" : "var(--neutral-0)",
                      cursor: loading ? "default" : "pointer",
                      transition: "all 0.1s",
                    }}
                  >
                    <span
                      style={{
                        width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                        border: `2px solid ${active ? "var(--primary-500)" : "var(--neutral-300)"}`,
                        backgroundColor: active ? "var(--primary-500)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {active && <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#fff" }} />}
                    </span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: active ? 600 : 400, color: "var(--neutral-900)" }}>
                      {sub.name}
                    </span>
                  </button>
                );
              })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Summary + confirm */}
      {pickedScopeTypeId !== null && pickedSubId !== null && (
        <div style={{ padding: "14px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Impact summary */}
          <div
            style={{
              padding: "10px 14px", borderRadius: 8,
              backgroundColor: "var(--primary-50)",
              border: "1px solid var(--primary-200)",
              fontSize: 13, color: "var(--primary-800)",
              display: "flex", flexDirection: "column", gap: 3,
            }}
          >
            <span>
              <strong>{affectedUnitCount}</strong> {affectedUnitCount === 1 ? "location" : "locations"} will be updated
            </span>
            {skippedUnitCount > 0 && (
              <span style={{ color: "var(--neutral-500)", fontSize: 12 }}>
                {skippedUnitCount} {skippedUnitCount === 1 ? "location" : "locations"} skipped (scope not present)
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", padding: "14px 16px",
              borderRadius: 12, border: "none",
              backgroundColor: canConfirm ? "var(--primary-700)" : "var(--neutral-200)",
              color: canConfirm ? "var(--neutral-0)" : "var(--neutral-400)",
              fontSize: 15, fontWeight: 600,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            {loading ? (
              <>
                <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", borderRadius: "50%", animation: "bas-spin 0.8s linear infinite", display: "inline-block" }} aria-hidden />
                Applying…
              </>
            ) : (
              <>
                <Users size={15} aria-hidden />
                Set Installer
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/** Update Status view — scope selector + status picker + confirm. */
function ConfirmView({
  t,
  opt,
  affectedUnitCount,
  scopeCount,
  targetScopeTypeNames,
  scopeTypes,
  targetTypeIds,
  targetSubScopeMap,
  onToggle,
  onToggleSubScope,
  totalRows,
  selectedScopeTypes,
  loading,
  onPickOption,
  onConfirm,
  onBack,
}: {
  t: ReturnType<typeof useUnitsTranslator>;
  opt: BulkStatusOption | null;
  affectedUnitCount: number;
  scopeCount: number;
  targetScopeTypeNames: string[];
  scopeTypes: ScopeTypeInfo[];
  targetTypeIds: Set<string>;
  targetSubScopeMap: Map<string, Set<string>>;
  onToggle: (id: string) => void;
  onToggleSubScope: (scopeTypeId: string, subScopeName: string) => void;
  /** Total scope-type rows in the selector (for “X of Y scopes”). */
  totalRows: number;
  /** How many scope types are currently checked. */
  selectedScopeTypes: number;
  loading: boolean;
  onPickOption: (opt: BulkStatusOption) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Back link */}
      <div style={{ padding: "8px 20px 4px" }}>
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "none", border: "none", cursor: loading ? "default" : "pointer",
            color: "var(--neutral-500)", fontSize: 13, fontWeight: 500, padding: "4px 0",
            opacity: loading ? 0.4 : 1,
          }}
        >
          <ArrowLeft size={14} aria-hidden />
          Back
        </button>
      </div>

      <div style={{ padding: "0 20px calc(env(safe-area-inset-bottom, 0px) + 36px)", display: "flex", flexDirection: "column", gap: 20, marginTop: 8 }}>

        {/* Heading */}
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "var(--neutral-900)" }}>
            Update Status
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-500)" }}>
            Choose the scopes to update and select a new status.
          </p>
        </div>

        {/* Scope selector — narrow down which scope types this applies to */}
        {scopeTypes.length > 1 && (
          <ScopeTargetSelector
            scopeTypes={scopeTypes}
            targetTypeIds={targetTypeIds}
            targetSubScopeMap={targetSubScopeMap}
            onToggle={onToggle}
            onToggleSubScope={onToggleSubScope}
            totalRows={totalRows}
            filteredRows={selectedScopeTypes}
          />
        )}

        {/* Status picker */}
        <div>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
            New Status
          </p>
          <div style={{ borderRadius: 12, border: "1px solid var(--neutral-200)", overflow: "hidden" }}>
            {BULK_STATUS_OPTIONS.map((option) => {
              const isActive = opt?.key === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onPickOption(option)}
                  disabled={loading}
                  style={{
                    width: "100%", padding: "13px 14px",
                    display: "flex", alignItems: "center", gap: 12,
                    background: isActive ? option.bg : "var(--neutral-0)",
                    border: "none",
                    borderBottom: "1px solid var(--neutral-100)",
                    cursor: loading ? "default" : "pointer", textAlign: "left",
                    transition: "background-color 0.12s",
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                      border: isActive ? `5px solid ${option.dotColor}` : "1.5px solid var(--neutral-300)",
                      backgroundColor: isActive ? option.bg : "transparent",
                      transition: "border 0.12s",
                    }}
                  />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: isActive ? 600 : 400, color: "var(--neutral-900)" }}>
                    {option.label}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      flexShrink: 0,
                      backgroundColor: option.key === "install_progress" ? "transparent" : option.dotColor,
                      border: option.key === "install_progress" ? `1.5px solid ${option.borderColor}` : "none",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary row — only shown once a status is picked */}
        {opt && (
          <div
            style={{
              borderRadius: 12,
              backgroundColor: "var(--neutral-50)",
              border: "1px solid var(--neutral-200)",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", borderBottom: "1px solid var(--neutral-100)", fontSize: 13 }}>
              <span style={{ color: "var(--neutral-600)" }}>Units to update</span>
              <span style={{ fontWeight: 600, color: "var(--neutral-900)" }}>{affectedUnitCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", borderBottom: targetScopeTypeNames.length > 0 ? "1px solid var(--neutral-100)" : "none", fontSize: 13 }}>
              <span style={{ color: "var(--neutral-600)" }}>Scope{scopeCount !== 1 ? "s" : ""} being updated</span>
              <span style={{ fontWeight: 600, color: "var(--neutral-900)" }}>{scopeCount}</span>
            </div>
            {targetScopeTypeNames.length > 0 && (
              <div style={{ padding: "10px 14px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {targetScopeTypeNames.map((name) => (
                  <span key={name} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 10, backgroundColor: "var(--primary-50)", color: "var(--primary-700)", border: "1px solid var(--primary-200)", fontWeight: 500 }}>
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Confirm button — only active when a status is picked */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={!opt || loading}
          style={{
            width: "100%", padding: "14px 16px",
            borderRadius: 12, border: "none",
            backgroundColor: (!opt || loading) ? "var(--primary-300)" : "var(--primary-700)",
            color: "var(--neutral-0)",
            fontSize: 15, fontWeight: 700, cursor: (!opt || loading) ? "not-allowed" : "pointer",
            transition: "background-color 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {loading ? (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ animation: "bas-spin 0.8s linear infinite" }}>
                <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
                <path d="M8 2 A6 6 0 0 1 14 8" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {t("bulkActionApplying")}
            </>
          ) : opt ? (
            t("bulkActionApply", { count: scopeCount })
          ) : (
            "Select a status above"
          )}
        </button>
      </div>
    </div>
  );
}

// ── Inspection status options ──────────────────────────────────────────────────

type BulkInspectionOptionKey = "passed" | "failed";

const BULK_INSPECTION_OPTION_KEYS: BulkInspectionOptionKey[] = ["passed", "failed"];

const BULK_INSPECTION_OPTION_STYLES: Record<BulkInspectionOptionKey, Omit<BulkInspectionOption, "key" | "label" | "value">> = {
  passed: { dotColor: "var(--success-600)", bg: "var(--success-50)",  borderColor: "var(--success-400)" },
  failed: { dotColor: "var(--error-500)",   bg: "var(--error-50)",    borderColor: "var(--error-300)"   },
};

const BULK_INSPECTION_OPTION_VALUES: Record<BulkInspectionOptionKey, "PASSED" | "FAILED"> = {
  passed: "PASSED",
  failed: "FAILED",
};

/** Set Inspection Status view — scope selector + option picker + confirm.
 *  Option labels are rendered via t() so they appear in the active locale. */
function InspectionConfirmView({
  t,
  opt,
  affectedUnitCount,
  scopeCount,
  targetScopeTypeNames,
  scopeTypes,
  targetTypeIds,
  targetSubScopeMap,
  onToggle,
  onToggleSubScope,
  totalRows,
  selectedScopeTypes,
  loading,
  onPickOption,
  onConfirm,
  onBack,
}: {
  t: ReturnType<typeof useUnitsTranslator>;
  opt: BulkInspectionOption | null;
  affectedUnitCount: number;
  scopeCount: number;
  targetScopeTypeNames: string[];
  scopeTypes: ScopeTypeInfo[];
  targetTypeIds: Set<string>;
  targetSubScopeMap: Map<string, Set<string>>;
  onToggle: (id: string) => void;
  onToggleSubScope: (scopeTypeId: string, subScopeName: string) => void;
  totalRows: number;
  selectedScopeTypes: number;
  loading: boolean;
  onPickOption: (opt: BulkInspectionOption) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Back link */}
      <div style={{ padding: "8px 20px 4px" }}>
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "none", border: "none", cursor: loading ? "default" : "pointer",
            color: "var(--neutral-500)", fontSize: 13, fontWeight: 500, padding: "4px 0",
            opacity: loading ? 0.4 : 1,
          }}
        >
          <ArrowLeft size={14} aria-hidden />
          {t("bulkInspectionBack")}
        </button>
      </div>

      <div style={{ padding: "0 20px calc(env(safe-area-inset-bottom, 0px) + 36px)", display: "flex", flexDirection: "column", gap: 20, marginTop: 8 }}>

        {/* Heading */}
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "var(--neutral-900)" }}>
            {t("bulkActionSetInspection")}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-500)" }}>
            {t("bulkActionSetInspectionSubtitle")}
          </p>
        </div>

        {/* Scope selector — narrow down which scope types this applies to */}
        {scopeTypes.length > 1 && (
          <ScopeTargetSelector
            scopeTypes={scopeTypes}
            targetTypeIds={targetTypeIds}
            targetSubScopeMap={targetSubScopeMap}
            onToggle={onToggle}
            onToggleSubScope={onToggleSubScope}
            totalRows={totalRows}
            filteredRows={selectedScopeTypes}
          />
        )}

        {/* Inspection status picker */}
        <div>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
            {t("bulkInspectionNewStatus")}
          </p>
          <div style={{ borderRadius: 12, border: "1px solid var(--neutral-200)", overflow: "hidden" }}>
            {BULK_INSPECTION_OPTION_KEYS.map((key) => {
              const option: BulkInspectionOption = {
                key,
                label: t(`bulkInspectionOption${key.charAt(0).toUpperCase()}${key.slice(1)}` as Parameters<typeof t>[0]),
                value: BULK_INSPECTION_OPTION_VALUES[key],
                ...BULK_INSPECTION_OPTION_STYLES[key],
              };
              const isActive = opt?.key === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onPickOption(option)}
                  disabled={loading}
                  style={{
                    width: "100%", padding: "13px 14px",
                    display: "flex", alignItems: "center", gap: 12,
                    background: isActive ? option.bg : "var(--neutral-0)",
                    border: "none",
                    borderBottom: "1px solid var(--neutral-100)",
                    cursor: loading ? "default" : "pointer", textAlign: "left",
                    transition: "background-color 0.12s",
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                      border: isActive ? `5px solid ${option.dotColor}` : "1.5px solid var(--neutral-300)",
                      backgroundColor: isActive ? option.bg : "transparent",
                      transition: "border 0.12s",
                    }}
                  />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: isActive ? 600 : 400, color: "var(--neutral-900)" }}>
                    {option.label}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      flexShrink: 0,
                      backgroundColor: option.key === "install_progress" ? "transparent" : option.dotColor,
                      border: option.key === "install_progress" ? `1.5px solid ${option.borderColor}` : "none",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary row — only shown once an option is picked */}
        {opt && (
          <div
            style={{
              borderRadius: 12,
              backgroundColor: "var(--neutral-50)",
              border: "1px solid var(--neutral-200)",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", borderBottom: "1px solid var(--neutral-100)", fontSize: 13 }}>
              <span style={{ color: "var(--neutral-600)" }}>{t("bulkInspectionUnitsToUpdate")}</span>
              <span style={{ fontWeight: 600, color: "var(--neutral-900)" }}>{affectedUnitCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", borderBottom: targetScopeTypeNames.length > 0 ? "1px solid var(--neutral-100)" : "none", fontSize: 13 }}>
              <span style={{ color: "var(--neutral-600)" }}>{t("bulkInspectionScopesBeingUpdated", { count: scopeCount })}</span>
              <span style={{ fontWeight: 600, color: "var(--neutral-900)" }}>{scopeCount}</span>
            </div>
            {targetScopeTypeNames.length > 0 && (
              <div style={{ padding: "10px 14px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {targetScopeTypeNames.map((name) => (
                  <span key={name} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 10, backgroundColor: "var(--primary-50)", color: "var(--primary-700)", border: "1px solid var(--primary-200)", fontWeight: 500 }}>
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Confirm button — only active when an option is picked */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={!opt || loading}
          style={{
            width: "100%", padding: "14px 16px",
            borderRadius: 12, border: "none",
            backgroundColor: (!opt || loading) ? "var(--primary-300)" : "var(--primary-700)",
            color: "var(--neutral-0)",
            fontSize: 15, fontWeight: 700, cursor: (!opt || loading) ? "not-allowed" : "pointer",
            transition: "background-color 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {loading ? (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ animation: "bas-spin 0.8s linear infinite" }}>
                <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
                <path d="M8 2 A6 6 0 0 1 14 8" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {t("bulkActionApplying")}
            </>
          ) : opt ? (
            t("bulkActionApply", { count: scopeCount })
          ) : (
            t("bulkInspectionSelectStatus")
          )}
        </button>
      </div>
    </div>
  );
}

// ── Helper for select pill rows ────────────────────────────────────────────────

function PillRow({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        padding: "6px 12px", borderRadius: 99, border: "none",
        fontSize: 13, fontWeight: selected ? 600 : 400,
        backgroundColor: selected ? "var(--primary-100)" : "var(--neutral-100)",
        color: selected ? "var(--primary-700)" : "var(--neutral-600)",
        cursor: "pointer", transition: "background-color 0.12s",
      }}
    >
      {label}
    </button>
  );
}

/** Report Issue / Observation form — multi-step within the sheet. */
function ReportFormView({
  reportType,
  selectedUnitCount,
  projectId,
  issueForm,
  onIssueFormChange,
  obsForm,
  onObsFormChange,
  scopeTypes,
  targetTypeIds,
  targetSubScopeMap,
  onToggle,
  onToggleSubScope,
  totalRows,
  filteredRows,
  onBack,
  onContinue,
}: {
  reportType: ReportType | null;
  selectedUnitCount: number;
  projectId: string;
  issueForm: IssueFormState;
  onIssueFormChange: (updates: Partial<IssueFormState>) => void;
  obsForm: ObsFormState;
  onObsFormChange: (updates: Partial<ObsFormState>) => void;
  scopeTypes: ScopeTypeInfo[];
  targetTypeIds: Set<string>;
  targetSubScopeMap: Map<string, Set<string>>;
  onToggle: (id: string) => void;
  onToggleSubScope: (scopeTypeId: string, subScopeName: string) => void;
  totalRows: number;
  filteredRows: number;
  onBack: () => void;
  onContinue: (media: BulkMediaItem[]) => void;
}) {
  const [step, setStep] = useState<"pick-blocking" | "form">(
    reportType === "issue" ? "pick-blocking" : "form"
  );

  const canContinue = reportType === "issue"
    ? issueForm.shortDescription.trim().length > 0 && issueForm.issueType !== "" && issueForm.responsibleParties.length > 0
    : reportType === "observation"
    ? obsForm.observationType !== ""
    : false;

  // ── Shared header ──────────────────────────────────────────────────────────
  const header = (
    <div style={{ padding: "8px 20px 12px", display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={step === "form" && reportType === "issue" ? () => setStep("pick-blocking") : onBack}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "none", border: "none", cursor: "pointer",
          color: "var(--neutral-500)", fontSize: 13, fontWeight: 500, padding: "4px 0",
          flexShrink: 0,
        }}
      >
        <ArrowLeft size={14} aria-hidden />
        Back
      </button>
      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--neutral-900)" }}>
        {reportType === "issue" ? "Report Issue" : "Add Observation"}
      </span>
    </div>
  );

  // ── Step 1: Blocking picker (issues only) ──────────────────────────────────
  if (step === "pick-blocking") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {header}
        <div style={{ padding: "16px 20px calc(env(safe-area-inset-bottom, 0px) + 24px)", display: "flex", flexDirection: "column" }}>
          <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>
            Is this issue blocking work?
          </p>
          <p style={{ margin: "0 0 24px", fontSize: 14, color: "var(--neutral-400)", textAlign: "center" }}>
            Select one to continue
          </p>

          {/* Blocking */}
          <button
            type="button"
            onClick={() => { onIssueFormChange({ isBlockingWork: true }); setStep("form"); }}
            style={{
              width: "100%", padding: "18px 20px", borderRadius: 14,
              border: "2px solid var(--error-200)", backgroundColor: "var(--error-50)",
              cursor: "pointer", marginBottom: 12,
              display: "flex", alignItems: "center", gap: 16, textAlign: "left",
            }}
          >
            <span style={{ width: 44, height: 44, borderRadius: 99, backgroundColor: "var(--error-600)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertCircle size={22} style={{ color: "#fff" }} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 16, fontWeight: 700, color: "var(--error-700)", marginBottom: 3 }}>Blocking</span>
              <span style={{ display: "block", fontSize: 13, color: "var(--error-600)", lineHeight: 1.4 }}>Work cannot proceed until this is resolved</span>
            </span>
            <ChevronRight size={18} style={{ color: "var(--error-400)", flexShrink: 0 }} />
          </button>

          {/* Non-blocking */}
          <button
            type="button"
            onClick={() => { onIssueFormChange({ isBlockingWork: false }); setStep("form"); }}
            style={{
              width: "100%", padding: "18px 20px", borderRadius: 14,
              border: "2px solid var(--warning-200)", backgroundColor: "var(--warning-50)",
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 16, textAlign: "left",
            }}
          >
            <span style={{ width: 44, height: 44, borderRadius: 99, backgroundColor: "#f97316", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertTriangle size={22} style={{ color: "#fff" }} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 16, fontWeight: 700, color: "var(--warning-800)", marginBottom: 3 }}>Non-Blocking</span>
              <span style={{ display: "block", fontSize: 13, color: "var(--warning-700)", lineHeight: 1.4 }}>Work can continue alongside this issue</span>
            </span>
            <ChevronRight size={18} style={{ color: "var(--warning-400)", flexShrink: 0 }} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {header}

      {/* Blocking badge — shown on form step for issues */}
      {reportType === "issue" && (
        <div style={{ padding: "0 20px 12px" }}>
          <button
            type="button"
            onClick={() => setStep("pick-blocking")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 12px 6px 10px", borderRadius: 99,
              backgroundColor: issueForm.isBlockingWork ? "var(--error-600)" : "#f97316",
              border: "none", cursor: "pointer",
            }}
          >
            {issueForm.isBlockingWork
              ? <AlertCircle size={14} style={{ color: "#fff" }} />
              : <AlertTriangle size={14} style={{ color: "#fff" }} />}
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
              {issueForm.isBlockingWork ? "Blocking" : "Non-Blocking"}
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginLeft: 2 }}>change</span>
          </button>
        </div>
      )}

      {/* Per-unit note */}
      <div style={{ margin: "0 20px 14px", padding: "9px 12px", borderRadius: 8, backgroundColor: "var(--primary-50)", border: "1px solid var(--primary-100)" }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--primary-700)", lineHeight: 1.45 }}>
          {reportType === "issue" ? "An issue" : "An observation"} will be <strong>individually added</strong> to each of the <strong>{selectedUnitCount} {selectedUnitCount === 1 ? "unit" : "units"}</strong> selected.
        </p>
      </div>

      {/* Scope selector — at top, same as individual issue modal */}
      <ScopeTargetSelector
        scopeTypes={scopeTypes}
        targetTypeIds={targetTypeIds}
        targetSubScopeMap={targetSubScopeMap}
        onToggle={onToggle}
        onToggleSubScope={onToggleSubScope}
        totalRows={totalRows}
        filteredRows={filteredRows}
      />

      {/* Issue fields */}
      {reportType === "issue" && (
        <IssueFields
          projectId={projectId}
          issueForm={issueForm}
          onIssueFormChange={onIssueFormChange}
          onContinue={onContinue}
          canContinue={canContinue}
        />
      )}

      {/* Observation fields */}
      {reportType === "observation" && (
        <ObsFields
          projectId={projectId}
          obsForm={obsForm}
          onObsFormChange={onObsFormChange}
          onContinue={() => onContinue([])}
          canContinue={canContinue}
        />
      )}
    </div>
  );
}

const FIELD_LABEL_STYLE: import("react").CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "var(--neutral-500)",
  textTransform: "uppercase", letterSpacing: "0.05em",
};

// ── BulkMediaThumb ─────────────────────────────────────────────────────────────

function BulkMediaThumb({
  item, uploading, onRemove, onAnnotate, onCaption,
}: {
  item: BulkMediaItem;
  uploading: boolean;
  onRemove: () => void;
  onAnnotate?: () => void;
  onCaption: () => void;
}) {
  const isImage = item.mimeType.startsWith("image/");
  const isVideo = item.mimeType.startsWith("video/");
  const isPending = item.kind === "staged";
  const caption = item.caption ?? "";
  const hasCaption = caption.trim().length > 0;
  return (
    <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0, borderRadius: 10, overflow: "hidden", border: `1.5px solid ${isPending ? "var(--error-300)" : "var(--neutral-200)"}` }}>
      {isImage && <img src={item.localUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
      {isVideo && <video src={item.localUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline />}
      {!isImage && !isVideo && (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--neutral-100)" }}>
          <Mic size={22} style={{ color: "var(--neutral-500)" }} />
        </div>
      )}
      {isPending && !uploading && <div style={{ position: "absolute", bottom: 4, left: 4, width: 7, height: 7, borderRadius: 99, backgroundColor: "var(--error-500)", border: "1.5px solid #fff" }} />}
      {isPending && uploading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }}>
          <Loader2 size={20} style={{ color: "#fff", animation: "spin 1s linear infinite" }} />
        </div>
      )}
      {hasCaption && !uploading && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)", padding: "2px 4px" }}>
          <p style={{ margin: 0, fontSize: 9, color: "#fff", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caption}</p>
        </div>
      )}
      {!uploading && (
        <button type="button" aria-label="Remove" onClick={onRemove}
          style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <Trash2 size={11} style={{ color: "#fff" }} />
        </button>
      )}
      {!uploading && (
        <button type="button" aria-label={hasCaption ? "Edit caption" : "Add caption"} onClick={onCaption}
          style={{ position: "absolute", bottom: 3, left: 3, width: 20, height: 20, borderRadius: 99, backgroundColor: hasCaption ? "rgba(220,38,38,0.85)" : "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <AlignLeft size={10} style={{ color: "#fff" }} />
        </button>
      )}
      {isImage && !uploading && onAnnotate && (
        <button type="button" aria-label="Annotate" onClick={onAnnotate}
          style={{ position: "absolute", bottom: 3, right: 3, width: 20, height: 20, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.55)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <Pencil size={10} style={{ color: "#fff" }} />
        </button>
      )}
    </div>
  );
}

/** Issue fields sub-component with progressive reveal matching the individual modal. */
function IssueFields({
  projectId,
  issueForm, onIssueFormChange, onContinue, canContinue,
}: {
  projectId: string;
  issueForm: IssueFormState;
  onIssueFormChange: (updates: Partial<IssueFormState>) => void;
  onContinue: (media: BulkMediaItem[]) => void;
  canContinue: boolean;
}) {
  const t = useTranslations("units");
  const tCommon = useTranslations("common");
  const td = useTranslations("dictation");
  const { issueTypes: catalogIssueTypes, responsibleParties: catalogParties } =
    useIssueCatalog(projectId);
  const [titleTouched, setTitleTouched] = useState(false);
  const showDetails = titleTouched || issueForm.shortDescription.trim().length > 0;

  // ── Media state ────────────────────────────────────────────────────────────
  const [media, setMedia] = useState<BulkMediaItem[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [annotatingId, setAnnotatingId] = useState<string | null>(null);
  const [captioningId, setCaptioningId] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const isUploading = false; // uploads happen on confirm, not here

  function handleCameraCapture(captured: CapturedFile[]) {
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - media.length;
    if (slots <= 0) return;
    setMedia((prev) => [...prev, ...captured.slice(0, slots).map((c) => ({
      kind: "staged" as const,
      clientId: `${Date.now()}-${Math.random()}`,
      file: c.file, localUrl: c.localUrl, mimeType: c.mimeType, caption: "",
    }))]);
  }

  const processFiles = useCallback(async (rawFiles: File[]) => {
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - media.length;
    if (slots <= 0) return;
    const files = rawFiles.slice(0, slots);
    if (!files.length) return;
    const newItems: BulkMediaItem[] = [];
    for (const file of files) {
      const mime = resolveClientMime(file);
      if (mime.startsWith("video/") && file.size > VIDEO_SIZE_LIMIT_BULK) {
        toast.error(`"${file.name}" exceeds the 50 MB video limit and was skipped.`);
        continue;
      }
      let processedFile = file;
      let processedMime = mime;
      try {
        const prepared = await processLibraryMediaFile(file, {
          stamp: { uploaded: true },
          onHeicLargeWarning: (f) =>
            toast(tCommon("heicLargeFileWarning", { filename: f.name, sizeMb: (f.size / 1024 / 1024).toFixed(0) }), { icon: "ℹ️" }),
        });
        processedFile = prepared.file;
        processedMime = prepared.mimeType;
      } catch {
        if (isFieldMediaImageFile(file)) {
          toastImagePrepareFailure(
            file,
            () => t("obsImagePrepareFailed"),
            (v) => tCommon("imageTooLargePrepareFailed", v),
          );
          continue;
        }
      }
      newItems.push({ kind: "staged", clientId: `${Date.now()}-${Math.random()}`, file: processedFile, localUrl: URL.createObjectURL(processedFile), mimeType: processedMime, caption: "" });
    }
    if (newItems.length > 0) setMedia((prev) => [...prev, ...newItems]);
  }, [media.length, t, tCommon]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = "";
    await processFiles(rawFiles);
  }

  const handleMediaDropRejected = useCallback(() => {
    toast.error(tCommon("dropRejectedFileType"));
  }, [tCommon]);

  const { dropHandlers } = useFileDrop({
    onFiles: processFiles,
    onRejected: handleMediaDropRejected,
    accept: FIELD_MEDIA_ACCEPT,
    disabled: media.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY,
  });

  function handleAnnotationSave(clientId: string, result: AnnotationSaveResult) {
    if (!isFlattenAnnotationSave(result)) return;
    setMedia((prev) => prev.map((m) => {
      if (m.clientId !== clientId || m.kind !== "staged") return m;
      const annotatedFile = new File([result.blob], (m as StagedBulkMedia).file.name, { type: "image/jpeg" });
      return { ...m, file: annotatedFile, localUrl: result.localUrl, mimeType: "image/jpeg" };
    }));
    setAnnotatingId(null);
  }

  const annotatingItem = annotatingId ? media.find((m) => m.clientId === annotatingId) : null;
  return (
    <>
    <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Title */}
      <div style={{ marginTop: 8 }}>
        <label style={FIELD_LABEL_STYLE}>
          Title <span style={{ color: "var(--error-500)" }}>*</span>
        </label>
        <div style={{ position: "relative", marginTop: 6 }}>
          <input
            ref={titleInputRef}
            type="text"
            maxLength={50}
            placeholder="e.g. Water damage behind cabinet panel"
            value={issueForm.shortDescription}
            onFocus={() => setTitleTouched(true)}
            onChange={(e) => onIssueFormChange({ shortDescription: e.target.value })}
            style={{
              display: "block", width: "100%", padding: "10px 44px 10px 12px", fontSize: 16,
              border: "1.5px solid var(--neutral-250)", borderRadius: 10,
              outline: "none", boxSizing: "border-box", backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-900)", fontFamily: "inherit", lineHeight: 1.5,
            }}
          />
          <DictationButton
            fieldLabel={td("fieldTitle")}
            focusTargetRef={titleInputRef}
            onAppendText={(segment) => onIssueFormChange({
              shortDescription: appendTranscriptSegment(issueForm.shortDescription, segment, 50),
            })}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}
          />
        </div>
        <div style={{ fontSize: 11, color: "var(--neutral-400)", textAlign: "right", marginTop: 2 }}>
          {issueForm.shortDescription.length}/50
        </div>
      </div>

      {showDetails && (<>
        {/* Notes */}
        <div>
          <label style={FIELD_LABEL_STYLE}>
            Notes{" "}
            <span style={{ fontSize: 10, fontWeight: 400, color: "var(--neutral-400)", textTransform: "none", letterSpacing: 0 }}>optional</span>
          </label>
          <div style={{ position: "relative", marginTop: 6 }}>
            <textarea
              ref={notesTextareaRef}
              rows={3}
              maxLength={2000}
              placeholder="Additional details, context, or observations…"
              value={issueForm.notes}
              onChange={(e) => onIssueFormChange({ notes: e.target.value })}
              style={{
                display: "block", width: "100%", padding: "10px 12px 44px", fontSize: 14,
                border: "1.5px solid var(--neutral-250)", borderRadius: 10,
                outline: "none", resize: "vertical", boxSizing: "border-box",
                backgroundColor: "var(--neutral-0)", color: "var(--neutral-900)",
                fontFamily: "inherit", lineHeight: 1.5,
              }}
            />
            <DictationButton
              fieldLabel={td("fieldNotes")}
              focusTargetRef={notesTextareaRef}
              onAppendText={(segment) => onIssueFormChange({
                notes: appendTranscriptSegment(issueForm.notes, segment, 2000),
              })}
              style={{ position: "absolute", right: 8, bottom: 8 }}
            />
          </div>
        </div>

        {/* Issue type */}
        <div>
          <label style={FIELD_LABEL_STYLE}>
            Issue Type <span style={{ color: "var(--error-500)" }}>*</span>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {catalogIssueTypes.map((type) => {
              const k = type.code;
              const active = issueForm.issueType === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => onIssueFormChange({ issueType: k })}
                  style={{
                    width: "100%", textAlign: "left", padding: "11px 14px", borderRadius: 10,
                    border: `1.5px solid ${active ? "transparent" : "var(--neutral-200)"}`,
                    backgroundColor: active ? "var(--primary-50)" : "var(--neutral-0)",
                    fontSize: 14, fontWeight: active ? 600 : 400,
                    color: active ? "var(--primary-700)" : "var(--neutral-800)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                >
                  {resolveIssueTypeLabel(k, catalogIssueTypes)}
                  {active && <Check size={16} style={{ color: "var(--primary-500)", flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Responsible party */}
        <div>
          <label style={FIELD_LABEL_STYLE}>
            Responsible Party <span style={{ color: "var(--error-500)" }}>*</span>
          </label>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--neutral-400)" }}>Tap to select one or more</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {catalogParties.map((party) => {
              const k = party.code;
              const active = issueForm.responsibleParties.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    const next = active
                      ? issueForm.responsibleParties.filter((p) => p !== k)
                      : [...issueForm.responsibleParties, k];
                    onIssueFormChange({ responsibleParties: next });
                  }}
                  style={{
                    padding: "7px 14px", borderRadius: 99,
                    border: `1.5px solid ${active ? "var(--primary-500)" : "var(--neutral-250)"}`,
                    backgroundColor: active ? "var(--primary-500)" : "var(--neutral-0)",
                    color: active ? "var(--neutral-0)" : "var(--neutral-700)",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {resolvePartyLabel(k, catalogParties)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Media */}
        <div style={{ position: "relative" }} {...dropHandlers}>
          <label style={FIELD_LABEL_STYLE}>
            Photos / Video / Audio{" "}
            <span style={{ fontSize: 10, fontWeight: 400, color: "var(--neutral-400)", textTransform: "none", letterSpacing: 0 }}>optional · attached to every issue</span>
          </label>
          {media.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, marginBottom: 8 }}>
              {media.map((m) => (
                <BulkMediaThumb
                  key={m.clientId}
                  item={m}
                  uploading={isUploading}
                  onRemove={() => setMedia((prev) => prev.filter((x) => x.clientId !== m.clientId))}
                  onAnnotate={m.mimeType.startsWith("image/") && m.kind === "staged" ? () => setAnnotatingId(m.clientId) : undefined}
                  onCaption={() => { setCaptionDraft(m.caption ?? ""); setCaptioningId(m.clientId); }}
                />
              ))}
            </div>
          )}
          {media.length < MAX_MEDIA_ATTACHMENTS_PER_ENTITY && (
            <>
              <input ref={fileInputRef} type="file" accept={FIELD_MEDIA_ACCEPT} multiple
                style={{ display: "none" }} onChange={handleFileChange} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => setShowCamera(true)}
                  style={{ flex: 1, minHeight: 42, borderRadius: 10, border: "1.5px solid var(--primary-200)", backgroundColor: "var(--primary-50)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--primary-700)", cursor: "pointer" }}>
                  <Camera size={14} /> Camera
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  style={{ flex: 1, minHeight: 42, borderRadius: 10, border: "1.5px dashed var(--neutral-300)", backgroundColor: "var(--neutral-50)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--neutral-600)", cursor: "pointer" }}>
                  <Images size={14} /> Library
                </button>
              </div>
              {media.length > 0 && (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--neutral-400)", textAlign: "center" }}>{t("mediaAttachedCount", { current: media.length, max: MAX_MEDIA_ATTACHMENTS_PER_ENTITY })}</p>
              )}
            </>
          )}
          <FileDropOverlay
            disabled={media.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY}
          />
        </div>

        {/* Continue */}
        <button
          type="button"
          onClick={() => onContinue(media)}
          disabled={!canContinue}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            width: "100%", marginTop: 8, padding: "14px 16px",
            borderRadius: 12, border: "none",
            backgroundColor: canContinue ? "var(--primary-700)" : "var(--neutral-200)",
            color: canContinue ? "var(--neutral-0)" : "var(--neutral-400)",
            fontSize: 15, fontWeight: 600, cursor: canContinue ? "pointer" : "not-allowed",
            transition: "background-color 0.15s",
          }}
        >
          Continue
          <ChevronRight size={16} aria-hidden />
        </button>
      </>)}
    </div>

    {/* Camera capture overlay */}
    {showCamera && (
      <CameraCapture
        projectId={projectId}
        maxItems={MAX_MEDIA_ATTACHMENTS_PER_ENTITY - media.length}
        onCapture={(captured) => { handleCameraCapture(captured); setShowCamera(false); }}
        onClose={() => setShowCamera(false)}
      />
    )}

    {/* Image annotation editor */}
    {annotatingItem && annotatingId && (
      <ImageAnnotationEditor
        src={annotatingItem.localUrl}
        onSave={(result) => handleAnnotationSave(annotatingId, result)}
        onClose={() => setAnnotatingId(null)}
      />
    )}

    {/* Caption editor */}
    {captioningId && createPortal(
      <div role="dialog" aria-modal="true" aria-label="Add caption"
        style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", flexDirection: "column", backgroundColor: "rgba(0,0,0,0.6)" }}
        onClick={(e) => { if (e.target === e.currentTarget) setCaptioningId(null); }}
      >
        <div style={{ flex: 1 }} onClick={() => setCaptioningId(null)} />
        <div style={{ backgroundColor: "var(--neutral-0)", borderRadius: "20px 20px 0 0", padding: "20px", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 -4px 40px rgba(0,0,0,0.18)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--neutral-900)" }}>Add Caption</span>
            <button type="button" onClick={() => setCaptioningId(null)} aria-label="Cancel"
              style={{ width: 32, height: 32, borderRadius: 99, border: "none", backgroundColor: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={16} style={{ color: "var(--neutral-600)" }} />
            </button>
          </div>
          <textarea autoFocus value={captionDraft} onChange={(e) => setCaptionDraft(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Describe what this photo shows…" rows={3} maxLength={500}
            style={{ width: "100%", padding: "10px 12px", fontSize: 15, lineHeight: 1.5, borderRadius: 10, border: "1.5px solid var(--neutral-250)", backgroundColor: "var(--neutral-50)", color: "var(--neutral-900)", resize: "none", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setCaptioningId(null)}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, border: "1.5px solid var(--neutral-200)", backgroundColor: "var(--neutral-0)", fontSize: 14, fontWeight: 600, color: "var(--neutral-600)", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="button" onClick={() => {
              const id = captioningId;
              setMedia((prev) => prev.map((x) => x.clientId === id ? { ...x, caption: captionDraft.trim() } : x));
              setCaptioningId(null);
            }}
              style={{ flex: 1, minHeight: 44, borderRadius: 12, border: "none", backgroundColor: "var(--error-600)", fontSize: 14, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
              Save Caption
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}

/** Observation fields sub-component. */
function ObsFields({
  projectId,
  obsForm, onObsFormChange, onContinue, canContinue,
}: {
  projectId: string;
  obsForm: ObsFormState;
  onObsFormChange: (updates: Partial<ObsFormState>) => void;
  onContinue: () => void;
  canContinue: boolean;
}) {
  const td = useTranslations("dictation");
  const { observationTypes } = useObservationCatalog(projectId);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  return (
    <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Observation type */}
      <div style={{ marginTop: 8 }}>
        <label style={FIELD_LABEL_STYLE}>
          Observation Type <span style={{ color: "var(--error-500)" }}>*</span>
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {observationTypes.map((type) => (
            <PillRow
              key={type.code}
              label={type.displayName}
              selected={obsForm.observationType === type.code}
              onSelect={() => onObsFormChange({ observationType: type.code })}
            />
          ))}
        </div>
      </div>

      {/* Title */}
      <div>
        <label style={FIELD_LABEL_STYLE}>
          Title{" "}
          <span style={{ fontSize: 10, fontWeight: 400, color: "var(--neutral-400)", textTransform: "none", letterSpacing: 0 }}>optional</span>
        </label>
        <div style={{ position: "relative", marginTop: 6 }}>
          <input
            ref={titleInputRef}
            type="text"
            maxLength={200}
            placeholder="Short title…"
            value={obsForm.title}
            onChange={(e) => onObsFormChange({ title: e.target.value })}
            style={{
              display: "block", width: "100%", padding: "10px 44px 10px 12px", fontSize: 16,
              border: "1.5px solid var(--neutral-250)", borderRadius: 10,
              outline: "none", boxSizing: "border-box", backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-900)", fontFamily: "inherit", lineHeight: 1.5,
            }}
          />
          <DictationButton
            fieldLabel={td("fieldTitle")}
            focusTargetRef={titleInputRef}
            onAppendText={(segment) => onObsFormChange({
              title: appendTranscriptSegment(obsForm.title, segment, 200),
            })}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label style={FIELD_LABEL_STYLE}>
          Description{" "}
          <span style={{ fontSize: 10, fontWeight: 400, color: "var(--neutral-400)", textTransform: "none", letterSpacing: 0 }}>optional</span>
        </label>
        <div style={{ position: "relative", marginTop: 6 }}>
          <textarea
            ref={descriptionTextareaRef}
            rows={3}
            maxLength={2000}
            placeholder="Details…"
            value={obsForm.description}
            onChange={(e) => onObsFormChange({ description: e.target.value })}
            style={{
              display: "block", width: "100%", padding: "10px 12px 44px", fontSize: 14,
              border: "1.5px solid var(--neutral-250)", borderRadius: 10,
              outline: "none", resize: "vertical", boxSizing: "border-box",
              backgroundColor: "var(--neutral-0)", color: "var(--neutral-900)",
              fontFamily: "inherit", lineHeight: 1.5,
            }}
          />
          <DictationButton
            fieldLabel={td("fieldDescription")}
            focusTargetRef={descriptionTextareaRef}
            onAppendText={(segment) => onObsFormChange({
              description: appendTranscriptSegment(obsForm.description, segment, 2000),
            })}
            style={{ position: "absolute", right: 8, bottom: 8 }}
          />
        </div>
      </div>

      {/* Continue */}
      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          width: "100%", marginTop: 8, padding: "14px 16px",
          borderRadius: 12, border: "none",
          backgroundColor: canContinue ? "var(--primary-700)" : "var(--neutral-200)",
          color: canContinue ? "var(--neutral-0)" : "var(--neutral-400)",
          fontSize: 15, fontWeight: 600, cursor: canContinue ? "pointer" : "not-allowed",
          transition: "background-color 0.15s",
        }}
      >
        Continue
        <ChevronRight size={16} aria-hidden />
      </button>
    </div>
  );
}

/** Confirm screen for bulk issue / observation report. */
function ReportConfirmView({
  projectId,
  reportType,
  issueForm,
  obsForm,
  affectedUnitCount,
  targetScopeTypeNames,
  loading,
  onConfirm,
  onBack,
}: {
  projectId: string;
  reportType: ReportType;
  issueForm: IssueFormState;
  obsForm: ObsFormState;
  affectedUnitCount: number;
  targetScopeTypeNames: string[];
  loading: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const { observationTypes } = useObservationCatalog(projectId);
  const obsTypeLabel = resolveObservationTypeLabel(obsForm.observationType, observationTypes);
  const label = reportType === "issue"
    ? issueForm.shortDescription
    : (obsForm.title || obsTypeLabel || "Observation");
  const typeBadgeColor = reportType === "issue" ? "var(--error-100)" : "var(--primary-100)";
  const typeBadgeText = reportType === "issue" ? "var(--error-700)" : "var(--primary-700)";

  return (
    <div style={{ padding: "8px 20px calc(env(safe-area-inset-bottom, 0px) + 36px)", display: "flex", flexDirection: "column", gap: 20 }}>
      <button
        type="button"
        onClick={onBack}
        disabled={loading}
        style={{
          alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4,
          background: "none", border: "none", cursor: loading ? "default" : "pointer",
          color: "var(--neutral-500)", fontSize: 13, fontWeight: 500, padding: "4px 0",
          opacity: loading ? 0.4 : 1,
        }}
      >
        <ArrowLeft size={14} aria-hidden />
        Back
      </button>

      <div>
        <p style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700, color: "var(--neutral-900)" }}>
          Confirm Report
        </p>
        <span
          style={{
            display: "inline-block", padding: "3px 10px", borderRadius: 99,
            fontSize: 12, fontWeight: 600,
            backgroundColor: typeBadgeColor, color: typeBadgeText,
            marginBottom: 8,
          }}
        >
          {reportType === "issue" ? "Issue" : "Observation"}
        </span>
        <p style={{ margin: 0, fontSize: 14, color: "var(--neutral-700)", fontStyle: "italic" }}>
          &ldquo;{label}&rdquo;
        </p>
      </div>

      {/* Summary */}
      <div
        style={{
          backgroundColor: "var(--neutral-50)",
          border: "1px solid var(--neutral-200)",
          borderRadius: 12, overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--neutral-100)" }}>
          <span style={{ fontSize: 13, color: "var(--neutral-600)" }}>Units to create for</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--neutral-900)" }}>{affectedUnitCount}</span>
        </div>
        {targetScopeTypeNames.length > 0 && (
          <div style={{ padding: "12px 16px" }}>
            <span style={{ fontSize: 12, color: "var(--neutral-500)", display: "block", marginBottom: 8 }}>
              Scopes tagged
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {targetScopeTypeNames.map((n) => (
                <span key={n} style={{ padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, backgroundColor: "var(--primary-100)", color: "var(--primary-700)" }}>
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={loading}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          width: "100%", padding: "14px 16px",
          borderRadius: 12, border: "none",
          backgroundColor: loading ? "var(--neutral-200)" : "var(--primary-700)",
          color: loading ? "var(--neutral-400)" : "var(--neutral-0)",
          fontSize: 15, fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? (
          <>
            <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", borderRadius: "50%", animation: "bas-spin 0.8s linear infinite", display: "inline-block" }} aria-hidden />
            Submitting…
          </>
        ) : (
          <>Submit</>
        )}
      </button>
    </div>
  );
}

// ── Main inner component ───────────────────────────────────────────────────────

function BulkActionsSheetInner({
  onClose,
  selectedUnitCount,
  scopeRows,
  projectId,
  userId,
  onSuccess,
  onBulkComplete,
}: Omit<BulkActionsSheetProps, "open">) {
  const t = useUnitsTranslator();
  const tOffline = useTranslations("offlineIndicator");
  const { isOnline } = useOfflineStatus();

  function requireOnline(): boolean {
    if (isOnline) return true;
    toast.error(tOffline("offlineActionUnavailable"));
    return false;
  }

  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>("list");
  const [picked, setPicked] = useState<BulkStatusOption | null>(null);
  const [pickedInspection, setPickedInspection] = useState<BulkInspectionOption | null>(null);

  // Subcontractor state
  const [subScopeTypeId, setSubScopeTypeId] = useState<string | null>(null);
  const [subUnifierSubId, setSubUnifierSubId] = useState<string | null>(null);
  const [subs, setSubs] = useState<SubItem[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);

  // Report form state
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [issueForm, setIssueForm] = useState<IssueFormState>(EMPTY_ISSUE_FORM);
  const [obsForm, setObsForm] = useState<ObsFormState>(EMPTY_OBS_FORM);
  const [issueMedia, setIssueMedia] = useState<BulkMediaItem[]>([]);
  const [issueUploadProgress, setIssueUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  /** True after user taps Stop until teardown (toast/banner) completes; keeps overlay + sheet locked. */
  const [bulkStatusStopping, setBulkStatusStopping] = useState(false);
  const bulkAbortRef = useRef<AbortController | null>(null);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sorted scope types for the selection UI — rowCount = distinct units with that type
  // (duplicate project rows in one unit still count as one unit).
  const scopeTypes = useMemo<ScopeTypeInfo[]>(() => {
    return computeBulkScopeTypeGroups(scopeRows).map((g) => ({
      id: g.id,
      name: g.name,
      rawScopeTypeIds: g.rawScopeTypeIds,
      rowCount: g.unitCount,
      subScopeNames: g.subScopeNames,
      hasSubScopes: g.hasSubScopes,
    }));
  }, [scopeRows]);

  // Track which scope type IDs the user wants to target (default: all).
  const [targetTypeIds, setTargetTypeIds] = useState<Set<string>>(new Set());

  // Track which sub-scope names are selected per scope type (default: all).
  const [targetSubScopeMap, setTargetSubScopeMap] = useState<Map<string, Set<string>>>(new Map());

  // Seed both maps when scope types first appear (or change).
  useEffect(() => {
    setTargetTypeIds(new Set(scopeTypes.map((st) => st.id)));
    const subMap = new Map<string, Set<string>>();
    for (const st of scopeTypes) {
      subMap.set(st.id, new Set(st.subScopeNames));
    }
    setTargetSubScopeMap(subMap);
  }, [scopeTypes.map((st) => st.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTargetType(id: string) {
    const isCurrentlySelected = targetTypeIds.has(id);
    if (isCurrentlySelected && targetTypeIds.size === 1) return; // keep at least one
    setTargetTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
    // When re-enabling a type, reset its sub-scopes to all selected.
    if (!isCurrentlySelected) {
      const st = scopeTypes.find((s) => s.id === id);
      if (st) {
        setTargetSubScopeMap((prev) => {
          const next = new Map(prev);
          next.set(id, new Set(st.subScopeNames));
          return next;
        });
      }
    }
  }

  function toggleSubScope(scopeTypeId: string, subScopeName: string) {
    setTargetSubScopeMap((prev) => {
      const current = new Set(prev.get(scopeTypeId) ?? []);
      if (current.has(subScopeName) && current.size === 1) return prev; // keep at least one
      const next = new Map(prev);
      const updated = new Set(current);
      if (updated.has(subScopeName)) { updated.delete(subScopeName); } else { updated.add(subScopeName); }
      next.set(scopeTypeId, updated);
      return next;
    });
  }

  // Expand selected canonical group IDs → the raw scopeTypeIds they contain.
  // e.g. selecting the "CAB" canonical group matches both "CABIU" and "Cabinetry" raw IDs.
  const targetRawScopeTypeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const st of scopeTypes) {
      if (targetTypeIds.has(st.id)) {
        st.rawScopeTypeIds.forEach((rawId) => ids.add(rawId));
      }
    }
    return ids;
  }, [scopeTypes, targetTypeIds]);

  // Rows sent to the API — filtered to only the chosen scope type IDs.
  const filteredScopeRows = useMemo(
    () => scopeRows.filter((r) => r.scopeTypeId !== null && targetRawScopeTypeIds.has(r.scopeTypeId)),
    [scopeRows, targetRawScopeTypeIds]
  );

  // Unique units that will actually receive at least one update.
  // For rows with sub-scopes, the unit only counts if at least one of its
  // sub-scope instances matches the selected sub-scope names.
  const affectedUnitCount = useMemo(() => {
    const unitKeys = new Set<string>();
    for (const row of filteredScopeRows) {
      if (row.subScopes.length === 0) {
        unitKeys.add(row.unitKey);
      } else {
        // Look up sub-scope selection by canonical group key
        const groupKey = row.canonicalScopeTypeId ?? row.scopeTypeId ?? "";
        const selectedSubNames = targetSubScopeMap.get(groupKey) ?? new Set<string>();
        if (row.subScopes.some((s) => selectedSubNames.has(s.name))) {
          unitKeys.add(row.unitKey);
        }
      }
    }
    return unitKeys.size;
  }, [filteredScopeRows, targetSubScopeMap]);

  // Names of the scope types currently targeted (for ConfirmView pills).
  const targetScopeTypeNames = useMemo(
    () => scopeTypes.filter((st) => targetTypeIds.has(st.id)).map((st) => st.name),
    [scopeTypes, targetTypeIds]
  );

  // ── Subcontractor derived values ───────────────────────────────────────────
  // rawScopeTypeIds for the currently-picked canonical scope type group.
  const subRawScopeTypeIds = useMemo<Set<string>>(() => {
    if (!subScopeTypeId) return new Set();
    const st = scopeTypes.find((s) => s.id === subScopeTypeId);
    if (!st) return new Set();
    return new Set(st.rawScopeTypeIds);
  }, [scopeTypes, subScopeTypeId]);

  // Rows that will receive the installer update.
  const subAffectedRows = useMemo(
    () => scopeRows.filter((r) => r.scopeTypeId !== null && subRawScopeTypeIds.has(r.scopeTypeId)),
    [scopeRows, subRawScopeTypeIds],
  );

  const subAffectedUnitCount = useMemo(() => {
    const keys = new Set(subAffectedRows.map((r) => r.unitKey));
    return keys.size;
  }, [subAffectedRows]);

  const subSkippedUnitCount = selectedUnitCount - subAffectedUnitCount;

  // Animate sheet in on mount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(raf);
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Fetch Unifier subcontractors the first time the subcontractor view opens.
  // Same endpoint as SubcontractorPicker — ensures the user sees the exact same list.
  useEffect(() => {
    if (phase !== "subcontractorPick" && phase !== "subcontractorLoading") return;
    if (subs.length > 0 || subsLoading) return;
    setSubsLoading(true);
    fetch("/api/unifier/subcontractors")
      .then((r) => r.ok ? r.json() : { subcontractors: [] })
      .then((data: { subcontractors?: SubItem[] }) => {
        setSubs(data.subcontractors ?? []);
      })
      .catch(() => { /* non-critical — show empty state */ })
      .finally(() => setSubsLoading(false));
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    setVisible(false);
    closeTimerRef.current = setTimeout(onClose, 320);
  }

  /** Collect the unique unit keys currently affected by the scope filter. */
  function getAffectedUnitKeys(): string[] {
    const keys = new Set<string>();
    for (const row of filteredScopeRows) {
      if (row.subScopes.length === 0) {
        keys.add(row.unitKey);
      } else {
        const groupKey = row.canonicalScopeTypeId ?? row.scopeTypeId ?? "";
        const selectedSubNames = targetSubScopeMap.get(groupKey) ?? new Set<string>();
        if (row.subScopes.some((s) => selectedSubNames.has(s.name))) {
          keys.add(row.unitKey);
        }
      }
    }
    return Array.from(keys);
  }

  async function handleConfirm() {
    if (!picked || phase === "loading") return;
    if (!requireOnline()) return;

    const rowIds: string[] = [];
    const subScopeInstanceIds: string[] = [];
    for (const row of filteredScopeRows) {
      if (row.subScopes.length === 0) {
        rowIds.push(row.id);
      } else {
        const groupKey = row.canonicalScopeTypeId ?? row.scopeTypeId ?? "";
        const selectedSubNames = targetSubScopeMap.get(groupKey) ?? new Set<string>();
        for (const sub of row.subScopes) {
          if (selectedSubNames.has(sub.name)) {
            subScopeInstanceIds.push(sub.id);
          }
        }
      }
    }

    if (rowIds.length === 0 && subScopeInstanceIds.length === 0) {
      toast.error(t("bulkActionError"));
      return;
    }

    const { rowSnap, instSnap } = buildBulkStatusSnapshotMaps(filteredScopeRows, targetSubScopeMap);

    const totalOps = rowIds.length + subScopeInstanceIds.length;
    const chunks = chunkBulkStatusPayload(rowIds, subScopeInstanceIds, BULK_STATUS_CHUNK_SIZE);
    const abortController = new AbortController();
    bulkAbortRef.current = abortController;

    const baseBody: Record<string, unknown> = { scopeStatus: picked.status };
    if (picked.stageSend !== undefined) {
      baseBody.scopeStage = picked.stageSend;
    }

    let multiChunk = false;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalBlockedByIssue = 0;
    const mergedAppliedRows: string[] = [];
    const mergedAppliedSubs: string[] = [];

    setBulkStatusStopping(false);
    setBulkProgress({ current: 0, total: totalOps });
    setPhase("loading");

    const postActivityLog = async (): Promise<void> => {
      if (mergedAppliedRows.length === 0 && mergedAppliedSubs.length === 0) return;
      const activityBody = await enrichBodyWithActivityLocation({
        ...baseBody,
        appliedRowIds: mergedAppliedRows,
        appliedSubScopeInstanceIds: mergedAppliedSubs,
      });
      const logRes = await fetch(`/api/projects/${projectId}/units/bulk-status/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activityBody),
      });
      if (!logRes.ok) {
        toast.error(t("bulkActionActivityLogFailed"));
      }
    };

    try {
      multiChunk = chunks.length > 1;

      for (let c = 0; c < chunks.length; c++) {
        if (abortController.signal.aborted) break;

        const chunk = chunks[c];
        let chunkBody: Record<string, unknown> = {
          ...baseBody,
          rowIds: chunk.rowIds,
          subScopeInstanceIds: chunk.subScopeInstanceIds,
          ...(multiChunk ? { skipActivityLog: true } : {}),
        };
        if (!multiChunk) {
          chunkBody = await enrichBodyWithActivityLocation(chunkBody);
        }
        const res = await fetch(`/api/projects/${projectId}/units/bulk-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chunkBody),
          signal: abortController.signal,
        });

        if (!res.ok) {
          setBulkProgress(null);
          setPhase("confirming");
          const undoPayloadErr = revertPayloadFromApplied(
            mergedAppliedRows,
            mergedAppliedSubs,
            rowSnap,
            instSnap
          );
          const appliedCount = mergedAppliedRows.length + mergedAppliedSubs.length;
          toast.error(t("bulkActionError"), {
            ...(appliedCount > 0
              ? { description: t("bulkActionErrorPartialDescription", { count: appliedCount }) }
              : {}),
            duration: 8000,
          });
          if (appliedCount > 0) {
            const partialKeys = getUnitKeysFromApplied(mergedAppliedRows, mergedAppliedSubs, filteredScopeRows);
            const scopeCount = mergedAppliedRows.length + mergedAppliedSubs.length;
            onBulkComplete?.(partialKeys, {
              actionLabel: picked.label,
              statusUndoPayload: statusUndoMeta(undoPayloadErr),
              scopesAffected: scopeCount,
            });
            if (multiChunk) await postActivityLog().catch(() => {});
            onSuccess();
          }
          bulkAbortRef.current = null;
          return;
        }

        const data = (await res.json()) as BulkStatusApiResponse;
        totalUpdated += data.updated;
        totalSkipped += data.skipped;
        totalBlockedByIssue += data.blockedByBlockingIssue?.length ?? 0;
        mergedAppliedRows.push(...data.appliedRowIds);
        mergedAppliedSubs.push(...data.appliedSubScopeInstanceIds);

        const processed = chunks.slice(0, c + 1).reduce(
          (acc, ch) => acc + ch.rowIds.length + ch.subScopeInstanceIds.length,
          0
        );
        setBulkProgress({ current: Math.min(processed, totalOps), total: totalOps });
      }

      if (abortController.signal.aborted) {
        if (multiChunk && (mergedAppliedRows.length > 0 || mergedAppliedSubs.length > 0)) {
          await postActivityLog().catch(() => {});
        }
        if (totalUpdated > 0) {
          onSuccess();
          const undoPayloadAbort = revertPayloadFromApplied(
            mergedAppliedRows,
            mergedAppliedSubs,
            rowSnap,
            instSnap
          );
          const partialKeys = getUnitKeysFromApplied(mergedAppliedRows, mergedAppliedSubs, filteredScopeRows);
          const scopeCount = mergedAppliedRows.length + mergedAppliedSubs.length;
          onBulkComplete?.(partialKeys, {
            actionLabel: picked.label,
            statusUndoPayload: statusUndoMeta(undoPayloadAbort),
            scopesAffected: scopeCount,
          });
          toast.message(
            t("bulkActionCancelledPartial", {
              unitCount: partialKeys.length,
              scopeCount,
            }),
            { duration: 6000 }
          );
        } else {
          toast.message(t("bulkActionCancelled"));
        }
        setBulkStatusStopping(false);
        setBulkProgress(null);
        bulkAbortRef.current = null;
        handleClose();
        return;
      }

      if (multiChunk && (mergedAppliedRows.length > 0 || mergedAppliedSubs.length > 0)) {
        await postActivityLog();
      }

      setBulkProgress(null);
      const undoPayloadOk = revertPayloadFromApplied(
        mergedAppliedRows,
        mergedAppliedSubs,
        rowSnap,
        instSnap
      );
      onBulkComplete?.(getAffectedUnitKeys(), {
        actionLabel: picked.label,
        statusUndoPayload: statusUndoMeta(undoPayloadOk),
        scopesAffected: mergedAppliedRows.length + mergedAppliedSubs.length,
      });
      if (totalSkipped > 0) {
        toast.success(t("bulkActionSuccessPartial", { updated: totalUpdated, skipped: totalSkipped }));
      } else {
        toast.success(t("bulkActionSuccessAll", { count: totalUpdated }));
      }
      if (totalBlockedByIssue > 0) {
        toast.warning(t("bulkActionBlockingIssueSkipped", { count: totalBlockedByIssue }));
      }
      onSuccess();
      handleClose();
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError"));
      if (isAbort) {
        if (multiChunk && (mergedAppliedRows.length > 0 || mergedAppliedSubs.length > 0)) {
          await postActivityLog().catch(() => {});
        }
        if (totalUpdated > 0) {
          onSuccess();
          const undoPayloadCatch = revertPayloadFromApplied(
            mergedAppliedRows,
            mergedAppliedSubs,
            rowSnap,
            instSnap
          );
          const partialKeys = getUnitKeysFromApplied(mergedAppliedRows, mergedAppliedSubs, filteredScopeRows);
          const scopeCount = mergedAppliedRows.length + mergedAppliedSubs.length;
          onBulkComplete?.(partialKeys, {
            actionLabel: picked.label,
            statusUndoPayload: statusUndoMeta(undoPayloadCatch),
            scopesAffected: scopeCount,
          });
          toast.message(
            t("bulkActionCancelledPartial", {
              unitCount: partialKeys.length,
              scopeCount,
            }),
            { duration: 6000 }
          );
        } else {
          toast.message(t("bulkActionCancelled"));
        }
        setBulkStatusStopping(false);
        setBulkProgress(null);
        bulkAbortRef.current = null;
        handleClose();
        return;
      }
      setBulkStatusStopping(false);
      setBulkProgress(null);
      setPhase("confirming");
      const undoPayloadFail = revertPayloadFromApplied(
        mergedAppliedRows,
        mergedAppliedSubs,
        rowSnap,
        instSnap
      );
      if (undoPayloadFail.revertRows.length + undoPayloadFail.revertInstances.length > 0) {
        if (multiChunk) await postActivityLog().catch(() => {});
        onSuccess();
        const partialKeys = getUnitKeysFromApplied(mergedAppliedRows, mergedAppliedSubs, filteredScopeRows);
        const scopeCount = mergedAppliedRows.length + mergedAppliedSubs.length;
        onBulkComplete?.(partialKeys, {
          actionLabel: picked.label,
          statusUndoPayload: statusUndoMeta(undoPayloadFail),
          scopesAffected: scopeCount,
        });
        toast.error(t("bulkActionError"), { duration: 8000 });
      } else {
        toast.error(t("bulkActionError"));
      }
    } finally {
      bulkAbortRef.current = null;
    }
  }

  async function handleInspectionConfirm() {
    if (!pickedInspection || phase === "inspectionLoading") return;
    if (!requireOnline()) return;

    const rowIds: string[] = [];
    const subScopeInstanceIds: string[] = [];
    for (const row of filteredScopeRows) {
      if (row.subScopes.length === 0) {
        rowIds.push(row.id);
      } else {
        const groupKey = row.canonicalScopeTypeId ?? row.scopeTypeId ?? "";
        const selectedSubNames = targetSubScopeMap.get(groupKey) ?? new Set<string>();
        for (const sub of row.subScopes) {
          if (selectedSubNames.has(sub.name)) {
            subScopeInstanceIds.push(sub.id);
          }
        }
      }
    }

    if (rowIds.length === 0 && subScopeInstanceIds.length === 0) {
      toast.error(t("bulkActionError"));
      return;
    }

    const { rowSnap, instSnap } = buildBulkStatusSnapshotMaps(filteredScopeRows, targetSubScopeMap);

    const totalOps = rowIds.length + subScopeInstanceIds.length;
    const chunks = chunkBulkStatusPayload(rowIds, subScopeInstanceIds, BULK_STATUS_CHUNK_SIZE);
    const abortController = new AbortController();
    bulkAbortRef.current = abortController;

    let multiChunk = false;
    let totalUpdated = 0;
    const mergedAppliedRows: string[] = [];
    const mergedAppliedSubs: string[] = [];

    setBulkStatusStopping(false);
    setBulkProgress({ current: 0, total: totalOps });
    setPhase("inspectionLoading");

    try {
      multiChunk = chunks.length > 1;

      for (let c = 0; c < chunks.length; c++) {
        if (abortController.signal.aborted) break;

        const chunk = chunks[c];
        const res = await fetch(`/api/projects/${projectId}/units/bulk-inspection`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inspectionStatus: pickedInspection.value,
            rowIds: chunk.rowIds,
            subScopeInstanceIds: chunk.subScopeInstanceIds,
            ...(multiChunk ? { skipActivityLog: true } : {}),
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          setBulkProgress(null);
          setPhase("inspectionConfirm");
          const undoPayloadErr = revertPayloadFromApplied(mergedAppliedRows, mergedAppliedSubs, rowSnap, instSnap);
          const appliedCount = mergedAppliedRows.length + mergedAppliedSubs.length;
          toast.error(t("bulkActionError"), {
            ...(appliedCount > 0 ? { description: t("bulkActionErrorPartialDescription", { count: appliedCount }) } : {}),
            duration: 8000,
          });
          if (appliedCount > 0) {
            const partialKeys = getUnitKeysFromApplied(mergedAppliedRows, mergedAppliedSubs, filteredScopeRows);
            onBulkComplete?.(partialKeys, {
              actionLabel: pickedInspection.label,
              statusUndoPayload: statusUndoMeta(undoPayloadErr),
              scopesAffected: appliedCount,
            });
            onSuccess();
          }
          bulkAbortRef.current = null;
          return;
        }

        const data = (await res.json()) as BulkStatusApiResponse;
        totalUpdated += data.updated;
        mergedAppliedRows.push(...data.appliedRowIds);
        mergedAppliedSubs.push(...data.appliedSubScopeInstanceIds);

        const processed = chunks.slice(0, c + 1).reduce(
          (acc, ch) => acc + ch.rowIds.length + ch.subScopeInstanceIds.length,
          0
        );
        setBulkProgress({ current: Math.min(processed, totalOps), total: totalOps });
      }

      if (abortController.signal.aborted) {
        if (totalUpdated > 0) {
          onSuccess();
          const undoPayloadAbort = revertPayloadFromApplied(mergedAppliedRows, mergedAppliedSubs, rowSnap, instSnap);
          const partialKeys = getUnitKeysFromApplied(mergedAppliedRows, mergedAppliedSubs, filteredScopeRows);
          const scopeCount = mergedAppliedRows.length + mergedAppliedSubs.length;
          onBulkComplete?.(partialKeys, {
            actionLabel: pickedInspection.label,
            statusUndoPayload: statusUndoMeta(undoPayloadAbort),
            scopesAffected: scopeCount,
          });
          toast.message(t("bulkActionCancelledPartial", { unitCount: partialKeys.length, scopeCount }), { duration: 6000 });
        } else {
          toast.message(t("bulkActionCancelled"));
        }
        setBulkStatusStopping(false);
        setBulkProgress(null);
        bulkAbortRef.current = null;
        handleClose();
        return;
      }

      // Multi-chunk: post the combined activity log now that all chunks succeeded.
      if (multiChunk && (mergedAppliedRows.length > 0 || mergedAppliedSubs.length > 0)) {
        try {
          const activityRes = await fetch(`/api/projects/${projectId}/units/bulk-inspection`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inspectionStatus: pickedInspection.value,
              rowIds: [],
              subScopeInstanceIds: [],
              skipActivityLog: false,
              appliedRowIds: mergedAppliedRows,
              appliedSubScopeInstanceIds: mergedAppliedSubs,
            }),
          });
          if (!activityRes.ok) {
            console.error("Failed to write combined bulk inspection activity log", {
              projectId,
              status: activityRes.status,
              statusText: activityRes.statusText,
            });
          }
        } catch (activityErr) {
          console.error("Failed to write combined bulk inspection activity log", {
            projectId,
            error: activityErr,
          });
        }
      }

      setBulkProgress(null);
      const undoPayloadOk = revertPayloadFromApplied(mergedAppliedRows, mergedAppliedSubs, rowSnap, instSnap);
      onBulkComplete?.(getAffectedUnitKeys(), {
        actionLabel: pickedInspection.label,
        statusUndoPayload: statusUndoMeta(undoPayloadOk),
        scopesAffected: mergedAppliedRows.length + mergedAppliedSubs.length,
      });
      toast.success(t("bulkActionSuccessAll", { count: totalUpdated }));
      onSuccess();
      handleClose();
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError"));
      if (isAbort) {
        if (totalUpdated > 0) {
          onSuccess();
          const undoPayloadCatch = revertPayloadFromApplied(mergedAppliedRows, mergedAppliedSubs, rowSnap, instSnap);
          const partialKeys = getUnitKeysFromApplied(mergedAppliedRows, mergedAppliedSubs, filteredScopeRows);
          const scopeCount = mergedAppliedRows.length + mergedAppliedSubs.length;
          onBulkComplete?.(partialKeys, {
            actionLabel: pickedInspection.label,
            statusUndoPayload: statusUndoMeta(undoPayloadCatch),
            scopesAffected: scopeCount,
          });
          toast.message(t("bulkActionCancelledPartial", { unitCount: partialKeys.length, scopeCount }), { duration: 6000 });
        } else {
          toast.message(t("bulkActionCancelled"));
        }
        setBulkStatusStopping(false);
        setBulkProgress(null);
        bulkAbortRef.current = null;
        handleClose();
        return;
      }
      setBulkStatusStopping(false);
      setBulkProgress(null);
      setPhase("inspectionConfirm");
      const undoPayloadFail = revertPayloadFromApplied(mergedAppliedRows, mergedAppliedSubs, rowSnap, instSnap);
      if (undoPayloadFail.revertRows.length + undoPayloadFail.revertInstances.length > 0) {
        onSuccess();
        const partialKeys = getUnitKeysFromApplied(mergedAppliedRows, mergedAppliedSubs, filteredScopeRows);
        const scopeCount = mergedAppliedRows.length + mergedAppliedSubs.length;
        onBulkComplete?.(partialKeys, {
          actionLabel: pickedInspection.label,
          statusUndoPayload: statusUndoMeta(undoPayloadFail),
          scopesAffected: scopeCount,
        });
        toast.error(t("bulkActionError"), { duration: 8000 });
      } else {
        toast.error(t("bulkActionError"));
      }
    } finally {
      bulkAbortRef.current = null;
    }
  }

  async function handleSubcontractorConfirm() {
    if (!subScopeTypeId || !subUnifierSubId || subAffectedRows.length === 0) return;
    if (!requireOnline()) return;

    const rowIds = subAffectedRows.map((r) => r.id);
    setPhase("subcontractorLoading");

    try {
      const res = await fetch(`/api/projects/${projectId}/units/bulk-installer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIds, unifierSubId: subUnifierSubId }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? t("bulkActionError"));
        setPhase("subcontractorPick");
        return;
      }

      const data = (await res.json()) as { updatedCount: number; updatedIds: string[] };
      const pickedSub = subs.find((s) => s.id === subUnifierSubId);
      const subName = pickedSub?.name ?? t("subcontractorLabel");

      if (data.updatedCount === 0) {
        setPhase("subcontractorPick");
        return;
      }

      const affectedUnitKeys = unitKeysForBulkInstallerUpdate(subAffectedRows, data.updatedIds);
      if (affectedUnitKeys.length > 0) {
        onBulkComplete?.(affectedUnitKeys, {
          actionLabel: subName,
          scopesAffected: data.updatedCount,
        });
      }

      // Persist this pick so it surfaces in the "Recent" section next time
      if (pickedSub) writeRecentSub(userId, projectId, pickedSub);

      onSuccess?.();
      handleClose();
    } catch {
      toast.error(t("bulkActionError"));
      setPhase("subcontractorPick");
    }
  }

  async function handleReportConfirm() {
    if (!reportType || phase === "reportLoading") return;
    if (!requireOnline()) return;
    setPhase("reportLoading");

    // All unique unit refs from the FILTERED scope rows only — units that don't have
    // the targeted scope type are excluded here and get no issue created.
    const allUnitRefs = Array.from(new Set(filteredScopeRows.map((r) => r.unitRef)));

    // Per-unit scope row IDs from the scope-type-filtered rows (for tagging).
    const scopeTagMap = new Map<string, string[]>(); // unitRef -> scopeRowIds
    for (const row of filteredScopeRows) {
      const existing = scopeTagMap.get(row.unitRef) ?? [];
      existing.push(row.id);
      scopeTagMap.set(row.unitRef, existing);
    }

    // One entry per unit — only units in filteredScopeRows appear here.
    const units = allUnitRefs.map((unitRef) => ({
      unitRef,
      scopeRowIds: scopeTagMap.get(unitRef) ?? [],
    }));

    if (units.length === 0) {
      toast.error("No units selected — select at least one unit and try again.");
      setPhase("reportConfirm");
      return;
    }

    try {
      if (reportType === "issue") {
        // ── Upload media once, attach to every issue ─────────────────────────
        type UploadedAttachment = { storageKey: string; storageUrl: string; mimeType: string; fileSizeBytes: number; caption: string };
        const attachments: UploadedAttachment[] = [];
        const staged = issueMedia.filter((m): m is { kind: "staged" } & StagedBulkMedia => m.kind === "staged");
        const alreadyUploaded = issueMedia.filter((m): m is { kind: "uploaded" } & UploadedBulkMedia => m.kind === "uploaded");
        for (const u of alreadyUploaded) {
          attachments.push({ storageKey: u.storageKey, storageUrl: u.storageUrl, mimeType: u.mimeType, fileSizeBytes: u.fileSizeBytes, caption: u.caption });
        }
        if (staged.length > 0) {
          setIssueUploadProgress({ current: 0, total: staged.length });
          for (let i = 0; i < staged.length; i++) {
            setIssueUploadProgress({ current: i + 1, total: staged.length });
            const s = staged[i];
            try {
              const form = new FormData();
              form.append("file", s.file);
              form.append("type", "issues");
              if (s.caption) form.append("caption", s.caption);
              const uploadData = await uploadWithRetry(form, { projectId });
              attachments.push({ storageKey: uploadData.storageKey, storageUrl: uploadData.storageUrl, mimeType: uploadData.mimeType, fileSizeBytes: uploadData.fileSizeBytes, caption: s.caption });
            } catch (uploadErr) {
              console.error(`[bulk-media] upload "${s.file.name}" failed after retries:`, uploadErr);
              toast.error(t("uploadFailedWithName", { name: s.file.name }));
            }
          }
          setIssueUploadProgress(null);
        }

        const res = await fetch(`/api/projects/${projectId}/issues/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            units,
            shortDescription: issueForm.shortDescription,
            notes: issueForm.notes || undefined,
            issueType: issueForm.issueType,
            responsibleParties: issueForm.responsibleParties,
            isBlockingWork: issueForm.isBlockingWork,
            attachmentKeys: attachments.map((a) => a.storageKey),
            attachmentUrls: attachments.map((a) => a.storageUrl),
            attachmentMimeTypes: attachments.map((a) => a.mimeType),
            attachmentFileSizeBytes: attachments.map((a) => a.fileSizeBytes),
            attachmentCaptions: attachments.map((a) => a.caption),
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error("[issues/bulk]", res.status, errText);
          toast.error(`Failed to submit issues (${res.status}). Please try again.`);
          setPhase("reportConfirm");
          return;
        }
        const data = (await res.json()) as { created: number };
        setIssueMedia([]);
        toast.success(`Issue added to ${data.created} unit${data.created !== 1 ? "s" : ""}`, {
          duration: Infinity,
          closeButton: true,
        });
        onBulkComplete?.(allUnitRefs, { actionLabel: "Issue reported" });
      } else {
        const res = await fetch(`/api/projects/${projectId}/observations/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            units,
            title: obsForm.title || undefined,
            description: obsForm.description || undefined,
            observationType: obsForm.observationType,
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error("[observations/bulk]", res.status, errText);
          toast.error(`Failed to submit observations (${res.status}). Please try again.`);
          setPhase("reportConfirm");
          return;
        }
        const data = (await res.json()) as { created: number };
        toast.success(`Observation added to ${data.created} unit${data.created !== 1 ? "s" : ""}`, {
          duration: Infinity,
          closeButton: true,
        });
        onBulkComplete?.(allUnitRefs, { actionLabel: "Observation added" });
      }

      onSuccess();
      handleClose();
    } catch (err) {
      console.error("[bulk report] unexpected error:", err);
      toast.error("Something went wrong. Please try again.");
      setPhase("reportConfirm");
    }
  }

  // Display count = unique scope types being targeted (not raw DB operations).
  const scopeCount = targetScopeTypeNames.length || filteredScopeRows.length;
  const visibleClass = visible ? "bas-visible" : "";
  const isLoading =
    phase === "loading" || phase === "inspectionLoading" || phase === "reportLoading" || bulkStatusStopping;

  return (
    <>
    {(phase === "loading" || phase === "inspectionLoading") && bulkProgress && (
      <BulkStatusProgressOverlay
        progress={bulkProgress}
        stopping={bulkStatusStopping}
        onStop={() => {
          setBulkStatusStopping(true);
          bulkAbortRef.current?.abort();
        }}
      />
    )}
    <div
      className={`bas-backdrop ${visibleClass}`}
      onClick={() => {
        if (!isLoading) handleClose();
      }}
      aria-hidden="false"
    >
      <style>{`
        ${SHEET_CSS}
        @keyframes bas-spin { to { transform: rotate(360deg); } }
      `}</style>
      <div
        className={`bas-sheet ${visibleClass}`}
        role="dialog"
        aria-modal="true"
        aria-label={t("bulkActionsTitle")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bas-handle" aria-hidden />

        {/* ── Header ── */}
        <div
            style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between",
              padding: "12px 20px 14px",
              borderBottom: "1px solid var(--neutral-100)",
              flexShrink: 0,
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--neutral-900)" }}>
                {t("bulkActionsTitle")}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--neutral-500)" }}>
                {t("bulkActionsSubtitle", { count: selectedUnitCount })}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              aria-label="Close"
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: "none", backgroundColor: "var(--neutral-100)",
                color: "var(--neutral-600)", cursor: isLoading ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, opacity: isLoading ? 0.4 : 1,
              }}
            >
              <X size={15} aria-hidden />
            </button>
          </div>

        {/* ── Scrollable body ── */}
        <div className="bas-body">
          {phase === "list" && (
            <>
              <ListView
                t={t}
                onStartUpdateStatus={() => { setPicked(null); setPhase("confirming"); }}
                onStartInspection={() => { setPickedInspection(null); setPhase("inspectionConfirm"); }}
                onStartIssue={() => {
                  setReportType("issue");
                  setIssueForm(EMPTY_ISSUE_FORM);
                  setObsForm(EMPTY_OBS_FORM);
                  setPhase("reportForm");
                }}
                onStartObservation={() => {
                  setReportType("observation");
                  setIssueForm(EMPTY_ISSUE_FORM);
                  setObsForm(EMPTY_OBS_FORM);
                  setPhase("reportForm");
                }}
                onStartSubcontractor={() => {
                  setSubScopeTypeId(scopeTypes.length === 1 ? scopeTypes[0].id : null);
                  setSubUnifierSubId(null);
                  setPhase("subcontractorPick");
                }}
              />
            </>
          )}

          {(phase === "confirming" || phase === "loading") && (
            <ConfirmView
              t={t}
              opt={picked}
              affectedUnitCount={affectedUnitCount}
              scopeCount={scopeCount}
              targetScopeTypeNames={targetScopeTypeNames}
              scopeTypes={scopeTypes}
              targetTypeIds={targetTypeIds}
              targetSubScopeMap={targetSubScopeMap}
              onToggle={toggleTargetType}
              onToggleSubScope={toggleSubScope}
              totalRows={scopeTypes.length}
              selectedScopeTypes={targetTypeIds.size}
              loading={isLoading}
              onPickOption={setPicked}
              onConfirm={handleConfirm}
              onBack={() => { if (!isLoading) setPhase("list"); }}
            />
          )}

          {(phase === "inspectionConfirm" || phase === "inspectionLoading") && (
            <InspectionConfirmView
              t={t}
              opt={pickedInspection}
              affectedUnitCount={affectedUnitCount}
              scopeCount={scopeCount}
              targetScopeTypeNames={targetScopeTypeNames}
              scopeTypes={scopeTypes}
              targetTypeIds={targetTypeIds}
              targetSubScopeMap={targetSubScopeMap}
              onToggle={toggleTargetType}
              onToggleSubScope={toggleSubScope}
              totalRows={scopeTypes.length}
              selectedScopeTypes={targetTypeIds.size}
              loading={isLoading}
              onPickOption={setPickedInspection}
              onConfirm={handleInspectionConfirm}
              onBack={() => { if (!isLoading) setPhase("list"); }}
            />
          )}

          {(phase === "reportForm") && (
            <ReportFormView
              reportType={reportType}
              selectedUnitCount={selectedUnitCount}
              projectId={projectId}
              issueForm={issueForm}
              onIssueFormChange={(updates) => setIssueForm((prev) => ({ ...prev, ...updates }))}
              obsForm={obsForm}
              onObsFormChange={(updates) => setObsForm((prev) => ({ ...prev, ...updates }))}
              scopeTypes={scopeTypes}
              targetTypeIds={targetTypeIds}
              targetSubScopeMap={targetSubScopeMap}
              onToggle={toggleTargetType}
              onToggleSubScope={toggleSubScope}
              totalRows={scopeTypes.length}
              filteredRows={targetTypeIds.size}
              onBack={() => setPhase("list")}
              onContinue={(media) => { setIssueMedia(media); setPhase("reportConfirm"); }}
            />
          )}

          {(phase === "reportConfirm" || phase === "reportLoading") && reportType && (
            <ReportConfirmView
              projectId={projectId}
              reportType={reportType}
              issueForm={issueForm}
              obsForm={obsForm}
              affectedUnitCount={affectedUnitCount}
              targetScopeTypeNames={targetScopeTypeNames}
              loading={phase === "reportLoading"}
              onConfirm={handleReportConfirm}
              onBack={() => { if (phase !== "reportLoading") setPhase("reportForm"); }}
            />
          )}

          {(phase === "subcontractorPick" || phase === "subcontractorLoading") && (
            <SubcontractorPickView
              scopeTypes={scopeTypes}
              pickedScopeTypeId={subScopeTypeId}
              onPickScopeType={(id) => { setSubScopeTypeId(id); setSubUnifierSubId(null); }}
              subs={subs}
              subsLoading={subsLoading}
              pickedSubId={subUnifierSubId}
              onPickSub={setSubUnifierSubId}
              affectedUnitCount={subAffectedUnitCount}
              skippedUnitCount={subSkippedUnitCount}
              loading={phase === "subcontractorLoading"}
              onConfirm={handleSubcontractorConfirm}
              onBack={() => { if (phase !== "subcontractorLoading") setPhase("list"); }}
              userId={userId}
              projectId={projectId}
            />
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// ── Portal wrapper ─────────────────────────────────────────────────────────────

export function BulkActionsSheet(props: BulkActionsSheetProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  if (!props.open || !mounted) return null;
  return createPortal(
    <BulkActionsSheetInner {...props} />,
    document.body
  );
}

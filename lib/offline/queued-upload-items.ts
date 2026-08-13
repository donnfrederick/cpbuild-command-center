/**
 * Human-readable labels for offline mutation + inspection queues.
 * Used by OfflineCachePanel so users see what is waiting to upload.
 */

import { getPendingMutations, type MutationType, type QueuedMutation } from "@/lib/offline/mutation-queue";
import { getAllPending, type PendingInspection } from "@/lib/inspections/inspectionOfflineDb";
import { UNKNOWN_INSPECTION_FORM_NAME } from "@/lib/activity/inspection-sync-failure-labels";
import { clientSubmissionCategory } from "@/lib/inspections/client-submission-category";
import type { FormLevel, InspectionCategory } from "@/components/forms/formTypes";
import {
  isOpaqueInspectionUnitId,
  isProjectLevelInspectionUnitId,
  isValidUnitInspectionRef,
  parseUnitInspectionRef,
} from "@/lib/inspections/unit-inspection-ref";
import { combinedOptionDisplay } from "@/lib/scope-combined-options";
import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";

export interface QueuedUploadItem {
  id: string;
  queuedAt: number;
  source: "inspection" | "mutation";
  /** Set for mutation rows — drives retake/remove actions in the upload queue. */
  mutationType?: MutationType;
  /** Primary line — key under the `offlineCachePanel` next-intl namespace. */
  labelKey: string;
  labelValues: Record<string, string | number>;
  /** Secondary line (inspection rows: level, location, category, outcome). */
  detailKey?: string;
  detailValues?: Record<string, string | number>;
  /** Latest sync failure message (inspection queue only). */
  lastSyncError?: string;
}

const QUEUED_INSPECTION_CATEGORY_KEYS: Record<InspectionCategory, string> = {
  TWO_AREA_CLEAR: "queuedItemCategoryTwoAreaClear",
  FIELD_VERIFICATION: "queuedItemCategoryFieldVerification",
  GYPCRETE_MOISTURE_TEST: "queuedItemCategoryGypcrete",
  CLEAR_INSPECTION: "queuedItemCategoryClearInspection",
  CALIBRATION_INSPECTION: "queuedItemCategoryCalibration",
  OTHER: "queuedItemCategoryOther",
};

const QUEUED_INSPECTION_OUTCOME_KEYS = {
  PASS: "queuedItemOutcomePass",
  FAIL: "queuedItemOutcomeFail",
  COMPLETE: "queuedItemOutcomeComplete",
} as const;

export type QueuedInspectionFormLevel = "project" | "unit" | "scope";

export function resolveQueuedInspectionFormLevel(
  record: PendingInspection,
  template: Record<string, unknown>,
): QueuedInspectionFormLevel {
  const templateLevel = template.level as FormLevel | undefined;
  if (templateLevel === "project" || isProjectLevelInspectionUnitId(record.unitId)) {
    return "project";
  }
  if (templateLevel === "unit") return "unit";
  if (record.scopeRowId || templateLevel === "scope") return "scope";
  if (isValidUnitInspectionRef(record.unitId)) return "unit";
  return "scope";
}

/** Human-readable location string for queue display (empty for project-level). */
export function formatQueuedInspectionLocation(
  record: PendingInspection,
  formLevel: QueuedInspectionFormLevel,
): string {
  if (formLevel === "project") return "";

  const parsed = parseUnitInspectionRef(record.unitId);
  const parts: string[] = [];

  if (parsed) {
    if (parsed.unit?.trim()) {
      parts.push(parsed.unit.trim());
    } else {
      if (parsed.building?.trim()) parts.push(parsed.building.trim());
      if (parsed.level?.trim()) parts.push(`L${parsed.level.trim()}`);
    }
  } else if (
    !isProjectLevelInspectionUnitId(record.unitId) &&
    !isOpaqueInspectionUnitId(record.unitId)
  ) {
    const [building = "", level = "", unit = ""] = record.unitId.split("|");
    if (unit.trim()) parts.push(unit.trim());
    else {
      if (building.trim()) parts.push(building.trim());
      if (level.trim()) parts.push(`L${level.trim()}`);
    }
  }

  if (formLevel === "scope" && record.scopeTypeCode?.trim()) {
    parts.push(record.scopeTypeCode.trim());
  }

  return parts.join(" · ");
}

function inspectionCategoryKey(record: PendingInspection, template: Record<string, unknown>): string {
  const category = clientSubmissionCategory({
    templateSnapshot: template,
    formCategory: typeof template.category === "string" ? template.category : null,
    categoryOverride: record.categoryOverride,
  });
  return QUEUED_INSPECTION_CATEGORY_KEYS[category] ?? QUEUED_INSPECTION_CATEGORY_KEYS.OTHER;
}

function inspectionOutcomeKey(outcome: PendingInspection["outcome"]): string {
  return QUEUED_INSPECTION_OUTCOME_KEYS[outcome] ?? QUEUED_INSPECTION_OUTCOME_KEYS.COMPLETE;
}

function inspectionLevelKey(formLevel: QueuedInspectionFormLevel): string {
  switch (formLevel) {
    case "project":
      return "queuedItemLevelProject";
    case "unit":
      return "queuedItemLevelUnit";
    default:
      return "queuedItemLevelScope";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function truncate(value: string, max = 56): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function formatUnitRef(unitRef: string | null | undefined): string {
  if (!unitRef) return "";
  const [building = "", level = "", unit = ""] = unitRef.split("|");
  if (unit.trim()) return unit.trim();
  return [building, level].filter(Boolean).join(" · ");
}

function formatDirectLocation(body: Record<string, unknown>): string {
  const unit = String(body.unit ?? "").trim();
  if (unit) return unit;
  const building = String(body.building ?? "").trim();
  const level = String(body.level ?? "").trim();
  return [building, level].filter(Boolean).join(" · ");
}

function formatScopeStatus(body: Record<string, unknown>): string {
  const stage = typeof body.scopeStage === "string" ? body.scopeStage : null;
  const status = typeof body.scopeStatus === "string" ? body.scopeStatus : null;
  if (stage && status) {
    return combinedOptionDisplay(stage as ScopeStage, status as ScopeStatus).label;
  }
  return [stage, status].filter(Boolean).join(" / ");
}

function commentTargetFromUrl(url: string): "observation" | "issue" | "unknown" {
  if (url.includes("/observations/") && url.endsWith("/comments")) return "observation";
  if (url.includes("/issues/") && url.endsWith("/comments")) return "issue";
  return "unknown";
}

export function describeQueuedMutation(mutation: QueuedMutation): QueuedUploadItem {
  const body = asRecord(mutation.body);
  const base = {
    id: mutation.id,
    queuedAt: mutation.queuedAt,
    source: "mutation" as const,
    mutationType: mutation.type,
    ...(mutation.lastSyncError ? { lastSyncError: mutation.lastSyncError } : {}),
  };

  switch (mutation.type as MutationType) {
    case "unit-status": {
      const location = formatDirectLocation(body);
      const status = formatScopeStatus(body) || "—";
      return {
        ...base,
        labelKey: location ? "queuedItemUnitStatus" : "queuedItemUnitStatusNoLocation",
        labelValues: location ? { location, status } : { status },
      };
    }
    case "create-observation": {
      const title = truncate(String(body.title ?? body.description ?? ""));
      const location = formatUnitRef(typeof body.unitRef === "string" ? body.unitRef : null);
      return {
        ...base,
        labelKey: title
          ? location
            ? "queuedItemObservation"
            : "queuedItemObservationNoLocation"
          : location
            ? "queuedItemObservationUntitled"
            : "queuedItemObservationGeneric",
        labelValues: {
          ...(title ? { title } : {}),
          ...(location ? { location } : {}),
        },
      };
    }
    case "update-observation": {
      const title = truncate(String(body.title ?? body.description ?? ""));
      return {
        ...base,
        labelKey: title ? "queuedItemObservationUpdate" : "queuedItemObservationUpdateGeneric",
        labelValues: title ? { title } : {},
      };
    }
    case "create-issue": {
      const description = truncate(String(body.shortDescription ?? ""));
      const location = formatUnitRef(typeof body.unitRef === "string" ? body.unitRef : null);
      return {
        ...base,
        labelKey: description
          ? location
            ? "queuedItemIssue"
            : "queuedItemIssueNoLocation"
          : location
            ? "queuedItemIssueUntitled"
            : "queuedItemIssueGeneric",
        labelValues: {
          ...(description ? { description } : {}),
          ...(location ? { location } : {}),
        },
      };
    }
    case "add-comment": {
      const preview = truncate(String(body.body ?? ""));
      const target = commentTargetFromUrl(mutation.url);
      if (!preview) {
        return {
          ...base,
          labelKey:
            target === "observation"
              ? "queuedItemCommentObservationEmpty"
              : target === "issue"
                ? "queuedItemCommentIssueEmpty"
                : "queuedItemCommentGeneric",
          labelValues: {},
        };
      }
      return {
        ...base,
        labelKey:
          target === "observation"
            ? "queuedItemCommentObservation"
            : target === "issue"
              ? "queuedItemCommentIssue"
              : "queuedItemCommentGeneric",
        labelValues: { preview },
      };
    }
    case "link-status-album-photo": {
      const location = truncate(String(body.sourceLabel ?? ""));
      return {
        ...base,
        labelKey: location ? "queuedItemStatusPhoto" : "queuedItemStatusPhotoGeneric",
        labelValues: location ? { location } : {},
      };
    }
    case "create-custom-site-location": {
      const name = truncate(String(body.name ?? ""));
      return {
        ...base,
        labelKey: name ? "queuedItemCustomSiteLocation" : "queuedItemCustomSiteLocationGeneric",
        labelValues: name ? { name } : {},
      };
    }
    case "create-project-note":
    case "edit-project-note": {
      const preview = truncate(String(body.body ?? ""));
      return {
        ...base,
        labelKey: preview ? "queuedItemProjectNote" : "queuedItemProjectNoteGeneric",
        labelValues: preview ? { preview } : {},
      };
    }
    case "delete-project-note": {
      return {
        ...base,
        labelKey: "queuedItemProjectNoteDelete",
        labelValues: {},
      };
    }
    case "pin-project-note": {
      const pinned = Boolean(body.pinned);
      return {
        ...base,
        labelKey: pinned ? "queuedItemProjectNotePin" : "queuedItemProjectNoteUnpin",
        labelValues: {},
      };
    }
    default:
      return {
        ...base,
        labelKey: "queuedItemGeneric",
        labelValues: {},
      };
  }
}

export function describeQueuedInspection(record: PendingInspection): QueuedUploadItem {
  const template = asRecord(record.templateSnapshot);
  const formName = truncate(String(template.name ?? UNKNOWN_INSPECTION_FORM_NAME));
  const formLevel = resolveQueuedInspectionFormLevel(record, template);
  const location = formatQueuedInspectionLocation(record, formLevel);
  const categoryKey = inspectionCategoryKey(record, template);
  const outcomeKey = inspectionOutcomeKey(record.outcome);
  const levelKey = inspectionLevelKey(formLevel);

  const detailValues = {
    level: levelKey,
    category: categoryKey,
    outcome: outcomeKey,
    ...(location ? { location } : {}),
  };

  const detailKey = location
    ? "queuedItemInspectionDetailWithLocation"
    : "queuedItemInspectionDetail";

  return {
    id: record.localId,
    queuedAt: new Date(record.submittedAt).getTime(),
    source: "inspection" as const,
    labelKey: "queuedItemInspectionTitle",
    labelValues: { formName },
    detailKey,
    detailValues,
    ...(record.lastSyncError ? { lastSyncError: record.lastSyncError } : {}),
  };
}

/** All queued uploads (mutations + inspections), oldest first. */
export async function getQueuedUploadItems(): Promise<QueuedUploadItem[]> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return [];

  const [mutations, inspections] = await Promise.all([
    getPendingMutations().catch(() => [] as QueuedMutation[]),
    getAllPending().catch(() => [] as PendingInspection[]),
  ]);

  return [
    ...mutations.map(describeQueuedMutation),
    ...inspections.map(describeQueuedInspection),
  ].sort((a, b) => a.queuedAt - b.queuedAt);
}

/** Remove a stuck queued upload (inspection or mutation). */
export async function discardQueuedUploadItem(item: QueuedUploadItem): Promise<boolean> {
  if (item.source === "inspection") {
    const { discardInspection, getPendingInspectionCount } = await import(
      "@/lib/inspections/inspectionOfflineDb"
    );
    const { INSPECTIONS_PENDING_COUNT_EVENT } = await import("@/lib/inspections/useInspectionSync");
    await discardInspection(item.id);
    if (typeof window !== "undefined") {
      const count = await getPendingInspectionCount().catch(() => 0);
      window.dispatchEvent(new CustomEvent(INSPECTIONS_PENDING_COUNT_EVENT, { detail: { count } }));
      window.dispatchEvent(new CustomEvent("inspections:updated"));
    }
    return true;
  }

  if (item.source === "mutation") {
    const { discardMutation } = await import("@/lib/offline/mutation-queue");
    const { OFFLINE_SYNC_COMPLETE_EVENT } = await import("@/lib/offline/events");
    const ok = await discardMutation(item.id);
    if (ok && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT));
    }
    return ok;
  }

  return false;
}

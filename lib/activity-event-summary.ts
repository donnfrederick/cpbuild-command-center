/** Activity card / export description text — actor name lives in the footer / User column only. */

import {
  isLegacySubcontractorUpmEvent,
  upmChangedFieldsWithoutSubcontractor,
} from "@/lib/activity-event-display";
import { buildSubcontractorActivitySummary } from "@/lib/activity-subcontractor-summary";
import { activityScopeDescriptionText, scopeNameInLocationChip } from "@/lib/activity-unit-chip";
import { combinedOptionDisplay } from "@/lib/scope-combined-options";
import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";
import {
  INSPECTION_SYNC_FAILED_DEFAULT_MESSAGE,
  UNKNOWN_INSPECTION_FORM_NAME,
} from "@/lib/activity/inspection-sync-failure-labels";
import { MUTATION_SYNC_FAILED_DEFAULT_MESSAGE } from "@/lib/activity/mutation-sync-failure-labels";
import { mutationActivityTypeLabel } from "@/lib/offline/mutation-activity-label";
import type { MutationType } from "@/lib/offline/mutation-queue";
import { appendOfflineCacheReplaySuffix } from "@/lib/activity/offline-replay-display";

export interface ActivityEventDescriptionInput {
  eventType: string;
  metadata: Record<string, unknown>;
  /** Activity row timestamp — used when offlineCacheDurationMs is not yet persisted. */
  createdAt?: string;
}

/** Human-readable scope status (e.g. Install Complete-Verified vs Complete-Unverified). */
function formatScopeStatusLabel(
  stage: string | null | undefined,
  status: string | null | undefined,
): string {
  if (!stage && !status) return "";
  if (!stage || !status) {
    return [stage, status].filter(Boolean).join(" / ");
  }
  return combinedOptionDisplay(stage as ScopeStage, status as ScopeStatus).label;
}

export function buildActivityEventDescription(event: ActivityEventDescriptionInput): string {
  const description = describeActivityEvent(event);
  return appendOfflineCacheReplaySuffix(description, event.metadata, event.createdAt);
}

function describeActivityEvent(event: ActivityEventDescriptionInput): string {
  const m = event.metadata;

  switch (event.eventType) {
    case "SCOPE_STATUS_UPDATED": {
      const from = formatScopeStatusLabel(m.fromStage as string | null, m.fromStatus as string | null);
      const to = formatScopeStatusLabel(m.toStage as string | null, m.toStatus as string | null) || "unknown";
      const fromLabel = from || "unset";
      return `Updated from ${fromLabel} status → ${to}`;
    }
    case "SCOPE_STATUS_BULK_UPDATED": {
      const count = m.count as number;
      const dest = formatScopeStatusLabel(
        m.scopeStage as string | null,
        m.scopeStatus as string | null,
      ) || "unknown";
      return `Bulk-updated ${count} scope${count !== 1 ? "s" : ""} → ${dest}`;
    }
    case "SCOPE_STATUS_BULK_UNDONE": {
      const count = m.count as number;
      return `Undid a bulk status update for ${count} scope${count !== 1 ? "s" : ""}`;
    }
    case "SCOPE_INSPECTION_BULK_UPDATED": {
      const count = m.count as number;
      const status = (m.inspectionStatus as string | null) ?? "cleared";
      return `Bulk-updated inspection status for ${count} scope${count !== 1 ? "s" : ""} → ${status}`;
    }
    case "SCOPE_INSPECTION_UPDATED": {
      const scope = activityScopeDescriptionText(m);
      const from = (m.fromInspectionStatus as string | null) ?? "unset";
      const to = (m.toInspectionStatus as string | null) ?? "unset";
      return scope
        ? `Updated ${scope} inspection: ${from} → ${to}`
        : `Updated inspection: ${from} → ${to}`;
    }
    case "ISSUE_CREATED": {
      const blocking = m.isBlockingWork ? " · blocking" : "";
      return `Reported "${m.shortDescription}"${blocking}`;
    }
    case "ISSUE_BULK_CREATED": {
      const count = m.count as number;
      const blocking = m.isBlockingWork ? " · blocking" : "";
      return `Reported "${m.shortDescription}" on ${count} unit${count !== 1 ? "s" : ""}${blocking}`;
    }
    case "ISSUE_UPDATED": {
      const changed = Array.isArray(m.changedFields) ? ` (${(m.changedFields as string[]).join(", ")})` : "";
      return `Updated issue "${m.shortDescription}"${changed}`;
    }
    case "ISSUE_DELETED":
      return `Deleted issue "${m.shortDescription}"`;
    case "ISSUE_RESOLVED":
      return `Resolved "${m.shortDescription}"`;
    case "ISSUE_REOPENED":
      return `Reopened "${m.shortDescription}"`;
    case "ISSUE_ANNOTATION_UPDATED": {
      const description = (m.shortDescription as string) || "";
      return description
        ? `Updated image markup on issue "${description}"`
        : "Updated image markup on an issue";
    }
    case "CLEAR_INSPECTION_SET": {
      const scope = activityScopeDescriptionText(m);
      return scope
        ? `Set ${scope} — Inspection ${m.status as string}`
        : `Set inspection — ${m.status as string}`;
    }
    case "CLEAR_INSPECTION_DELETED": {
      const scope = activityScopeDescriptionText(m);
      return scope
        ? `Deleted ${scope} clear inspection (${m.status as string})`
        : `Deleted clear inspection (${m.status as string})`;
    }
    case "INSPECTION_BACKFILL_SET": {
      const scope = activityScopeDescriptionText(m);
      return scope
        ? `Backfilled ${scope} inspection → ${m.status as string}`
        : `Backfilled inspection → ${m.status as string}`;
    }
    case "INSPECTION_BACKFILL_DELETED": {
      const scope = activityScopeDescriptionText(m);
      return scope
        ? `Removed backfilled inspection for ${scope}`
        : "Removed backfilled inspection";
    }
    case "INSPECTION_SUBMITTED": {
      const formName = (m.formName as string) || "inspection";
      const outcome = m.outcome as string;
      const attempt = m.attemptNumber as number;
      const isEdit = m.isEdit as boolean;
      const category = m.category as string | undefined;
      const scopeName = m.scopeName as string | undefined;
      const totalDeficiencyCount =
        typeof m.totalDeficiencyCount === "number"
          ? m.totalDeficiencyCount
          : (m.deficiencyCount as number) || 0;
      const failedQuestionCount =
        typeof m.failedQuestionCount === "number" ? m.failedQuestionCount : null;
      const ordinal = attempt === 1 ? "1st" : attempt === 2 ? "2nd" : attempt === 3 ? "3rd" : `${attempt}th`;
      const outcomeLabel =
        outcome === "PASS" ? "Passed" : outcome === "FAIL" ? "Failed" : "Complete";
      const verb = isEdit ? "Edited" : "Submitted";
      const scopeLabel =
        scopeName && !scopeNameInLocationChip(m) ? ` · ${scopeName}` : "";
      const isCalibration = category === "CALIBRATION_INSPECTION";
      const calibrationPrefix = isCalibration ? "Calibration — " : "";
      const failureDetails =
        outcome === "FAIL"
          ? [
              failedQuestionCount !== null
                ? `${failedQuestionCount} failed ${failedQuestionCount === 1 ? "question" : "questions"}`
                : null,
              totalDeficiencyCount > 0 || failedQuestionCount !== null
                ? `${totalDeficiencyCount} total ${totalDeficiencyCount === 1 ? "deficiency" : "deficiencies"}`
                : null,
            ].filter(Boolean).join(" · ")
          : "";
      const failureLabel = failureDetails ? ` · ${failureDetails}` : "";
      const suffix = isCalibration ? " (calibration)" : ` (${ordinal} attempt)`;
      return `${verb} ${calibrationPrefix}${formName}${scopeLabel} — ${outcomeLabel}${failureLabel}${suffix}`;
    }
    case "INSPECTION_SYNC_FAILED": {
      const formName = (m.formName as string) || UNKNOWN_INSPECTION_FORM_NAME;
      const category = m.category as string | undefined;
      const errorMessage = (m.errorMessage as string) || INSPECTION_SYNC_FAILED_DEFAULT_MESSAGE;
      const httpStatus = typeof m.httpStatus === "number" ? m.httpStatus : null;
      const syncAttempts = typeof m.syncAttempts === "number" ? m.syncAttempts : 0;
      const scopeName = m.scopeName as string | undefined;
      const scopeLabel =
        scopeName && !scopeNameInLocationChip(m) ? ` · ${scopeName}` : "";
      const isCalibration = category === "CALIBRATION_INSPECTION";
      const calibrationPrefix = isCalibration ? "Calibration sync failed — " : "Inspection sync failed — ";
      const httpSuffix = httpStatus ? ` (HTTP ${httpStatus})` : "";
      const attemptsSuffix = syncAttempts > 1 ? ` · ${syncAttempts} attempts` : "";
      return `${calibrationPrefix}${formName}${scopeLabel} — ${errorMessage}${httpSuffix}${attemptsSuffix}`;
    }
    case "MUTATION_SYNC_FAILED": {
      const itemSummary = (m.itemSummary as string) || "Queued change";
      const mutationType = m.mutationType as MutationType | undefined;
      const typeLabel = mutationType ? mutationActivityTypeLabel(mutationType) : "Change";
      const errorMessage = (m.errorMessage as string) || MUTATION_SYNC_FAILED_DEFAULT_MESSAGE;
      const httpStatus = typeof m.httpStatus === "number" ? m.httpStatus : null;
      const syncAttempts = typeof m.syncAttempts === "number" ? m.syncAttempts : 0;
      const httpSuffix = httpStatus ? ` (HTTP ${httpStatus})` : "";
      const attemptsSuffix = syncAttempts > 1 ? ` · ${syncAttempts} attempts` : "";
      return `${typeLabel} upload failed — ${itemSummary} — ${errorMessage}${httpSuffix}${attemptsSuffix}`;
    }
    case "OBSERVATION_CREATED": {
      const type = (m.observationType as string).replace(/_/g, " ").toLowerCase();
      const title = (m.title as string) || "";
      return title ? `Added ${type} observation: "${title}"` : `Added a ${type} observation`;
    }
    case "OBSERVATION_BULK_CREATED": {
      const count = m.count as number;
      const type = ((m.observationType as string) || "observation").replace(/_/g, " ").toLowerCase();
      const title = (m.title as string) || "";
      return `Added ${count} ${type} observation${count !== 1 ? "s" : ""}${title ? `: "${title}"` : ""}`;
    }
    case "OBSERVATION_UPDATED": {
      const title = (m.title as string) || "";
      return title ? `Updated observation "${title}"` : "Updated an observation";
    }
    case "OBSERVATION_IMAGE_VERSION_ADDED": {
      const title = (m.title as string) || "";
      return title ? `Saved a new marked image version on "${title}"` : "Saved a new marked image version";
    }
    case "OBSERVATION_ANNOTATION_UPDATED": {
      const title = (m.title as string) || "";
      return title ? `Updated image markup on "${title}"` : "Updated image markup on an observation";
    }
    case "UNIT_ROW_CREATED": {
      const count = m.count as number;
      return `Added ${count} Location Builder row${count !== 1 ? "s" : ""} (${m.mode as string})`;
    }
    case "UNIT_ROW_DELETED": {
      const scope = activityScopeDescriptionText(m);
      return scope ? `Deleted Location Builder row for ${scope}` : "Deleted Location Builder row";
    }
    case "UNIT_ROWS_BULK_DELETED": {
      const count = m.count as number;
      return `Deleted ${count} Location Builder row${count !== 1 ? "s" : ""}`;
    }
    case "UNIT_INSTALLER_BULK_UPDATED": {
      const count = m.count as number;
      const installer = (m.installerName as string | null) ?? (m.unifierSubId as string | null) ?? "Unassigned";
      return `Updated installer for ${count} row${count !== 1 ? "s" : ""} → ${installer}`;
    }
    case "SCOPE_SUBCONTRACTOR_UPDATED":
      return buildSubcontractorActivitySummary(m);
    case "UPM_ROW_UPDATED": {
      if (isLegacySubcontractorUpmEvent("UPM_ROW_UPDATED", m)) {
        return buildSubcontractorActivitySummary(m);
      }
      const scope = activityScopeDescriptionText(m, "row");
      const changed = upmChangedFieldsWithoutSubcontractor(m).join(", ");
      const changedSuffix = changed ? ` (${changed})` : "";
      return scope
        ? `Updated Location Builder ${scope}${changedSuffix}`
        : `Updated Location Builder${changedSuffix}`;
    }
    case "SUB_SCOPE_INSTANCE_UPDATED": {
      const scope = activityScopeDescriptionText(m, "sub-scope");
      const changed = Array.isArray(m.changedFields) ? ` (${(m.changedFields as string[]).join(", ")})` : "";
      return scope ? `Updated ${scope}${changed}` : `Updated sub-scope${changed}`;
    }
    case "UNIT_PHOTO_UPLOADED": {
      const sourceLabel = (m.sourceLabel as string | null) ?? null;
      if (m.sourceType === "status_update" && sourceLabel) {
        return `Uploaded status photo (${sourceLabel})`;
      }
      return "Uploaded unit photo";
    }
    case "FIELD_MEDIA_UPLOAD_RATE_LIMITED": {
      const windowKey = m.windowKey as string;
      const windowLabel = windowKey === "per_ten_minute" ? "10-minute window" : "1-minute window";
      const count = m.count as number;
      const limit = m.limit as number;
      const uploadType = (m.uploadType as string) || "";
      return `Field media rate limit (${windowLabel}): ${count}/${limit} ${uploadType}`.trim();
    }
    case "PROJECT_CLONED_AS_TEST": {
      const counts = m.counts as { rows?: number } | undefined;
      const rows = counts?.rows ?? 0;
      return `Cloned this project as a test sandbox (${rows} row${rows !== 1 ? "s" : ""})`;
    }
    case "CUSTOM_SITE_LOCATION_CREATED": {
      const name = (m.name as string) || "custom location";
      return `Added custom site location "${name}"`;
    }
    case "CUSTOM_SITE_LOCATION_DELETED": {
      const name = (m.name as string) || "custom location";
      return `Removed custom site location "${name}"`;
    }
    case "CUSTOM_SITE_LOCATION_UPDATED": {
      const name = (m.name as string) || "custom location";
      const previousName = m.previousName as string | undefined;
      if (previousName && previousName !== name) {
        return `Renamed custom site location "${previousName}" to "${name}"`;
      }
      return `Updated custom site location "${name}"`;
    }
    case "PROJECT_TEST_DATA_SEEDED": {
      const counts = m.counts as
        | { issues?: number; observations?: number; clearInspections?: number; calibrations?: number }
        | undefined;
      const issues = counts?.issues ?? 0;
      const observations = counts?.observations ?? 0;
      const clearInspections = counts?.clearInspections ?? 0;
      const calibrations = counts?.calibrations ?? 0;
      const calPart =
        calibrations > 0
          ? `, ${calibrations} calibration${calibrations !== 1 ? "s" : ""}`
          : "";
      return `Seeded test data: ${issues} issue${issues !== 1 ? "s" : ""}, ${observations} observation${observations !== 1 ? "s" : ""}, ${clearInspections} clear inspection scope${clearInspections !== 1 ? "s" : ""}${calPart}`;
    }
    case "PROJECT_TEST_DATA_BATCH_REMOVED": {
      const counts = m.counts as
        | { issues?: number; observations?: number; clearInspections?: number; calibrations?: number }
        | undefined;
      const issues = counts?.issues ?? 0;
      const observations = counts?.observations ?? 0;
      const clearInspections = counts?.clearInspections ?? 0;
      const calibrations = counts?.calibrations ?? 0;
      const calPart =
        calibrations > 0
          ? `, ${calibrations} calibration${calibrations !== 1 ? "s" : ""}`
          : "";
      return `Removed a test data batch (${issues} issue${issues !== 1 ? "s" : ""}, ${observations} observation${observations !== 1 ? "s" : ""}, ${clearInspections} clear inspection scope${clearInspections !== 1 ? "s" : ""}${calPart})`;
    }
    case "FIELD_DAILY_DAILY_MANPOWER_SET": {
      const reportDate = (m.reportDate as string) || "report day";
      const dailyManpower = m.dailyManpower as number | null | undefined;
      const previousDailyManpower = m.previousDailyManpower as number | null | undefined;
      if (dailyManpower == null) {
        return `Cleared daily manpower for field daily report ${reportDate}`;
      }
      if (previousDailyManpower == null) {
        return `Set daily manpower to ${dailyManpower} for field daily report ${reportDate}`;
      }
      if (previousDailyManpower === dailyManpower) {
        return `Set daily manpower to ${dailyManpower} for field daily report ${reportDate}`;
      }
      return `Updated daily manpower from ${previousDailyManpower} to ${dailyManpower} for field daily report ${reportDate}`;
    }
    default:
      return "Performed an action";
  }
}

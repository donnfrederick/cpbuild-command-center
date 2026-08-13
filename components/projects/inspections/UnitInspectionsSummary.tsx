"use client";

/**
 * UnitInspectionsSummary — unit modal accordion content.
 *
 * Flat chronological list of every inspection on this unit (all scope-level
 * types plus unit-level submissions). Each row shows scope, type chip,
 * pass/fail, attempt ordinal, and relative time. Type + outcome drive
 * distinct accent colors (not just clear-inspection green).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  listByScope,
  listByUnit,
  type InspectionSubmission,
} from "@/lib/inspections/submissionsApi";
import type { ScopeRow } from "@/components/projects/UnitCards";
import { InspectionFillOverlay } from "./InspectionFillOverlay";
import { describeOutcome, formatRelativeTime, ordinal } from "./inspectionSummary";
import { isDocumentationSubmission } from "@/lib/forms/form-purpose-rules";
import {
  describeCategoryAbbrev,
  describeCategoryLabel,
  inspectionHistoryRowModifiers,
  inspectionTypeChipModifier,
  submissionOutcomeIsFail,
  submissionOutcomeIsPass,
  scopeInspectionRetryEligible,
} from "@/lib/inspections/scope-inspection-display";
import {
  canAuthorEditInspectionSubmission,
  isMostRecentFormAttempt,
} from "@/lib/inspections/submission-edit-eligibility";
import {
  canReclassifyClearSubmissionToCalibration,
  findDefaultCalibratedAgainstSubmissionId,
} from "@/lib/inspections/reclassify-submission-calibration-eligibility";
import { reclassifySubmissionToCalibration } from "@/lib/inspections/submissionsApi";
import { toast } from "sonner";

interface ScopeInspectionState {
  scope: ScopeRow;
  submissions: InspectionSubmission[];
}

export interface FlatInspectionItem {
  sub: InspectionSubmission;
  scope: ScopeRow | null;
  isMostRecentForScopeAndType: boolean;
  attemptNumber: number;
}

function categoryKeyForAttempt(sub: InspectionSubmission): string {
  if (sub.source === "BACKFILL") return "BACKFILL";
  return sub.categorySnapshot ?? "OTHER";
}

/** Exported for unit tests. */
export function buildFlatInspectionList(
  scopeStates: ScopeInspectionState[],
  unitSubmissions: InspectionSubmission[] = [],
): FlatInspectionItem[] {
  const scopeById = new Map(scopeStates.map((s) => [s.scope.id, s.scope]));
  const seenIds = new Set<string>();
  const pairs: { sub: InspectionSubmission; scope: ScopeRow | null }[] = [];

  for (const { scope, submissions } of scopeStates) {
    for (const sub of submissions) {
      seenIds.add(sub.id);
      pairs.push({ sub, scope });
    }
  }

  for (const sub of unitSubmissions) {
    if (seenIds.has(sub.id)) continue;
    const scope = sub.scopeRowId ? scopeById.get(sub.scopeRowId) ?? null : null;
    pairs.push({ sub, scope });
  }

  pairs.sort(
    (a, b) =>
      new Date(b.sub.submittedAt).getTime() - new Date(a.sub.submittedAt).getTime(),
  );

  const countByScopeType = new Map<string, number>();
  for (const { sub, scope } of pairs) {
    const key = `${scope?.id ?? "unit"}:${categoryKeyForAttempt(sub)}`;
    countByScopeType.set(key, (countByScopeType.get(key) ?? 0) + 1);
  }

  const indexByScopeType = new Map<string, number>();
  const seenMostRecent = new Set<string>();

  return pairs.map(({ sub, scope }) => {
    const typeKey = `${scope?.id ?? "unit"}:${categoryKeyForAttempt(sub)}`;
    const total = countByScopeType.get(typeKey) ?? 1;
    const idx = indexByScopeType.get(typeKey) ?? 0;
    const attemptNumber = total - idx;
    indexByScopeType.set(typeKey, idx + 1);

    const isMostRecentForScopeAndType = !seenMostRecent.has(typeKey);
    seenMostRecent.add(typeKey);

    return { sub, scope, isMostRecentForScopeAndType, attemptNumber };
  });
}

/** Submissions on the same scope row — used for reclassify eligibility. */
export function submissionsForScope(
  items: FlatInspectionItem[],
  scopeRowId: string | undefined,
): InspectionSubmission[] {
  if (!scopeRowId) return [];
  return items.filter((item) => item.scope?.id === scopeRowId).map((item) => item.sub);
}

function AttemptRow({
  item,
  isFirst,
  canManageStatus,
  onReview,
  onRetry,
}: {
  item: FlatInspectionItem;
  isFirst: boolean;
  canManageStatus: boolean;
  onReview: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations("inspections");
  const isDocumentation = isDocumentationSubmission(item.sub);
  const isFail = !isDocumentation && submissionOutcomeIsFail(item.sub);
  const isPass = !isDocumentation && submissionOutcomeIsPass(item.sub);
  const isCalibration = item.sub.categorySnapshot === "CALIBRATION_INSPECTION";

  const canRetry =
    item.isMostRecentForScopeAndType &&
    scopeInspectionRetryEligible(item.sub, canManageStatus);

  const typeAbbrev = describeCategoryAbbrev(item.sub);
  const typeLabel = describeCategoryLabel(item.sub);

  const scopeName = item.scope
    ? item.scope.scopeType?.canonicalScopeType?.displayName ??
      item.scope.scopeType?.name ??
      item.scope.description ??
      item.sub.formNameSnapshot
    : item.sub.formNameSnapshot ||
      (typeLabel !== "Other" ? typeLabel : t("unitLevelInspectionScope"));

  const outcomeLabel = isDocumentation
    ? t("documentationSubmittedLabel")
    : isPass
      ? t("passLabel")
      : isFail
        ? t("failLabel")
        : describeOutcome(item.sub, item.attemptNumber);

  const rowStateClass = inspectionHistoryRowModifiers(item.sub, {
    accent: item.isMostRecentForScopeAndType,
  });
  const chipModifier = inspectionTypeChipModifier(item.sub);

  const rowContent = (
    <div className="inspection-history-row__content">
      <p className="inspection-history-row__scope">{scopeName}</p>
      <div className="inspection-history-row__meta">
        <span
          className={`inspection-history-row__type-chip inspection-history-row__type-chip--${chipModifier}`}
          title={typeLabel}
        >
          {typeAbbrev}
        </span>
        <span className="inspection-history-row__dot">·</span>
        <span
          className={
            isFail
              ? "inspection-history-row__outcome--fail"
              : isPass
                ? "inspection-history-row__outcome--pass"
                : ""
          }
        >
          {outcomeLabel}
        </span>
        {!isCalibration && (
          <>
            <span className="inspection-history-row__dot">·</span>
            <span>
              {t("historyAttemptLabel", { ordinal: ordinal(item.attemptNumber) })}
            </span>
          </>
        )}
        {isCalibration && (
          <>
            <span className="inspection-history-row__dot">·</span>
            <span className="inspection-history-row__calibration">{t("calibrationBadge")}</span>
          </>
        )}
        <span className="inspection-history-row__dot">·</span>
        <span>{formatRelativeTime(item.sub.submittedAt)}</span>
      </div>
    </div>
  );

  const viewPill = (
    <span aria-hidden className="inspection-history-row__view">
      {t("scopeViewRecordAction")}
    </span>
  );

  if (canRetry) {
    return (
      <div
        className={`inspection-history-row inspection-history-row__split ${rowStateClass} inspection-history-row--retry ${isFirst ? "inspection-history-row--first" : ""}`}
      >
        <button
          type="button"
          onClick={onReview}
          aria-label={t("unitScopeAriaLabel", {
            scopeName,
            outcome: outcomeLabel,
            runLabel: t("runCountOne"),
          })}
          className="inspection-history-row__split-view"
        >
          {rowContent}
          {viewPill}
        </button>
        <div aria-hidden className="inspection-history-row__split-divider" />
        <button
          type="button"
          onClick={onRetry}
          aria-label={t("scopeRetryAria")}
          className="inspection-history-row__retry"
        >
          {t("scopeRetryAction")} ›
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onReview}
      aria-label={t("unitScopeAriaLabel", {
        scopeName,
        outcome: `${typeAbbrev} ${outcomeLabel}`,
        runLabel: t("runCountOne"),
      })}
      className={`inspection-history-row ${rowStateClass} ${isFirst ? "inspection-history-row--first" : ""}`}
    >
      {rowContent}
      {viewPill}
    </button>
  );
}

export interface SingleInspectionItem {
  sub: InspectionSubmission;
  scope: ScopeRow;
  attemptNumber: number;
}

export function UnitInspectionsSummary({
  scopes,
  projectId,
  unitId,
  locationParts,
  canManageStatus,
  canCalibrate = false,
  currentUserId,
  onCountChange,
  onSingleItem,
}: {
  scopes: ScopeRow[];
  projectId: string;
  unitId: string;
  locationParts?: { building?: string | null; level?: string | null; unit?: string | null };
  canManageStatus: boolean;
  canCalibrate?: boolean;
  currentUserId?: string;
  onCountChange?: (count: number) => void;
  onSingleItem?: (item: SingleInspectionItem | null) => void;
}) {
  const t = useTranslations("inspections");
  const [items, setItems] = useState<FlatInspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReview, setActiveReview] = useState<{
    sub: InspectionSubmission;
    scope: ScopeRow | null;
    attemptNumber: number;
  } | null>(null);
  const [activeRetry, setActiveRetry] = useState<{
    sub: InspectionSubmission;
    scope: ScopeRow | null;
    attemptNumber: number;
  } | null>(null);
  const [activeEdit, setActiveEdit] = useState<{
    sub: InspectionSubmission;
    scope: ScopeRow | null;
  } | null>(null);
  const [reclassifyingSubmissionId, setReclassifyingSubmissionId] = useState<string | null>(null);

  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadStates = useCallback(
    async (isInitial = false) => {
      if (!mountedRef.current) return;

      const [scopeResults, unitSubmissions] = await Promise.all([
        Promise.all(
          scopes.map(async (scope) => {
            try {
              const submissions = await listByScope(scope.id);
              return { scope, submissions };
            } catch {
              return { scope, submissions: [] as InspectionSubmission[] };
            }
          }),
        ),
        listByUnit(unitId, projectId).catch(() => [] as InspectionSubmission[]),
      ]);

      if (!mountedRef.current) return;

      const withSubmissions = scopeResults.filter((r) => r.submissions.length > 0);
      const flat = buildFlatInspectionList(withSubmissions, unitSubmissions);
      setItems(flat);

      const total = flat.length;
      onCountChange?.(total);

      if (total === 1) {
        const only = flat[0];
        if (only.scope) {
          onSingleItem?.({
            sub: only.sub,
            scope: only.scope,
            attemptNumber: only.attemptNumber,
          });
        } else {
          onSingleItem?.(null);
        }
      } else {
        onSingleItem?.(null);
      }

      if (isInitial) setLoading(false);
    },
    [scopes, unitId, projectId, onCountChange, onSingleItem],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadStates(true);
      } catch {
        setLoading(false);
      }
    })();
  }, [loadStates]);

  useEffect(() => {
    function handleUpdate(e: Event) {
      const detail = (e as CustomEvent<{ unitId: string }>).detail;
      if (detail.unitId !== unitId) return;
      loadStates().catch(() => {});
    }
    window.addEventListener("inspections:updated", handleUpdate);
    return () => window.removeEventListener("inspections:updated", handleUpdate);
  }, [unitId, loadStates]);

  const canReclassifySubmission = useCallback(
    (submission: InspectionSubmission, scopeRowId: string | undefined) =>
      canCalibrate &&
      canReclassifyClearSubmissionToCalibration(
        submission,
        submissionsForScope(items, scopeRowId),
      ),
    [canCalibrate, items],
  );

  const reclassifySubmission = useCallback(
    async (submission: InspectionSubmission, scopeRowId: string | undefined) => {
      const scopeSubs = submissionsForScope(items, scopeRowId);
      if (submission._pendingSync) {
        toast.error(t("reclassifyToCalibrationPendingSync"));
        return;
      }
      if (!canCalibrate) {
        toast.error(t("reclassifyToCalibrationError"));
        return;
      }
      if (!canReclassifyClearSubmissionToCalibration(submission, scopeSubs)) {
        const hasOtherClear =
          findDefaultCalibratedAgainstSubmissionId(submission.id, scopeSubs) != null;
        toast.error(
          hasOtherClear
            ? t("reclassifyToCalibrationError")
            : t("reclassifyToCalibrationNeedsOtherClear"),
        );
        return;
      }
      const calibratedAgainstSubmissionId = findDefaultCalibratedAgainstSubmissionId(
        submission.id,
        scopeSubs,
      );
      if (!calibratedAgainstSubmissionId) {
        toast.error(t("reclassifyToCalibrationNeedsOtherClear"));
        return;
      }
      if (!window.confirm(t("reclassifyToCalibrationConfirm"))) {
        return;
      }
      setReclassifyingSubmissionId(submission.id);
      try {
        await reclassifySubmissionToCalibration(submission.id, calibratedAgainstSubmissionId);
        toast.success(t("reclassifyToCalibrationSuccess"));
        setActiveReview(null);
        setActiveEdit(null);
        await loadStates();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("reclassifyToCalibrationError"),
        );
      } finally {
        setReclassifyingSubmissionId(null);
      }
    },
    [canCalibrate, items, loadStates, t],
  );

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              height: 44,
              borderRadius: 10,
              background:
                "linear-gradient(90deg, var(--neutral-100) 25%, var(--neutral-200) 50%, var(--neutral-100) 75%)",
              backgroundSize: "200% 100%",
              animation: "inspections-shimmer 1.4s ease-in-out infinite",
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
        <style>{`
          @keyframes inspections-shimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--neutral-400)",
          fontStyle: "italic",
          padding: "4px 0 2px",
        }}
      >
        {t("unitNoInspections")}
      </p>
    );
  }

  return (
    <>
      <div className="inspection-history-group">
        <div className="inspection-history-list inspection-history-list--flat">
          {items.map((item, idx) => (
            <AttemptRow
              key={item.sub.id}
              item={item}
              isFirst={idx === 0}
              canManageStatus={canManageStatus}
              onReview={() => {
                setActiveReview({
                  sub: item.sub,
                  scope: item.scope,
                  attemptNumber: item.attemptNumber,
                });
              }}
              onRetry={() => {
                setActiveRetry({
                  sub: item.sub,
                  scope: item.scope,
                  attemptNumber: item.attemptNumber + 1,
                });
              }}
            />
          ))}
        </div>
      </div>

      {activeReview && (
        <InspectionFillOverlay
          mode="readonly"
          submission={activeReview.sub}
          attemptNumber={activeReview.attemptNumber}
          scope={activeReview.scope ?? undefined}
          projectId={projectId}
          unitId={unitId}
          locationParts={locationParts}
          onEdit={
            canAuthorEditInspectionSubmission({
              submission: activeReview.sub,
              currentUserId,
              isMostRecentAttempt: isMostRecentFormAttempt(
                submissionsForScope(items, activeReview.scope?.id),
                activeReview.sub,
              ),
            })
              ? () => {
                  const { sub, scope } = activeReview;
                  setActiveReview(null);
                  setActiveEdit({ sub, scope });
                }
              : undefined
          }
          onClose={() => setActiveReview(null)}
        />
      )}

      {activeEdit && (
        <InspectionFillOverlay
          mode="edit"
          submission={activeEdit.sub}
          scope={activeEdit.scope ?? undefined}
          projectId={projectId}
          unitId={unitId}
          locationParts={locationParts}
          onSaved={() => {
            void loadStates();
          }}
          onReclassifyToCalibration={
            canReclassifySubmission(activeEdit.sub, activeEdit.scope?.id)
              ? () => void reclassifySubmission(activeEdit.sub, activeEdit.scope?.id)
              : undefined
          }
          reclassifyingToCalibration={reclassifyingSubmissionId === activeEdit.sub.id}
          onClose={() => setActiveEdit(null)}
        />
      )}

      {activeRetry && (
        <InspectionFillOverlay
          mode="retry"
          previousSubmission={activeRetry.sub}
          attemptNumber={activeRetry.attemptNumber}
          scope={activeRetry.scope ?? undefined}
          projectId={projectId}
          unitId={unitId}
          locationParts={locationParts}
          onSubmitted={() => loadStates().catch(() => {})}
          onClose={() => setActiveRetry(null)}
        />
      )}
    </>
  );
}

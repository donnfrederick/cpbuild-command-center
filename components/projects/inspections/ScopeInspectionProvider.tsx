"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { InspectionCategory } from "@/components/forms/formTypes";
import type { ScopeRow } from "@/components/projects/UnitCards";
import { InspectionFillOverlay } from "@/components/projects/inspections/InspectionFillOverlay";
import { ScopeInspectionSheet } from "@/components/projects/inspections/ScopeInspectionSheet";
import { BackfillModal } from "@/components/projects/inspections/ScopeInspectionBackfillModal";
import {
  isCalibrationSubmission,
  existingProcoreBackfillSubmission,
} from "@/lib/inspections/scope-inspection-display";
import {
  clearLocalScopeInspectionUpdates,
  localScopeUpdatesFromBackfillOutcome,
  localScopeUpdatesFromSubmission,
  type ScopeGridInspectionLocalUpdates,
} from "@/lib/inspections/scope-grid-inspection-display";
import { useScopeInspectionSubmissions } from "@/lib/inspections/useScopeInspectionSubmissions";
import { useProjectInspectionSubmissions } from "@/components/projects/inspections/ProjectInspectionSubmissionsContext";
import {
  resetInspectionCategory,
  reclassifySubmissionToCalibration,
  type InspectionSubmission,
} from "@/lib/inspections/submissionsApi";
import {
  canReclassifyClearSubmissionToCalibration,
  findDefaultCalibratedAgainstSubmissionId,
} from "@/lib/inspections/reclassify-submission-calibration-eligibility";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  canAuthorEditInspectionSubmission,
  isMostRecentFormAttempt,
} from "@/lib/inspections/submission-edit-eligibility";
import type { StoredForm } from "@/lib/forms/formsApi";

export interface ScopeInspectionContextValue {
  submissions: InspectionSubmission[];
  hydrated: boolean;
  refresh: () => void;
  nonCalibrationSubmissions: InspectionSubmission[];
  latestCalibration: InspectionSubmission | null;
  canBackfillHere: boolean;
  /** Show Set/Edit Procore inspection in menus (create when no form, edit when backfill exists). */
  canShowProcoreBackfill: boolean;
  existingBackfill: InspectionSubmission | null;
  canManageStatus: boolean;
  openPicker: (tab?: "picker" | "history") => void;
  openBackfill: () => void;
  openCalibrate: () => void;
  openReview: (sub: InspectionSubmission, attemptNumber: number) => void;
  openRetry: (sub: InspectionSubmission, attemptNumber: number) => void;
  openCalibrationReview: (sub: InspectionSubmission) => void;
  resetCategory: (category: InspectionCategory) => Promise<void>;
  ensureClearInspectionReady: () => Promise<boolean>;
  canCalibrate: boolean;
  canReclassifySubmission: (sub: InspectionSubmission) => boolean;
  reclassifySubmission: (sub: InspectionSubmission) => Promise<void>;
}

const ScopeInspectionContext = createContext<ScopeInspectionContextValue | null>(null);

export function useScopeInspection(): ScopeInspectionContextValue {
  const ctx = useContext(ScopeInspectionContext);
  if (!ctx) {
    throw new Error("useScopeInspection must be used within ScopeInspectionProvider");
  }
  return ctx;
}

export function ScopeInspectionProvider({
  scope,
  projectId,
  unitId,
  canManageStatus,
  canCalibrate = false,
  isAdmin = false,
  applyLocalScopeUpdates,
  patchScopeRow,
  locationParts,
  currentUserId,
  children,
}: {
  scope: ScopeRow;
  projectId: string;
  unitId: string;
  canManageStatus: boolean;
  canCalibrate?: boolean;
  isAdmin?: boolean;
  applyLocalScopeUpdates?: (updates: ScopeGridInspectionLocalUpdates) => void;
  patchScopeRow?: (
    updates: Partial<ScopeRow>,
    activityHints?: { subcontractorDisplayName?: string },
  ) => Promise<boolean>;
  locationParts?: { building?: string | null; level?: string | null; unit?: string | null };
  currentUserId?: string;
  children: ReactNode;
}) {
  const projectSubmissions = useProjectInspectionSubmissions();
  const tInsp = useTranslations("inspections");
  const { submissions, hydrated, refresh, setSubmissions } = useScopeInspectionSubmissions(
    scope.id,
    {
      scopeStage: scope.scopeStage,
      scopeStatus: scope.scopeStatus,
      inspectionStatus: scope.inspectionStatus,
      initialSubmissions: projectSubmissions,
      applyLocalScopeUpdates,
      patchScopeRow: patchScopeRow
        ? (updates) => patchScopeRow(updates)
        : undefined,
    },
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetInitialTab, setSheetInitialTab] = useState<"picker" | "history">("history");
  const [activeFill, setActiveFill] = useState<StoredForm | null>(null);
  const [activeReview, setActiveReview] = useState<{
    sub: InspectionSubmission;
    attemptNumber: number;
  } | null>(null);
  const [activeRetry, setActiveRetry] = useState<{
    sub: InspectionSubmission;
    attemptNumber: number;
  } | null>(null);
  const [activeEdit, setActiveEdit] = useState<{
    sub: InspectionSubmission;
  } | null>(null);
  const [activeCalibration, setActiveCalibration] = useState<{
    sub: InspectionSubmission;
  } | null>(null);
  const [activeCalibrationReview, setActiveCalibrationReview] = useState<{
    sub: InspectionSubmission;
  } | null>(null);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [reclassifyingSubmissionId, setReclassifyingSubmissionId] = useState<string | null>(null);

  const nonCalibrationSubmissions = useMemo(
    () => submissions.filter((sub) => !isCalibrationSubmission(sub)),
    [submissions],
  );

  const latestCalibration = useMemo(
    () => submissions.find((s) => isCalibrationSubmission(s)) ?? null,
    [submissions],
  );

  const hasFormSubmission = hydrated && nonCalibrationSubmissions.some((s) => s.source === "FORM");
  const existingBackfill = useMemo(
    () => existingProcoreBackfillSubmission(submissions),
    [submissions],
  );
  const canBackfillHere = canManageStatus && hydrated && !hasFormSubmission;
  /** Always offer Procore set/edit in status hub menus when the user can manage status. */
  const canShowProcoreBackfill = canManageStatus && hydrated;

  const ensureClearInspectionReady = useCallback(async (): Promise<boolean> => {
    if (!patchScopeRow) return true;
    return patchScopeRow({
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
    });
  }, [patchScopeRow]);

  const openPicker = useCallback((tab: "picker" | "history" = "picker") => {
    setSheetInitialTab(tab);
    setSheetOpen(true);
  }, []);

  const openBackfill = useCallback(() => setBackfillOpen(true), []);

  const openCalibrate = useCallback(() => {
    const latest = nonCalibrationSubmissions[0];
    if (latest) setActiveCalibration({ sub: latest });
  }, [nonCalibrationSubmissions]);

  const openReview = useCallback((sub: InspectionSubmission, attemptNumber: number) => {
    setActiveReview({ sub, attemptNumber });
  }, []);

  const openRetry = useCallback((sub: InspectionSubmission, attemptNumber: number) => {
    const proceed = () => setActiveRetry({ sub, attemptNumber });
    const needsInstallCompleteForRetry =
      sub.categorySnapshot === "CLEAR_INSPECTION" || sub.source === "BACKFILL";
    if (needsInstallCompleteForRetry) {
      void ensureClearInspectionReady().then((ok) => {
        if (ok) proceed();
      });
      return;
    }
    proceed();
  }, [ensureClearInspectionReady]);

  const openCalibrationReview = useCallback((sub: InspectionSubmission) => {
    setActiveCalibrationReview({ sub });
  }, []);

  const resetCategory = useCallback(
    async (category: InspectionCategory) => {
      if (!isAdmin) return;
      await resetInspectionCategory(projectId, scope.id, category);
      refresh();
    },
    [isAdmin, projectId, scope.id, refresh],
  );

  const onSubmitted = useCallback(
    (newSub: InspectionSubmission, syncPromise: Promise<boolean>) => {
      startTransition(() => setSubmissions((prev) => [newSub, ...prev]));
      const localUpdates = localScopeUpdatesFromSubmission(newSub);
      if (localUpdates) {
        applyLocalScopeUpdates?.(localUpdates);
      }
      void syncPromise.then(() => refresh()).catch(() => {
        refresh();
      });
    },
    [applyLocalScopeUpdates, setSubmissions, refresh],
  );

  const locationLabel = locationParts
    ? [
        locationParts.building?.trim() ? `Bldg ${locationParts.building.trim()}` : null,
        locationParts.level?.trim() ? `Level ${locationParts.level.trim()}` : null,
        locationParts.unit?.trim() ? `Unit ${locationParts.unit.trim()}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined
    : undefined;

  const canEditSubmission = useCallback(
    (sub: InspectionSubmission) =>
      canAuthorEditInspectionSubmission({
        submission: sub,
        currentUserId,
        isMostRecentAttempt: isMostRecentFormAttempt(submissions, sub),
      }),
    [currentUserId, submissions],
  );

  const onEditSaved = useCallback(
    (updated: InspectionSubmission) => {
      startTransition(() => {
        setSubmissions((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s)),
        );
      });
      refresh();
    },
    [refresh, setSubmissions],
  );

  const canReclassifySubmission = useCallback(
    (submission: InspectionSubmission) =>
      canCalibrate && canReclassifyClearSubmissionToCalibration(submission, submissions),
    [canCalibrate, submissions],
  );

  const reclassifySubmission = useCallback(
    async (submission: InspectionSubmission) => {
      if (submission._pendingSync) {
        toast.error(tInsp("reclassifyToCalibrationPendingSync"));
        return;
      }
      if (!canCalibrate) {
        toast.error(tInsp("reclassifyToCalibrationError"));
        return;
      }
      if (!canReclassifyClearSubmissionToCalibration(submission, submissions)) {
        const hasOtherClear =
          findDefaultCalibratedAgainstSubmissionId(submission.id, submissions) != null;
        toast.error(
          hasOtherClear
            ? tInsp("reclassifyToCalibrationError")
            : tInsp("reclassifyToCalibrationNeedsOtherClear"),
        );
        return;
      }
      const calibratedAgainstSubmissionId = findDefaultCalibratedAgainstSubmissionId(
        submission.id,
        submissions,
      );
      if (!calibratedAgainstSubmissionId) {
        toast.error(tInsp("reclassifyToCalibrationNeedsOtherClear"));
        return;
      }
      if (!window.confirm(tInsp("reclassifyToCalibrationConfirm"))) {
        return;
      }
      setReclassifyingSubmissionId(submission.id);
      try {
        await reclassifySubmissionToCalibration(submission.id, calibratedAgainstSubmissionId);
        toast.success(tInsp("reclassifyToCalibrationSuccess"));
        setActiveReview(null);
        setActiveEdit(null);
        refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : tInsp("reclassifyToCalibrationError"),
        );
      } finally {
        setReclassifyingSubmissionId(null);
      }
    },
    [canCalibrate, refresh, submissions, tInsp],
  );

  const value = useMemo<ScopeInspectionContextValue>(
    () => ({
      submissions,
      hydrated,
      refresh,
      nonCalibrationSubmissions,
      latestCalibration,
      canBackfillHere,
      canShowProcoreBackfill,
      existingBackfill,
      canManageStatus,
      openPicker,
      openBackfill,
      openCalibrate: canCalibrate ? openCalibrate : () => {},
      openReview,
      openRetry,
      openCalibrationReview,
      resetCategory,
      ensureClearInspectionReady,
      canCalibrate,
      canReclassifySubmission,
      reclassifySubmission,
    }),
    [
      submissions,
      hydrated,
      refresh,
      nonCalibrationSubmissions,
      latestCalibration,
      canBackfillHere,
      canShowProcoreBackfill,
      existingBackfill,
      canManageStatus,
      openPicker,
      openBackfill,
      canCalibrate,
      openCalibrate,
      openReview,
      openRetry,
      openCalibrationReview,
      resetCategory,
      ensureClearInspectionReady,
      canReclassifySubmission,
      reclassifySubmission,
    ],
  );

  return (
    <ScopeInspectionContext.Provider value={value}>
      {children}

      {sheetOpen && (
        <ScopeInspectionSheet
          projectId={projectId}
          unitId={unitId}
          scope={scope}
          submissions={submissions}
          canManageStatus={canManageStatus}
          patchScopeRow={patchScopeRow}
          isAdmin={isAdmin}
          initialTab={sheetInitialTab}
          onClose={() => setSheetOpen(false)}
          onStartInspection={(form) => {
            setSheetOpen(false);
            setActiveFill(form);
          }}
          onReviewSubmission={(sub, attemptNumber) => {
            setSheetOpen(false);
            setActiveReview({ sub, attemptNumber });
          }}
          canShowProcoreBackfill={canShowProcoreBackfill}
          procoreIsEdit={existingBackfill != null}
          onOpenBackfill={() => {
            setSheetOpen(false);
            setBackfillOpen(true);
          }}
        />
      )}

      {activeFill && (
        <InspectionFillOverlay
          mode="live"
          form={activeFill}
          scope={scope}
          projectId={projectId}
          unitId={unitId}
          onSubmitted={onSubmitted}
          onClose={() => setActiveFill(null)}
        />
      )}

      {activeReview && (
        <InspectionFillOverlay
          mode="readonly"
          submission={activeReview.sub}
          attemptNumber={activeReview.attemptNumber}
          scope={scope}
          projectId={projectId}
          unitId={unitId}
          locationLabel={locationLabel}
          onEdit={
            canEditSubmission(activeReview.sub)
              ? () => {
                  const sub = activeReview.sub;
                  setActiveReview(null);
                  setActiveEdit({ sub });
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
          scope={scope}
          projectId={projectId}
          unitId={unitId}
          locationParts={locationParts}
          onSaved={onEditSaved}
          onReclassifyToCalibration={
            canReclassifySubmission(activeEdit.sub)
              ? () => void reclassifySubmission(activeEdit.sub)
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
          scope={scope}
          projectId={projectId}
          unitId={unitId}
          locationParts={locationParts}
          onSubmitted={onSubmitted}
          onClose={() => setActiveRetry(null)}
        />
      )}

      {activeCalibration && (
        <InspectionFillOverlay
          mode="calibration"
          previousSubmission={activeCalibration.sub}
          scope={scope}
          projectId={projectId}
          unitId={unitId}
          onSubmitted={(newSub, syncPromise) => {
            startTransition(() => setSubmissions((prev) => [newSub, ...prev]));
            void syncPromise.then(() => refresh()).catch(() => {});
          }}
          onClose={() => setActiveCalibration(null)}
        />
      )}

      {activeCalibrationReview && (
        <InspectionFillOverlay
          mode="readonly"
          submission={activeCalibrationReview.sub}
          scope={scope}
          projectId={projectId}
          unitId={unitId}
          locationLabel={locationLabel}
          onEdit={
            canEditSubmission(activeCalibrationReview.sub)
              ? () => {
                  const sub = activeCalibrationReview.sub;
                  setActiveCalibrationReview(null);
                  setActiveEdit({ sub });
                }
              : undefined
          }
          onClose={() => setActiveCalibrationReview(null)}
        />
      )}

      {backfillOpen && (
        <BackfillModal
          scope={scope}
          projectId={projectId}
          unitId={unitId}
          existingBackfill={submissions.find((s) => s.source === "BACKFILL") ?? null}
          onSuccess={(outcome) => {
            setBackfillOpen(false);
            refresh();
            applyLocalScopeUpdates?.(localScopeUpdatesFromBackfillOutcome(outcome));
          }}
          onCleared={() => {
            setBackfillOpen(false);
            refresh();
            applyLocalScopeUpdates?.(clearLocalScopeInspectionUpdates());
          }}
          onStartNewInspection={() => {
            setBackfillOpen(false);
            openPicker("picker");
          }}
          onClose={() => setBackfillOpen(false)}
        />
      )}
    </ScopeInspectionContext.Provider>
  );
}

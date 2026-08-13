"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { IssueDetailModal } from "@/components/projects/IssueDetailModal";
import { ObservationDetailModal } from "@/components/projects/ObservationDetailModal";
import { UnitDetailModalPanel } from "@/components/projects/UnitDetailModalPanel";
import { InspectionFillOverlay } from "@/components/projects/inspections/InspectionFillOverlay";
import { get as getInspectionSubmission } from "@/lib/inspections/submissionsApi";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import { unitContextFromUnitRef } from "@/lib/field-notes-scope";
import { useFieldNotesLocationLabels } from "@/components/projects/useFieldNotesLocationLabels";
import type { FieldDailyUnitDetailTarget } from "@/lib/field-daily-report/unit-entry-target";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import type { IssueSummary, ObsSummary } from "@/components/projects/UnitCards";

interface UseFieldDailyDetailModalsOptions {
  projectId: string;
  projectName: string;
  currentUserId?: string;
  currentUserRole?: string;
}

export function resolveFieldDailyUnitDetailPermissions(role?: string): {
  canManageStatus: boolean;
  canCalibrate: boolean;
} {
  if (!role) {
    return { canManageStatus: false, canCalibrate: false };
  }
  return {
    canManageStatus: hasPermission(role, PERMISSIONS.MANAGE_UNIT_STATUS),
    canCalibrate: hasPermission(role, PERMISSIONS.CALIBRATE_INSPECTION),
  };
}

export function useFieldDailyDetailModals(options: UseFieldDailyDetailModalsOptions) {
  const t = useTranslations("fieldDailyReport");
  const fieldNotesLabels = useFieldNotesLocationLabels();
  const { canManageStatus, canCalibrate } = resolveFieldDailyUnitDetailPermissions(
    options.currentUserRole,
  );
  const [selectedIssue, setSelectedIssue] = useState<IssueSummary | null>(null);
  const [selectedObs, setSelectedObs] = useState<ObsSummary | null>(null);
  const [reviewSubmission, setReviewSubmission] = useState<InspectionSubmission | null>(null);
  const [unitTarget, setUnitTarget] = useState<FieldDailyUnitDetailTarget | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openIssue = useCallback(
    async (issueId: string) => {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/projects/${options.projectId}/issues/${issueId}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as IssueSummary;
        setSelectedIssue(data);
      } catch {
        toast.error(t("detailLoadError"));
      } finally {
        setLoadingDetail(false);
      }
    },
    [options.projectId, t],
  );

  const openObservation = useCallback(
    async (observationId: string) => {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/projects/${options.projectId}/observations/${observationId}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as ObsSummary;
        setSelectedObs(data);
      } catch {
        toast.error(t("detailLoadError"));
      } finally {
        setLoadingDetail(false);
      }
    },
    [options.projectId, t],
  );

  const openInspection = useCallback(
    async (submissionId: string) => {
      setLoadingDetail(true);
      try {
        const submission = await getInspectionSubmission(submissionId);
        if (!submission) throw new Error("missing");
        setReviewSubmission(submission);
      } catch {
        toast.error(t("detailLoadError"));
      } finally {
        setLoadingDetail(false);
      }
    },
    [t],
  );

  const openUnit = useCallback((target: FieldDailyUnitDetailTarget) => {
    setUnitTarget(target);
  }, []);

  const modals = (
    <>
      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          unitContext={unitContextFromUnitRef(selectedIssue.unitRef, fieldNotesLabels)}
          projectId={options.projectId}
          projectName={options.projectName}
          currentUserId={options.currentUserId}
          currentUserRole={options.currentUserRole}
          onClose={() => setSelectedIssue(null)}
        />
      )}
      {selectedObs && (
        <ObservationDetailModal
          obs={selectedObs}
          unitContext={unitContextFromUnitRef(selectedObs.unitRef, fieldNotesLabels)}
          projectId={options.projectId}
          projectName={options.projectName}
          currentUserId={options.currentUserId}
          onClose={() => setSelectedObs(null)}
        />
      )}
      {reviewSubmission && (
        <InspectionFillOverlay
          mode="readonly"
          submission={reviewSubmission}
          projectId={options.projectId}
          projectName={options.projectName}
          unitId={reviewSubmission.unitId}
          onClose={() => setReviewSubmission(null)}
        />
      )}
      {unitTarget && (
        <UnitDetailModalPanel
          target={{
            projectId: options.projectId,
            building: unitTarget.building,
            level: unitTarget.level,
            unit: unitTarget.unit,
          }}
          desktopPanel
          canManageStatus={canManageStatus}
          canCalibrate={canCalibrate}
          currentUserId={options.currentUserId}
          currentUserRole={options.currentUserRole}
          onClose={() => setUnitTarget(null)}
        />
      )}
    </>
  );

  return {
    openIssue,
    openObservation,
    openInspection,
    openUnit,
    modals,
    loadingDetail,
  };
}

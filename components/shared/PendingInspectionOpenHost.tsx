"use client";

/**
 * Global host for opening queued inspections in edit mode from the upload queue.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { InspectionFillOverlay } from "@/components/projects/inspections/InspectionFillOverlay";
import type { ScopeRow } from "@/components/projects/UnitCards";
import { getPendingByLocalId } from "@/lib/inspections/inspectionOfflineDb";
import { getPendingInspectionSubmission } from "@/lib/inspections/submissionsApi";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import {
  locationPartsFromPending,
  minimalScopeFromPending,
  subscribeOpenPendingInspection,
} from "@/lib/offline/pending-inspection-open";

interface OpenOverlayState {
  submission: InspectionSubmission;
  scope?: ScopeRow;
  locationParts?: { building?: string; level?: string; unit?: string };
  projectId: string;
  unitId: string;
}

export function PendingInspectionOpenHost() {
  const t = useTranslations("offlineCachePanel");
  const [open, setOpen] = useState<OpenOverlayState | null>(null);

  const handleOpen = useCallback(async (localId: string) => {
    const [submission, pending] = await Promise.all([
      getPendingInspectionSubmission(localId),
      getPendingByLocalId(localId),
    ]);
    if (!submission || !pending) {
      toast.error(t("queuedItemOpenMissing"));
      return;
    }
    setOpen({
      submission,
      scope: minimalScopeFromPending(pending),
      locationParts: locationPartsFromPending(pending),
      projectId: pending.projectId,
      unitId: pending.unitId,
    });
  }, [t]);

  useEffect(() => subscribeOpenPendingInspection((localId) => {
    void handleOpen(localId);
  }), [handleOpen]);

  if (!open) return null;

  return (
    <InspectionFillOverlay
      mode="edit"
      submission={open.submission}
      scope={open.scope}
      projectId={open.projectId}
      unitId={open.unitId}
      locationParts={open.locationParts}
      onSaved={() => {
        setOpen(null);
      }}
      onClose={() => setOpen(null)}
    />
  );
}

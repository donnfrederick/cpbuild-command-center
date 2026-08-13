"use client";

/**
 * Global host — opens the correct editor when the user taps Edit on a queued mutation.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ObservationDetailModal } from "@/components/projects/ObservationDetailModal";
import { IssueDetailModal } from "@/components/projects/IssueDetailModal";
import type { IssueSummary, ObsSummary } from "@/components/projects/UnitCards";
import type { UnitContext } from "@/components/projects/AddObservationModal";
import { subscribeOpenPendingMutation } from "@/lib/offline/pending-mutation-open";
import {
  buildCommentEditContext,
  buildCustomSiteEditContext,
  buildIssueSummaryFromMutation,
  buildUnitStatusEditContext,
  canEditQueuedMutation,
  enrichUnitStatusEditContext,
  fetchCurrentUserId,
  loadMutationForEdit,
  loadObsSummaryForMutation,
  unitContextForMutation,
  type QueuedCommentEditContext,
  type QueuedCustomSiteEditContext,
  type QueuedUnitStatusEditContext,
} from "@/lib/offline/pending-mutation-edit";
import {
  QueuedCommentEditSheet,
  QueuedCustomSiteEditSheet,
  QueuedUnitStatusEditSheet,
} from "@/components/shared/QueuedMutationEditSheets";

type OpenState =
  | {
      kind: "observation";
      projectId: string;
      obs: ObsSummary;
      unitContext: UnitContext;
      currentUserId: string;
    }
  | {
      kind: "issue";
      projectId: string;
      issue: IssueSummary;
      unitContext: UnitContext;
      currentUserId: string;
    }
  | { kind: "comment"; context: QueuedCommentEditContext }
  | { kind: "unit-status"; context: QueuedUnitStatusEditContext }
  | { kind: "custom-site"; context: QueuedCustomSiteEditContext };

export function PendingMutationOpenHost() {
  const t = useTranslations("offlineCachePanel");
  const [open, setOpen] = useState<OpenState | null>(null);

  const handleOpen = useCallback(async (mutationId: string) => {
    const [mutation, currentUserId] = await Promise.all([
      loadMutationForEdit(mutationId),
      fetchCurrentUserId(),
    ]);
    if (!mutation) {
      toast.error(t("queuedItemEditMissing"));
      return;
    }
    if (!canEditQueuedMutation(mutation, currentUserId)) {
      toast.error(t("queuedItemEditNotAuthor"));
      return;
    }

    const projectId = mutation.url.match(/\/api\/projects\/([^/]+)/)?.[1];
    if (!projectId) {
      toast.error(t("queuedItemEditMissing"));
      return;
    }

    if (mutation.type === "create-observation" || mutation.type === "update-observation") {
      const obs = await loadObsSummaryForMutation(mutation);
      if (!obs || !currentUserId) {
        toast.error(t("queuedItemEditMissing"));
        return;
      }
      setOpen({
        kind: "observation",
        projectId,
        obs,
        unitContext: unitContextForMutation(mutation),
        currentUserId,
      });
      return;
    }

    if (mutation.type === "create-issue") {
      const issue = buildIssueSummaryFromMutation(mutation);
      if (!issue || !currentUserId) {
        toast.error(t("queuedItemEditMissing"));
        return;
      }
      setOpen({
        kind: "issue",
        projectId,
        issue,
        unitContext: unitContextForMutation(mutation),
        currentUserId,
      });
      return;
    }

    if (mutation.type === "add-comment") {
      const context = buildCommentEditContext(mutation);
      if (!context) {
        toast.error(t("queuedItemEditMissing"));
        return;
      }
      setOpen({ kind: "comment", context });
      return;
    }

    if (mutation.type === "unit-status") {
      const context = buildUnitStatusEditContext(mutation);
      if (!context) {
        toast.error(t("queuedItemEditMissing"));
        return;
      }
      const enriched = await enrichUnitStatusEditContext(context);
      setOpen({ kind: "unit-status", context: enriched });
      return;
    }

    if (mutation.type === "create-custom-site-location") {
      const context = buildCustomSiteEditContext(mutation);
      if (!context) {
        toast.error(t("queuedItemEditMissing"));
        return;
      }
      setOpen({ kind: "custom-site", context });
      return;
    }

    toast.error(t("queuedItemEditUnsupported"));
  }, [t]);

  useEffect(() => subscribeOpenPendingMutation((id) => {
    void handleOpen(id);
  }), [handleOpen]);

  const close = useCallback(() => setOpen(null), []);

  if (!open) return null;

  if (open.kind === "observation") {
    return (
      <ObservationDetailModal
        obs={open.obs}
        unitContext={open.unitContext}
        projectId={open.projectId}
        currentUserId={open.currentUserId}
        scopes={[]}
        initialEditOpen
        onClose={close}
        onUpdated={() => close()}
      />
    );
  }

  if (open.kind === "issue") {
    return (
      <IssueDetailModal
        issue={open.issue}
        unitContext={open.unitContext}
        projectId={open.projectId}
        currentUserId={open.currentUserId}
        scopes={[]}
        initialEditOpen
        onClose={close}
        onUpdated={() => close()}
      />
    );
  }

  if (open.kind === "comment") {
    return (
      <QueuedCommentEditSheet
        context={open.context}
        onClose={close}
        onSaved={() => undefined}
      />
    );
  }

  if (open.kind === "unit-status") {
    return (
      <QueuedUnitStatusEditSheet
        context={open.context}
        onClose={close}
        onSaved={() => undefined}
      />
    );
  }

  return (
    <QueuedCustomSiteEditSheet
      context={open.context}
      onClose={close}
      onSaved={() => undefined}
    />
  );
}

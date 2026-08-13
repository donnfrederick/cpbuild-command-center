"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { FilterPanelShell } from "@/components/shared/filterPanel";
import { OfflineCachePanel } from "@/components/shared/OfflineCachePanel";
import {
  getOfflineUploadProgressSnapshot,
  subscribeOfflineUploadProgress,
} from "@/lib/offline/offline-upload-progress";
import {
  sheetSyncFeedbackColors,
  type SheetSyncFeedback,
} from "@/lib/offline/sync-sheet-feedback";

interface ConnectivityDetailsSheetProps {
  onClose: () => void;
  stripLabel: string;
  pendingUploadCount: number;
  showSyncButton: boolean;
  isUploadingPending: boolean;
  onSync: () => void | Promise<void>;
  cachePanelKey?: number;
  projectId?: string | null;
  syncFeedback?: SheetSyncFeedback | null;
}

function SyncFeedbackBanner({ feedback }: { feedback: SheetSyncFeedback }) {
  const colors = sheetSyncFeedbackColors(feedback.variant);
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginTop: 10,
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        background: colors.background,
        color: colors.color,
        border: colors.border,
        fontSize: "var(--text-caption)",
        lineHeight: 1.45,
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      {feedback.variant === "syncing" ? (
        <Loader2 size={16} className="animate-spin" aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
      ) : null}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: "var(--font-weight-extrabold)" }}>{feedback.title}</p>
        {feedback.description ? (
          <p style={{ margin: "4px 0 0", fontWeight: "var(--font-weight-medium)" }}>{feedback.description}</p>
        ) : null}
      </div>
    </div>
  );
}

export function ConnectivityDetailsSheet({
  onClose,
  stripLabel,
  pendingUploadCount,
  showSyncButton,
  isUploadingPending,
  onSync,
  cachePanelKey = 0,
  projectId = null,
  syncFeedback = null,
}: ConnectivityDetailsSheetProps) {
  const t = useTranslations("offlineIndicator");
  const uploadProgress = useSyncExternalStore(
    subscribeOfflineUploadProgress,
    getOfflineUploadProgressSnapshot,
    () => getOfflineUploadProgressSnapshot(),
  );
  const hasQueue = pendingUploadCount > 0;

  const title = hasQueue ? t("panelTitleQueue") : t("panelTitle");
  const subtitle = isUploadingPending && uploadProgress.active
    ? t("panelQueueSyncingSubtitle", {
        done: Math.min(uploadProgress.done + 1, uploadProgress.total),
        total: uploadProgress.total,
      })
    : hasQueue
      ? t("panelQueueSubtitle", { count: pendingUploadCount })
      : stripLabel;

  return (
    <FilterPanelShell
      title={title}
      subtitle={subtitle}
      closeAriaLabel={t("hideCached")}
      onClose={onClose}
      backdropClassName="filter-panel-backdrop--elevated"
      summary={syncFeedback ? <SyncFeedbackBanner feedback={syncFeedback} /> : undefined}
      footer={
        showSyncButton ? (
          <button
            type="button"
            disabled={isUploadingPending}
            onClick={() => void onSync()}
            className="filter-panel-footer__apply"
            style={{ flex: 1 }}
          >
            {isUploadingPending ? t("syncingPendingUploads") : t("syncPendingUploadsNow")}
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="filter-panel-footer__apply"
            style={{ flex: 1 }}
          >
            {t("panelDone")}
          </button>
        )
      }
    >
      <OfflineCachePanel
        key={cachePanelKey}
        prioritizeQueue={hasQueue}
        projectId={projectId}
        onBeforeOpenInspection={onClose}
      />
    </FilterPanelShell>
  );
}

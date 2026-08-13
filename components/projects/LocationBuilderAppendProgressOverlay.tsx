"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AppendRowsProgress } from "@/lib/field-tracker-append-rows";

export type FieldTrackerUploadProgressVariant = "append" | "create";

export interface LocationBuilderAppendProgressOverlayProps {
  progress: AppendRowsProgress;
  variant?: FieldTrackerUploadProgressVariant;
  onCancel?: () => void;
}

export function LocationBuilderAppendProgressOverlay({
  progress,
  variant = "append",
  onCancel,
}: LocationBuilderAppendProgressOverlayProps) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const isCreate = variant === "create";
  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0;

  const phaseMessage = (() => {
    if (progress.phase === "cancelling") {
      return isCreate ? t("createProgressCancelling") : t("appendProgressCancelling");
    }
    if (progress.phase === "creating") {
      return t("createProgressCreating");
    }
    if (progress.phase === "refreshing") {
      return isCreate ? t("createProgressRefreshing") : t("appendProgressRefreshing");
    }
    if (progress.total === 1) {
      return isCreate ? t("createProgressUploadingOne") : t("appendProgressUploadingOne");
    }
    return isCreate
      ? t("createProgressUploading", { completed: progress.completed, total: progress.total })
      : t("appendProgressUploading", { completed: progress.completed, total: progress.total });
  })();

  const title = isCreate ? t("createProgressTitle") : t("appendProgressTitle");
  const cancelHint = isCreate ? t("createProgressCancelHint") : t("appendProgressCancelHint");
  const keepOpenHint = isCreate ? t("createProgressKeepOpen") : t("appendProgressKeepOpen");
  const canCancel = progress.phase === "uploading" && onCancel != null;
  const showProgressBar = progress.phase === "uploading";

  return (
    <div
      data-testid={isCreate ? "create-project-upload-progress" : "location-builder-append-progress"}
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.45))",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "min(400px, 100%)",
          padding: "20px 22px",
          borderRadius: "var(--radius-md, 8px)",
          backgroundColor: "var(--neutral-0)",
          boxShadow: "var(--shadow-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--primary-600)" }} aria-hidden />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--neutral-900)" }}>
            {title}
          </h3>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--neutral-700)", lineHeight: 1.45 }}>
          {phaseMessage}
        </p>
        {showProgressBar ? (
          <>
            <div
              style={{
                height: 8,
                borderRadius: 99,
                backgroundColor: "var(--neutral-200)",
                overflow: "hidden",
                marginBottom: 10,
              }}
              aria-hidden
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  backgroundColor: "var(--primary-600)",
                  borderRadius: 99,
                  transition: "width 0.25s ease",
                }}
              />
            </div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--primary-700)" }}>
              {t("appendProgressPercent", { percent: pct })}
            </p>
          </>
        ) : null}
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--neutral-500)", lineHeight: 1.4 }}>
          {canCancel ? cancelHint : keepOpenHint}
        </p>
        {canCancel ? (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button
              type="button"
              onClick={onCancel}
              data-testid={isCreate ? "create-project-upload-cancel" : "location-builder-append-cancel"}
              style={{
                height: 36,
                padding: "0 14px",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm, 6px)",
                backgroundColor: "var(--neutral-0)",
                color: "var(--neutral-800)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {tCommon("cancel")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

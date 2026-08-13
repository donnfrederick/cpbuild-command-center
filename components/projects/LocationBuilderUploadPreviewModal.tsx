"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { FileSpreadsheet, Loader2, X } from "lucide-react";
import { UpmPreviewTable } from "@/components/projects/UpmPreviewTable";
import { LocationBuilderAppendProgressOverlay } from "@/components/projects/LocationBuilderAppendProgressOverlay";
import { formatUPMValidationError, type UPMValidationError } from "@/lib/upm-parse";
import type { AppendRowsProgress } from "@/lib/field-tracker-append-rows";
import { useIsBrowser } from "@/hooks/use-is-browser";

export type LocationBuilderUploadPreviewTab = "new" | "existing";

/** Above project chrome; matches other field-work overlays. */
const PREVIEW_BACKDROP_Z = 500;
const PREVIEW_DIALOG_Z = 510;

export interface LocationBuilderUploadPreviewModalProps {
  fileName: string | null;
  newHeaders: string[];
  newRows: Record<string, string>[];
  validationErrors: UPMValidationError[];
  existingHeaders: readonly string[];
  existingRows: Record<string, string>[];
  existingRowsLoading?: boolean;
  isSubmitting: boolean;
  appendProgress?: AppendRowsProgress | null;
  onCancelAppend?: () => void;
  onCellEdit: (rowIndex: number, col: string, value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function LocationBuilderUploadPreviewModal({
  fileName,
  newHeaders,
  newRows,
  validationErrors,
  existingHeaders,
  existingRows,
  existingRowsLoading = false,
  isSubmitting,
  appendProgress = null,
  onCancelAppend,
  onCellEdit,
  onConfirm,
  onClose,
}: LocationBuilderUploadPreviewModalProps) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const isBrowser = useIsBrowser();
  const [activeTab, setActiveTab] = useState<LocationBuilderUploadPreviewTab>("new");

  const canConfirm =
    newRows.length > 0 && validationErrors.length === 0 && !isSubmitting;

  useEffect(() => {
    if (!isBrowser) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isBrowser]);

  const existingTabLabel = existingRowsLoading
    ? t("appendPreviewTabExistingLoading")
    : existingRows.length === 1
      ? t("appendPreviewTabExisting", { count: 1 })
      : t("appendPreviewTabExistingPlural", { count: existingRows.length });

  const previewTitle =
    activeTab === "new"
      ? newRows.length === 1
        ? t("appendPreviewNewRows", { count: 1 })
        : t("appendPreviewNewRowsPlural", { count: newRows.length })
      : existingRowsLoading
        ? t("appendPreviewLoadingExisting")
        : existingRows.length === 1
          ? t("appendPreviewExistingRows", { count: 1 })
          : t("appendPreviewExistingRowsPlural", { count: existingRows.length });

  if (!isBrowser) return null;

  return createPortal(
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.5))",
          zIndex: PREVIEW_BACKDROP_Z,
        }}
        aria-hidden="true"
        data-testid="location-builder-upload-preview-backdrop"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("appendUploadPreviewTitle")}
        data-testid="location-builder-upload-preview"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: PREVIEW_DIALOG_Z,
          width: "min(920px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--neutral-0)",
          borderRadius: "var(--radius-md, 8px)",
          boxShadow: "var(--shadow-2)",
          overflow: "hidden",
        }}
      >
        {appendProgress ? (
          <LocationBuilderAppendProgressOverlay
            progress={appendProgress}
            onCancel={appendProgress.phase === "uploading" ? onCancelAppend : undefined}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--neutral-200)",
            flexShrink: 0,
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--neutral-900)", margin: 0 }}>
              {t("appendUploadPreviewTitle")}
            </h2>
            <p style={{ fontSize: 12, color: "var(--neutral-600)", margin: "6px 0 0" }}>
              {t("appendUploadPreviewBody")}
            </p>
            <p style={{ fontSize: 12, color: "var(--neutral-500)", margin: "4px 0 0" }}>
              {t("appendUploadSafetyNote")}
            </p>
            {fileName ? (
              <p style={{ fontSize: 12, color: "var(--success-600)", fontWeight: 500, margin: "8px 0 0" }}>
                {t("loadedFile", { name: fileName, count: newRows.length })}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={tCommon("close")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: "var(--radius-sm, 6px)",
              border: "none",
              background: "none",
              color: "var(--neutral-500)",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              flexShrink: 0,
            }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "12px 20px 0",
              flexShrink: 0,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "new"}
              onClick={() => setActiveTab("new")}
              style={{
                padding: "8px 12px",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: activeTab === "new" ? "var(--primary-50)" : "var(--neutral-0)",
                color: activeTab === "new" ? "var(--primary-700)" : "var(--neutral-700)",
                cursor: "pointer",
              }}
            >
              {newRows.length === 1
                ? t("appendPreviewTabNew", { count: 1 })
                : t("appendPreviewTabNewPlural", { count: newRows.length })}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "existing"}
              aria-busy={existingRowsLoading || undefined}
              onClick={() => setActiveTab("existing")}
              style={{
                padding: "8px 12px",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: activeTab === "existing" ? "var(--primary-50)" : "var(--neutral-0)",
                color: activeTab === "existing" ? "var(--primary-700)" : "var(--neutral-700)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {existingRowsLoading ? (
                <Loader2 size={12} className="animate-spin" aria-hidden />
              ) : null}
              {existingTabLabel}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 16px", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
            {activeTab === "new" && validationErrors.length > 0 ? (
              <div
                style={{
                  padding: 12,
                  backgroundColor: "var(--warning-50)",
                  border: "1px solid var(--warning-200)",
                  borderRadius: "var(--radius-sm, 6px)",
                  color: "var(--warning-800)",
                  fontSize: 13,
                }}
              >
                <strong>{t("formatIssues")}</strong>
                <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                  {validationErrors.slice(0, 10).map((e, i) => (
                    <li key={i}>{formatUPMValidationError(e)}</li>
                  ))}
                  {validationErrors.length > 10 ? (
                    <li>{t("andMoreRows", { count: validationErrors.length - 10 })}</li>
                  ) : null}
                </ul>
                <p style={{ margin: "8px 0 0", fontSize: 12 }}>{t("fixInPreview")}</p>
              </div>
            ) : null}

            <div>
              {!(activeTab === "existing" && existingRowsLoading) ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <FileSpreadsheet size={18} style={{ color: "var(--primary-600)" }} aria-hidden />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-800)" }}>{previewTitle}</span>
                </div>
              ) : null}

              {activeTab === "existing" && existingRowsLoading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: 16,
                    color: "var(--neutral-600)",
                    fontSize: 13,
                  }}
                >
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  {t("appendPreviewLoadingExisting")}
                </div>
              ) : activeTab === "new" ? (
                <UpmPreviewTable
                  headers={newHeaders}
                  rows={newRows}
                  validationErrors={validationErrors}
                  rowNumberHeader={t("upmPreviewRowNumberHeader")}
                  onCellEdit={onCellEdit}
                />
              ) : existingRows.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--neutral-600)", margin: 0 }}>{t("noUnitRows")}</p>
              ) : (
                <UpmPreviewTable
                  headers={[...existingHeaders]}
                  rows={existingRows}
                  validationErrors={[]}
                  rowNumberHeader={t("upmPreviewRowNumberHeader")}
                  readOnly
                />
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            padding: "12px 20px",
            borderTop: "1px solid var(--neutral-200)",
            flexShrink: 0,
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              height: 38,
              padding: "0 16px",
              border: "1px solid var(--neutral-300)",
              borderRadius: "var(--radius-sm, 6px)",
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-700)",
              fontSize: 14,
              fontWeight: 500,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 38,
              padding: "0 20px",
              border: "none",
              borderRadius: "var(--radius-sm, 6px)",
              backgroundColor: !canConfirm ? "var(--primary-300)" : "var(--primary-600)",
              color: "var(--neutral-0)",
              fontSize: 14,
              fontWeight: 600,
              cursor: !canConfirm ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden />
                {t("adding")}
              </>
            ) : newRows.length > 0 ? (
              t("confirmAppendRows", { count: newRows.length })
            ) : (
              t("confirmAppendRowsShort")
            )}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

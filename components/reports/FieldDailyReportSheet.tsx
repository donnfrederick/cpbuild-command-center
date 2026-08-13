"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { Share, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { useIsBrowser } from "@/hooks/use-is-browser";
import { formatFieldDailyReportDateLabel } from "@/lib/field-daily-report/timezone";
import {
  FieldDailyReportSaveFooter,
  FieldDailyReportSaveProvider,
  useFieldDailyReportDiscardAll,
  useFieldDailyReportHasDirtyNotes,
} from "@/components/reports/FieldDailyReportSaveStatus";

const FIELD_DAILY_SHEET_CSS = `
  .fds-backdrop { position: fixed; inset: 0; z-index: 270; display: flex; align-items: flex-end; justify-content: center; transition: background-color 0.26s ease; }
  .fds-sheet { width: 100%; max-height: 92vh; border-radius: 16px 16px 0 0; background: var(--neutral-0); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); display: flex; flex-direction: column; box-shadow: 0 -4px 32px rgba(0,0,0,0.14); padding-bottom: env(safe-area-inset-bottom, 0px); }
  .fds-sheet.fds-visible { transform: translateY(0); }
  .fds-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 0; flex-shrink: 0; }
  @media (min-width: 640px) {
    .fds-backdrop { align-items: center; }
    .fds-sheet { width: min(640px, calc(100vw - 32px)); max-height: min(92vh, 900px); border-radius: 16px; transform: scale(0.96) translateY(8px); opacity: 0; transition: transform 0.22s cubic-bezier(0.32,0.72,0,1), opacity 0.22s ease; box-shadow: 0 8px 40px rgba(0,0,0,0.22); padding-bottom: 0; }
    .fds-sheet.fds-visible { transform: scale(1) translateY(0); opacity: 1; }
    .fds-handle { display: none; }
  }
`;

const iconButtonStyle: React.CSSProperties = {
  padding: 6,
  borderRadius: 8,
  border: "none",
  backgroundColor: "transparent",
  cursor: "pointer",
  color: "var(--neutral-500)",
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

/** Inner sheet layout — must render inside FieldDailyReportSaveProvider when editable. */
function FieldDailyReportSheetBody({
  titleId,
  projectName,
  reportDate,
  updatedTimeLabel,
  showSaveStatus,
  onDismiss,
  onSaveAndClose,
  onShare,
  toolbarExtra,
  children,
}: {
  titleId: string;
  projectName: string;
  reportDate: string;
  updatedTimeLabel?: string;
  showSaveStatus: boolean;
  onDismiss: () => void;
  onSaveAndClose: () => void;
  onShare?: () => void;
  toolbarExtra?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("fieldDailyReport");
  const locale = useLocale();

  return (
    <>
      <div className="fds-handle" aria-hidden />
      <div
        style={{
          padding: "12px 16px 14px",
          borderBottom: "1px solid var(--neutral-200)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <h2
              id={titleId}
              style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--neutral-900)", minWidth: 0 }}
            >
              {projectName}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {toolbarExtra}
              {onShare ? (
                <button
                  type="button"
                  onClick={onShare}
                  aria-label={t("shareAriaLabel")}
                  title={t("share")}
                  style={iconButtonStyle}
                >
                  <Share size={20} aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                onClick={onDismiss}
                aria-label={t("close")}
                title={t("close")}
                style={iconButtonStyle}
              >
                <X size={20} aria-hidden />
              </button>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
              {formatFieldDailyReportDateLabel(reportDate, locale)}
            </span>
            {updatedTimeLabel ? (
              <span style={{ fontSize: 13, color: "var(--neutral-500)", flexShrink: 0, textAlign: "right" }}>
                {updatedTimeLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 12px 16px",
        }}
      >
        {children}
      </div>
      {showSaveStatus ? (
        <FieldDailyReportSaveFooter onClose={onDismiss} onSaveAndClose={onSaveAndClose} />
      ) : null}
    </>
  );
}

function FieldDailyReportSheetDialog({
  visible,
  titleId,
  projectName,
  reportDate,
  updatedTimeLabel,
  showSaveStatus,
  finishClose,
  onShare,
  toolbarExtra,
  children,
}: {
  visible: boolean;
  titleId: string;
  projectName: string;
  reportDate: string;
  updatedTimeLabel?: string;
  showSaveStatus: boolean;
  finishClose: () => void;
  onShare?: () => void;
  toolbarExtra?: ReactNode;
  children: ReactNode;
}) {
  const discardAllNotes = useFieldDailyReportDiscardAll();
  const hasDirtyNotes = useFieldDailyReportHasDirtyNotes();

  const onDismiss = useCallback(() => {
    if (hasDirtyNotes) discardAllNotes?.();
    finishClose();
  }, [discardAllNotes, finishClose, hasDirtyNotes]);

  const onSaveAndClose = useCallback(() => {
    finishClose();
  }, [finishClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      role="presentation"
      className="fds-backdrop"
      style={{
        backgroundColor: visible ? "var(--overlay-bg, rgba(0,0,0,0.4))" : "rgba(0,0,0,0)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fds-sheet${visible ? " fds-visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <FieldDailyReportSheetBody
          titleId={titleId}
          projectName={projectName}
          reportDate={reportDate}
          updatedTimeLabel={updatedTimeLabel}
          showSaveStatus={showSaveStatus}
          onDismiss={onDismiss}
          onSaveAndClose={onSaveAndClose}
          onShare={onShare}
          toolbarExtra={toolbarExtra}
        >
          {children}
        </FieldDailyReportSheetBody>
      </div>
    </div>
  );
}

/** Full-height bottom sheet for viewing/editing a project daily report on the hub. */
export function FieldDailyReportSheet({
  projectName,
  reportDate,
  updatedTimeLabel,
  onClose,
  onShare,
  toolbarExtra,
  children,
  showSaveStatus = false,
}: {
  projectName: string;
  reportDate: string;
  updatedTimeLabel?: string;
  onClose: () => void;
  onShare?: () => void;
  toolbarExtra?: ReactNode;
  children: ReactNode;
  /** When true, shows save footer and flushes notes before close. */
  showSaveStatus?: boolean;
}) {
  const isBrowser = useIsBrowser();
  const titleId = useId();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const finishClose = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 260);
  }, [onClose]);

  if (!isBrowser) return null;

  const dialog = (
    <FieldDailyReportSheetDialog
      visible={visible}
      titleId={titleId}
      projectName={projectName}
      reportDate={reportDate}
      updatedTimeLabel={updatedTimeLabel}
      showSaveStatus={showSaveStatus}
      finishClose={finishClose}
      onShare={onShare}
      toolbarExtra={toolbarExtra}
    >
      {children}
    </FieldDailyReportSheetDialog>
  );

  return createPortal(
    <>
      <style>{FIELD_DAILY_SHEET_CSS}</style>
      {showSaveStatus ? (
        <FieldDailyReportSaveProvider>{dialog}</FieldDailyReportSaveProvider>
      ) : (
        dialog
      )}
    </>,
    document.body,
  );
}

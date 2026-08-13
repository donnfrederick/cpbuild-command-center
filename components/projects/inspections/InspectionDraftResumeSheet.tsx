"use client";

import { useCallback, useEffect, useId, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useIsBrowser } from "@/hooks/use-is-browser";
import {
  INSPECTION_OVERLAY_DIALOG_Z_INDEX,
  INSPECTION_SHEET_CSS,
} from "./inspectionSheetPrimitive";
import { formatRelativeTime } from "./inspectionSummary";

export interface InspectionDraftResumeSheetProps {
  open: boolean;
  updatedAt: string;
  answeredCount: number;
  totalQuestions: number;
  onResume: () => void | Promise<void>;
  onStartOver: () => void | Promise<void>;
}

export function InspectionDraftResumeSheet({
  open,
  updatedAt,
  answeredCount,
  totalQuestions,
  onResume,
  onStartOver,
}: InspectionDraftResumeSheetProps) {
  const t = useTranslations("inspections.draftResume");
  const isBrowser = useIsBrowser();
  const titleId = useId();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const runAction = useCallback((action: () => void | Promise<void>) => {
    void (async () => {
      setBusy(true);
      try {
        await action();
      } catch (error: unknown) {
        console.warn("[InspectionDraftResumeSheet] action failed", error);
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  if (!isBrowser || !open) return null;

  const relative = formatRelativeTime(updatedAt);

  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{ __html: INSPECTION_SHEET_CSS }} />
      <div
        className={`ibs-backdrop${visible ? " ibs-visible" : ""}`}
        style={{
          backgroundColor: visible ? "var(--overlay-bg, rgba(0,0,0,0.5))" : "transparent",
          zIndex: INSPECTION_OVERLAY_DIALOG_Z_INDEX,
        }}
        role="presentation"
      >
        <div
          className={`ibs-sheet${visible ? " ibs-visible" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ibs-handle" aria-hidden />
          <div style={{ padding: "12px 14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 id={titleId} style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--neutral-900)" }}>
              {t("title")}
            </h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: "var(--neutral-600)" }}>
              {t("description", {
                relative,
                answered: answeredCount,
                total: totalQuestions,
              })}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction(onResume)}
                style={primaryBtnStyle}
              >
                {t("resume")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction(onStartOver)}
                style={secondaryBtnStyle}
              >
                {t("startOver")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

const primaryBtnStyle: CSSProperties = {
  padding: "10px 14px",
  fontSize: 14,
  fontWeight: 600,
  border: "none",
  borderRadius: "var(--radius-sm)",
  backgroundColor: "var(--primary-500)",
  color: "var(--neutral-0)",
  cursor: "pointer",
};

const secondaryBtnStyle: CSSProperties = {
  padding: "10px 14px",
  fontSize: 14,
  fontWeight: 600,
  border: "1px solid var(--neutral-300)",
  borderRadius: "var(--radius-sm)",
  backgroundColor: "var(--neutral-0)",
  color: "var(--neutral-800)",
  cursor: "pointer",
};

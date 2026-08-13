"use client";

import { useCallback, useEffect, useId, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useIsBrowser } from "@/hooks/use-is-browser";
import {
  INSPECTION_OVERLAY_DIALOG_Z_INDEX,
  INSPECTION_SHEET_CSS,
} from "./inspectionSheetPrimitive";

export interface InspectionLeaveGuardSheetProps {
  open: boolean;
  onKeepEditing: () => void;
  onSaveAndClose: () => void | Promise<void>;
  onDiscard: () => void | Promise<void>;
}

export function InspectionLeaveGuardSheet({
  open,
  onKeepEditing,
  onSaveAndClose,
  onDiscard,
}: InspectionLeaveGuardSheetProps) {
  const t = useTranslations("inspections.draftGuard");
  const tCommon = useTranslations("common");
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

  const finishClose = useCallback((action: () => void | Promise<void>) => {
    void (async () => {
      setBusy(true);
      try {
        await action();
      } catch (error: unknown) {
        console.warn("[InspectionLeaveGuardSheet] action failed", error);
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKeepEditing();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onKeepEditing]);

  if (!isBrowser || !open) return null;

  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{ __html: INSPECTION_SHEET_CSS }} />
      <div
        className={`ibs-backdrop${visible ? " ibs-visible" : ""}`}
        style={{
          backgroundColor: visible ? "var(--overlay-bg, rgba(0,0,0,0.5))" : "transparent",
          zIndex: INSPECTION_OVERLAY_DIALOG_Z_INDEX,
        }}
        onClick={onKeepEditing}
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
              {t("description")}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                disabled={busy}
                onClick={onKeepEditing}
                style={primaryBtnStyle}
              >
                {t("keepEditing")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => finishClose(onSaveAndClose)}
                style={secondaryBtnStyle}
              >
                {t("saveAndClose")}
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={t("discard")}
                onClick={() => finishClose(onDiscard)}
                style={destructiveBtnStyle}
              >
                {t("discard")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onKeepEditing}
                style={ghostBtnStyle}
              >
                {tCommon("cancel")}
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

const destructiveBtnStyle: CSSProperties = {
  padding: "10px 14px",
  fontSize: 14,
  fontWeight: 600,
  border: "1px solid var(--error-200)",
  borderRadius: "var(--radius-sm)",
  backgroundColor: "var(--error-50)",
  color: "var(--error-700)",
  cursor: "pointer",
};

const ghostBtnStyle: CSSProperties = {
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 500,
  border: "none",
  borderRadius: "var(--radius-sm)",
  backgroundColor: "transparent",
  color: "var(--neutral-600)",
  cursor: "pointer",
};

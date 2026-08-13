"use client";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";

interface FieldDailyRunForDateModalProps {
  open: boolean;
  maxDate: string;
  running: boolean;
  onClose: () => void;
  onRun: (reportDate: string) => void;
}

export function FieldDailyRunForDateModal({
  open,
  maxDate,
  running,
  onClose,
  onRun,
}: FieldDailyRunForDateModalProps) {
  const t = useTranslations("fieldDailyReport");
  const titleId = useId();
  const [userDate, setUserDate] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const reportDate = userDate ?? maxDate;
  const displayed = open || exiting;

  const handleClose = () => {
    if (running) return;
    setExiting(true);
    window.setTimeout(() => {
      setExiting(false);
      setUserDate(null);
      onClose();
    }, 200);
  };

  const handleRun = () => {
    if (!reportDate || running) return;
    onRun(reportDate);
  };

  if (!displayed) return null;

  return createPortal(
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !running) handleClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px",
        background: exiting ? "transparent" : "var(--overlay-bg, rgba(0,0,0,0.5))",
        transition: "background-color 0.2s ease",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(400px, 100%)",
          background: "var(--neutral-0)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-2)",
          opacity: exiting ? 0 : 1,
          transform: exiting ? "translateY(8px)" : "translateY(0)",
          transition: "opacity 0.2s ease, transform 0.2s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            padding: "14px 16px",
            borderBottom: "1px solid var(--neutral-200)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              id={titleId}
              style={{
                margin: 0,
                fontSize: "var(--text-body)",
                fontWeight: 700,
                color: "var(--neutral-900)",
              }}
            >
              {t("hubRunForDateTitle")}
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "var(--text-caption)",
                color: "var(--neutral-500)",
                lineHeight: 1.4,
              }}
            >
              {t("hubRunForDateDescription")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={running}
            aria-label={t("hubRunForDateCloseAria")}
            style={{
              padding: 6,
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "var(--neutral-100)",
              color: "var(--neutral-600)",
              cursor: running ? "not-allowed" : "pointer",
              flexShrink: 0,
            }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <label
            htmlFor={`${titleId}-date`}
            style={{
              fontSize: "var(--text-caption)",
              fontWeight: 600,
              color: "var(--neutral-700)",
            }}
          >
            {t("hubRunForDateLabel")}
          </label>
          <input
            id={`${titleId}-date`}
            type="date"
            value={reportDate}
            max={maxDate}
            onChange={(e) => setUserDate(e.target.value)}
            disabled={running}
            style={{
              border: "1px solid var(--neutral-300)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 10px",
              fontSize: "var(--text-body)",
              color: "var(--neutral-900)",
              background: "var(--neutral-0)",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px 16px",
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={running}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--neutral-300)",
              background: "var(--neutral-0)",
              color: "var(--neutral-700)",
              fontWeight: 600,
              fontSize: "var(--text-caption)",
              cursor: running ? "not-allowed" : "pointer",
            }}
          >
            {t("hubRunForDateCancel")}
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={running || !reportDate}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              backgroundColor: "var(--color-accent)",
              color: "var(--neutral-0)",
              fontWeight: 600,
              fontSize: "var(--text-caption)",
              cursor: running || !reportDate ? "not-allowed" : "pointer",
              opacity: running || !reportDate ? 0.7 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {running ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                {t("generating")}
              </>
            ) : (
              t("hubRunForDateConfirm")
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export type InspectionPdfExportStep = "working" | "done";

export function InspectionPdfExportOverlay({
  step,
  recordCount,
  onSavePdf,
  savePdfLabel,
}: {
  step: InspectionPdfExportStep;
  recordCount: number;
  onSavePdf?: () => void;
  savePdfLabel?: string;
}) {
  const t = useTranslations("inspections");
  const isDone = step === "done";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t("hubProjectFormsExportProgressAria")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "var(--overlay-bg, color-mix(in srgb, var(--color-surface-dark) 45%, transparent))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-6)",
      }}
    >
      <div
        style={{
          backgroundColor: "var(--neutral-0)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-8) var(--space-6)",
          maxWidth: 400,
          width: "100%",
          boxShadow: "var(--shadow-2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            marginBottom: "var(--space-4)",
          }}
        >
          {isDone ? (
            <CheckCircle2
              size={28}
              style={{ color: "var(--success-600)", flexShrink: 0 }}
              aria-hidden
            />
          ) : (
            <Loader2
              size={28}
              className="animate-spin"
              style={{ color: "var(--primary-600)", flexShrink: 0 }}
              aria-hidden
            />
          )}
          <div>
            <p
              style={{
                margin: 0,
                fontSize: "var(--text-subheading)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--neutral-900)",
              }}
            >
              {isDone ? t("hubProjectFormsExportDone") : t("hubProjectFormsExportWorking")}
            </p>
            <p
              style={{
                margin: "var(--space-1) 0 0",
                fontSize: "var(--text-caption)",
                color: "var(--neutral-500)",
              }}
            >
              {t("hubProjectFormsExportCount", { count: recordCount })}
            </p>
          </div>
        </div>
        {isDone && onSavePdf && savePdfLabel && (
          <button
            type="button"
            onClick={onSavePdf}
            style={{
              width: "100%",
              padding: "var(--space-3) var(--space-4)",
              border: "none",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--neutral-900)",
              color: "var(--neutral-0)",
              fontSize: "var(--text-body)",
              fontWeight: "var(--font-weight-bold)",
              cursor: "pointer",
            }}
          >
            {savePdfLabel}
          </button>
        )}
      </div>
    </div>
  );
}

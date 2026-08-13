"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { supportsPdfFileShare } from "@/lib/deliver-pdf-blob";

export type PortfolioProgressPdfExportStep = "preparing" | "rendering" | "done";

const STEP_ORDER: PortfolioProgressPdfExportStep[] = ["preparing", "rendering", "done"];

const STEP_PERCENT: Record<PortfolioProgressPdfExportStep, number> = {
  preparing: 25,
  rendering: 70,
  done: 100,
};

export function PortfolioProgressPdfExportOverlay({
  step,
  projectName,
  periodLabel,
  onSavePdf,
  showSaveButton = false,
}: {
  step: PortfolioProgressPdfExportStep;
  projectName: string;
  periodLabel: string;
  onSavePdf?: () => void;
  showSaveButton?: boolean;
}) {
  const t = useTranslations("globalReports.portfolioProgress");
  const isDone = step === "done";
  const currentIdx = STEP_ORDER.indexOf(step);
  const percent = STEP_PERCENT[step];
  const saveLabel = supportsPdfFileShare() ? t("exportPdfShareButton") : t("exportPdfSaveButton");

  const headline = (() => {
    if (isDone) return t("exportPdfDone");
    if (step === "preparing") return t("exportPdfStepPreparing");
    return t("exportPdfStepRendering");
  })();

  const steps: Array<{
    id: Exclude<PortfolioProgressPdfExportStep, "done">;
    labelKey: "exportPdfStepPreparing" | "exportPdfStepRendering";
  }> = [
    { id: "preparing", labelKey: "exportPdfStepPreparing" },
    { id: "rendering", labelKey: "exportPdfStepRendering" },
  ];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!isDone}
      aria-label={t("exportPdfProgressAria")}
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
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
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
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--neutral-400)",
              }}
            >
              {t("exportPdfProgressTitle")}
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 18,
                fontWeight: 700,
                color: isDone ? "var(--success-700)" : "var(--neutral-900)",
                lineHeight: 1.35,
              }}
            >
              {isDone ? headline : `${headline}…`}
            </p>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                color: "var(--neutral-500)",
                lineHeight: 1.5,
              }}
            >
              {t("exportPdfProgressProject", { projectName, period: periodLabel })}
            </p>
          </div>
        </div>

        {!isDone ? (
          <div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={t("exportPdfProgressPercent", { percent })}
              style={{
                height: 8,
                borderRadius: 999,
                backgroundColor: "var(--neutral-200)",
                overflow: "hidden",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${percent}%`,
                  backgroundColor: "var(--primary-600)",
                  borderRadius: 999,
                  transition: "width 0.25s ease",
                }}
              />
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 600,
                color: "var(--primary-700)",
                textAlign: "center",
              }}
            >
              {t("exportPdfProgressPercent", { percent })}
            </p>
          </div>
        ) : null}

        <ol
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {steps.map((s, idx) => {
            const done = isDone || idx < currentIdx;
            const active = !isDone && idx === currentIdx;
            return (
              <li
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  opacity: done || active ? 1 : 0.35,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    backgroundColor: done
                      ? "var(--success-600)"
                      : active
                        ? "var(--primary-600)"
                        : "var(--neutral-200)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: done || active ? "var(--color-text-inverse)" : "var(--neutral-400)",
                  }}
                >
                  {done ? "✓" : idx + 1}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: done
                      ? "var(--success-700)"
                      : active
                        ? "var(--neutral-900)"
                        : "var(--neutral-400)",
                  }}
                >
                  {t(s.labelKey)}
                </span>
              </li>
            );
          })}
        </ol>

        {isDone && showSaveButton && onSavePdf ? (
          <>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--neutral-600)",
                lineHeight: 1.45,
                textAlign: "center",
              }}
            >
              {t("exportPdfMobileHint")}
            </p>
            <button
              type="button"
              onClick={onSavePdf}
              style={{
                width: "100%",
                padding: "var(--space-3) var(--space-4)",
                border: "none",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--neutral-900)",
                color: "var(--color-text-inverse)",
                fontSize: "var(--text-body)",
                fontWeight: "var(--font-weight-bold)",
                cursor: "pointer",
              }}
            >
              {saveLabel}
            </button>
          </>
        ) : null}

        {!isDone ? (
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: "var(--neutral-400)",
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {t("exportPdfProgressHint")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

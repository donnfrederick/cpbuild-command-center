"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useIsBrowser } from "@/hooks/use-is-browser";
import { useOfflineSyncContext } from "@/hooks/offline-sync-context";

export function PreDownloadProgressOverlay() {
  const t = useTranslations("preDownloadOverlay");
  const isBrowser = useIsBrowser();
  const { downloadState, cancelDownload } = useOfflineSyncContext();
  const [visible, setVisible] = useState(false);

  const downloadActive = downloadState != null;

  useEffect(() => {
    if (!downloadActive) {
      const id = requestAnimationFrame(() => setVisible(false));
      return () => cancelAnimationFrame(id);
    }
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [downloadActive]);

  useEffect(() => {
    if (!downloadActive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [downloadActive]);

  if (!isBrowser || !downloadState) return null;

  const { percent, phase, step, stepTotal, projectName } = downloadState;
  const showStepDetail =
    typeof step === "number" &&
    typeof stepTotal === "number" &&
    stepTotal > 0;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pre-download-overlay-title"
      aria-describedby="pre-download-overlay-desc"
      data-pre-download-overlay
      className={`pre-download-backdrop${visible ? " pre-download-backdrop--visible" : ""}`}
    >
      <div
        className={`pre-download-sheet${visible ? " pre-download-sheet--visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pre-download-handle" aria-hidden="true" />

        <div className="pre-download-header">
          <Loader2
            size={22}
            className="animate-spin pre-download-header__spinner"
            aria-hidden
          />
          <div className="pre-download-header__text">
            <h2 id="pre-download-overlay-title" className="pre-download-header__title">
              {t("title")}
            </h2>
            {projectName ? (
              <p className="pre-download-header__project">{projectName}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void cancelDownload()}
            aria-label={t("cancelAriaLabel")}
            className="pre-download-header__close"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="pre-download-body">
          <p id="pre-download-overlay-desc" className="pre-download-phase">
            {t(`phase.${phase}`)}
          </p>

          {showStepDetail ? (
            <p className="pre-download-step">
              {t("stepDetail", { current: step!, total: stepTotal! })}
            </p>
          ) : null}

          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t("progressAriaLabel", { pct: percent })}
            className="pre-download-progress-track"
          >
            <div
              className="pre-download-progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>

          <p className="pre-download-percent">{t("percentComplete", { pct: percent })}</p>
        </div>

        <footer className="pre-download-footer">
          <button
            type="button"
            onClick={() => void cancelDownload()}
            className="pre-download-cancel"
          >
            {t("cancel")}
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

"use client";

import { Loader2 } from "lucide-react";
import type { OfflineUploadProgress } from "@/lib/offline/offline-upload-progress";

interface UploadQueueProgressHeaderProps {
  progress: OfflineUploadProgress;
  /** 0–100 when available from mutation flush */
  percent: number | null;
  title: string;
  /** Shown under the title — e.g. current item label */
  currentLabel?: string | null;
  mediaPhaseLabel?: string;
}

export function UploadQueueProgressHeader({
  progress,
  percent,
  title,
  currentLabel,
  mediaPhaseLabel,
}: UploadQueueProgressHeaderProps) {
  if (!progress.active || progress.total <= 0) return null;

  const pct =
    percent ??
    (progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0);

  const phaseHint =
    progress.phase === "media" && mediaPhaseLabel ? mediaPhaseLabel : null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginBottom: 10,
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        background: "var(--primary-50, var(--control-bg))",
        border: "1px solid var(--primary-200, var(--color-divider))",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <Loader2
          size={16}
          className="animate-spin"
          aria-hidden
          style={{ flexShrink: 0, marginTop: 2, color: "var(--primary-600)" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-caption)",
              fontWeight: "var(--font-weight-extrabold)",
              color: "var(--color-text-primary)",
              lineHeight: 1.35,
            }}
          >
            {title}
          </p>
          {currentLabel ? (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "var(--text-micro)",
                fontWeight: "var(--font-weight-medium)",
                color: "var(--color-text-secondary)",
                lineHeight: 1.4,
              }}
            >
              {phaseHint ?? currentLabel}
            </p>
          ) : null}
        </div>
        <span
          style={{
            flexShrink: 0,
            fontSize: "var(--text-micro)",
            fontWeight: "var(--font-weight-extrabold)",
            color: "var(--primary-600)",
          }}
        >
          {pct}%
        </span>
      </div>
      <div
        aria-hidden
        style={{
          height: 4,
          borderRadius: 999,
          background: "var(--neutral-200)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, Math.max(0, pct))}%`,
            background: "var(--primary-600)",
            transition: "width 0.25s ease",
          }}
        />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

export interface LoadingRowsToastProps {
  /** When false, nothing is rendered */
  show: boolean;
  /** e.g. "250 of 1,846 rows loaded" */
  progressText?: string | null;
  loading: boolean;
  loadingLabel: string;
  errorMessage?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  /** Optional test id for the floating panel */
  testId?: string;
  /**
   * After loading finishes (and there is no error), hide the toast after this many ms.
   * While `loading` is true, the toast stays visible.
   */
  idleDismissMs?: number;
}

/**
 * Fixed bottom-right panel (toast-style) for infinite-scroll row loading.
 * Portaled to document.body so it stays visible without scrolling and avoids
 * clipping by overflow/stacking contexts.
 */
export function LoadingRowsToast({
  show,
  progressText,
  loading,
  loadingLabel,
  errorMessage,
  onRetry,
  retryLabel,
  testId,
  idleDismissMs = 1000,
}: LoadingRowsToastProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [idleDismissed, setIdleDismissed] = useState(false);

  const hasProgress = progressText != null && progressText !== "";
  const hasError = errorMessage != null && errorMessage !== "";

  useEffect(() => {
    if (!show || loading || hasError) {
      queueMicrotask(() => {
        setIdleDismissed(false);
      });
    }
  }, [show, loading, hasError]);

  useEffect(() => {
    if (!show || loading || hasError || !hasProgress) {
      return;
    }
    const t = window.setTimeout(() => setIdleDismissed(true), idleDismissMs);
    return () => window.clearTimeout(t);
  }, [show, loading, hasError, hasProgress, progressText, idleDismissMs]);

  if (!mounted || !show) return null;

  if (idleDismissed && !loading && !hasError) return null;

  if (!hasProgress && !loading && !hasError) return null;

  return createPortal(
    <div
      data-testid={testId}
      className="loading-rows-toast"
      role="status"
      aria-live="polite"
      aria-busy={loading || undefined}
      style={{
        maxWidth: "min(360px, calc(100vw - 32px))",
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--neutral-200)",
        backgroundColor: "var(--neutral-0)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
        fontSize: 13,
        color: "var(--neutral-700)",
      }}
    >
      {hasProgress ? (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--neutral-600)" }}>{progressText}</p>
      ) : null}
      {hasError ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: loading ? 8 : 0,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--error-600)" }}>{errorMessage}</span>
          {onRetry && retryLabel ? (
            <button
              type="button"
              onClick={onRetry}
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--neutral-300)",
                backgroundColor: "var(--neutral-0)",
                cursor: "pointer",
              }}
            >
              {retryLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--neutral-600)" }}>
          <Loader2 size={14} className="animate-spin" aria-hidden />
          {loadingLabel}
        </div>
      ) : null}
    </div>,
    document.body
  );
}

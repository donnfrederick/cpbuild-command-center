"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw, CircleCheck, OctagonX, X } from "lucide-react";
import {
  dismissInspectionSyncStatus,
  subscribeInspectionSyncStatus,
  type InspectionSyncStatusPayload,
} from "@/lib/inspections/inspection-sync-status";

function IconForVariant({ variant }: { variant: InspectionSyncStatusPayload["variant"] }) {
  switch (variant) {
    case "loading":
      return <Loader2 size={14} className="animate-spin" aria-hidden />;
    case "success":
      return <CircleCheck size={14} aria-hidden />;
    case "error":
      return <OctagonX size={14} aria-hidden />;
    case "queued":
    default:
      return <RefreshCw size={14} aria-hidden />;
  }
}

function stripColors(variant: InspectionSyncStatusPayload["variant"]): {
  background: string;
  color: string;
  border: string;
} {
  switch (variant) {
    case "success":
      return {
        background: "var(--success-100)",
        color: "var(--success-700)",
        border: "1px solid var(--success-600)",
      };
    case "error":
      return {
        background: "var(--error-100)",
        color: "var(--error-700)",
        border: "1px solid var(--error-600)",
      };
    case "loading":
      return {
        background: "var(--primary-100)",
        color: "var(--primary-700)",
        border: "1px solid var(--primary-600)",
      };
    case "queued":
    default:
      return {
        background: "var(--warning-100)",
        color: "var(--warning-600)",
        border: "1px solid var(--warning-600)",
      };
  }
}

/**
 * Slim top banner for inspection submit/sync feedback during active work.
 * Pending uploads + manual sync live in OfflineIndicator — no Retry here.
 */
export function InspectionSyncStatusStrip() {
  const t = useTranslations("inspections");
  const [status, setStatus] = useState<InspectionSyncStatusPayload | null>(null);

  useEffect(() => {
    return subscribeInspectionSyncStatus((detail) => {
      if (detail.action === "show" || detail.action === "update") {
        setStatus(detail.status);
      } else {
        setStatus((current) => (current?.id === detail.id ? null : current));
      }
    });
  }, []);

  if (!status) return null;

  const colors = stripColors(status.variant);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="inspection-sync-status-strip"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        width: "100%",
        padding: "7px 10px",
        borderRadius: "var(--radius-md)",
        background: colors.background,
        color: colors.color,
        border: colors.border,
        fontSize: 12,
        lineHeight: 1.35,
        boxShadow: "var(--shadow-1)",
        pointerEvents: "none",
      }}
    >
      <span style={{ flexShrink: 0, marginTop: 1 }}>
        <IconForVariant variant={status.variant} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: "var(--font-weight-extrabold)" }}>
          {status.title}
        </span>
        {status.description ? (
          <span style={{ display: "block", opacity: 0.85, marginTop: 2 }}>
            {status.description}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => dismissInspectionSyncStatus(status.id)}
        aria-label={t("syncStatusDismissAria")}
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          margin: -4,
          padding: 0,
          border: "none",
          borderRadius: 6,
          background: "transparent",
          color: "inherit",
          opacity: 0.75,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "auto",
        }}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

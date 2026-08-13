"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ChevronDown, X } from "lucide-react";
import { activityLocationChipParts } from "@/lib/activity-unit-chip";
import { isMutationSyncFailureEvent, syncErrorsFromActivityMetadata } from "@/lib/activity/activity-sync-failure";
import type { SyncErrorAttempt } from "@/lib/inspections/sync-error-history";
import { mutationActivityTypeLabel } from "@/lib/offline/mutation-activity-label";
import type { MutationType } from "@/lib/offline/mutation-queue";

export interface InspectionSyncErrorDetailModalProps {
  metadata: Record<string, unknown>;
  createdAt: string;
  eventType?: string;
  onClose: () => void;
}

function relativeTime(iso: string, t: ReturnType<typeof useTranslations<"activityLog">>): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t("syncErrorDetail.relativeJustNow");
  if (mins < 60) return t("syncErrorDetail.relativeMinutesAgo", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("syncErrorDetail.relativeHoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  return t("syncErrorDetail.relativeDaysAgo", { n: days });
}

function truncateMessage(message: string, max = 80): string {
  if (message.length <= max) return message;
  return `${message.slice(0, max - 1)}…`;
}

function AttemptRow({
  entry,
  defaultExpanded,
  t,
}: {
  entry: SyncErrorAttempt;
  defaultExpanded: boolean;
  t: ReturnType<typeof useTranslations<"activityLog">>;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const summary = [
    t("syncErrorDetail.attemptLabel", { n: entry.attempt }),
    relativeTime(entry.recordedAt, t),
    entry.httpStatus ? t("syncErrorDetail.httpStatus", { status: entry.httpStatus }) : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      style={{
        border: "1px solid var(--neutral-200)",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--neutral-0)",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          color: "var(--neutral-900)",
        }}
      >
        <ChevronDown
          size={14}
          aria-hidden
          style={{
            flexShrink: 0,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700 }}>
          {summary}
        </span>
        {defaultExpanded ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--error-700)",
              background: "var(--error-100)",
              borderRadius: 4,
              padding: "2px 6px",
              flexShrink: 0,
            }}
          >
            {t("syncErrorDetail.latestBadge")}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div
          style={{
            padding: "0 12px 12px 34px",
            fontSize: 12,
            lineHeight: 1.45,
            color: "var(--neutral-800)",
            wordBreak: "break-word",
          }}
        >
          <p style={{ margin: 0 }}>{entry.message}</p>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--neutral-500)" }}>
            {t("syncErrorDetail.errorKind", { kind: entry.errorKind })}
            {" · "}
            {new Date(entry.recordedAt).toLocaleString()}
          </p>
        </div>
      ) : (
        <p
          style={{
            margin: 0,
            padding: "0 12px 10px 34px",
            fontSize: 11,
            color: "var(--neutral-600)",
            wordBreak: "break-word",
          }}
        >
          {truncateMessage(entry.message)}
        </p>
      )}
    </div>
  );
}

export function InspectionSyncErrorDetailModal({
  metadata,
  createdAt,
  eventType,
  onClose,
}: InspectionSyncErrorDetailModalProps) {
  const t = useTranslations("activityLog");
  const syncErrors = useMemo(
    () => syncErrorsFromActivityMetadata(metadata),
    [metadata],
  );
  const locationParts = activityLocationChipParts(metadata);
  const isMutationFailure = isMutationSyncFailureEvent(eventType ?? "");
  const formName =
    typeof metadata.formName === "string" && metadata.formName.trim().length > 0
      ? metadata.formName
      : t("unknownFormName");
  const itemSummary =
    typeof metadata.itemSummary === "string" && metadata.itemSummary.trim().length > 0
      ? metadata.itemSummary
      : null;
  const mutationType = typeof metadata.mutationType === "string"
    ? mutationActivityTypeLabel(metadata.mutationType as MutationType)
    : null;
  const category = String(metadata.category ?? "");
  const outcome = String(metadata.outcome ?? "");
  const offlineMutationId = String(metadata.offlineMutationId ?? "");
  const modalTitle = isMutationFailure
    ? t("syncErrorDetail.titleMutation")
    : t("syncErrorDetail.title");
  const titleId = isMutationFailure
    ? "offline-sync-error-detail-title"
    : "inspection-sync-error-detail-title";

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 900,
          background: "var(--overlay-bg, rgba(0,0,0,0.5))",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 901,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 12,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "min(520px, 100%)",
            maxHeight: "min(80dvh, 640px)",
            background: "var(--neutral-0)",
            borderRadius: 12,
            boxShadow: "var(--shadow-2)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            pointerEvents: "auto",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderBottom: "1px solid var(--neutral-200)",
            }}
          >
            <h2
              id={titleId}
              style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--neutral-900)" }}
            >
              {modalTitle}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("syncErrorDetail.closeAria")}
              style={{
                width: 32,
                height: 32,
                border: "none",
                borderRadius: 6,
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--neutral-600)",
              }}
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <div style={{ padding: "12px 14px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, color: "var(--neutral-700)", lineHeight: 1.5 }}>
              {isMutationFailure ? (
                <>
                  {mutationType ? (
                    <p style={{ margin: 0 }}>
                      <strong>{t("syncErrorDetail.mutationType")}:</strong> {mutationType}
                    </p>
                  ) : null}
                  {itemSummary ? (
                    <p style={{ margin: mutationType ? "4px 0 0" : 0 }}>
                      <strong>{t("syncErrorDetail.item")}:</strong> {itemSummary}
                    </p>
                  ) : null}
                </>
              ) : (
                <p style={{ margin: 0 }}>
                  <strong>{t("syncErrorDetail.form")}:</strong> {formName}
                  {category ? ` (${category.replace(/_/g, " ")})` : ""}
                </p>
              )}
              {locationParts.length > 0 ? (
                <p style={{ margin: "4px 0 0" }}>
                  <strong>{t("syncErrorDetail.location")}:</strong> {locationParts.join(" · ")}
                </p>
              ) : null}
              {outcome && !isMutationFailure ? (
                <p style={{ margin: "4px 0 0" }}>
                  <strong>{t("syncErrorDetail.outcome")}:</strong> {outcome}
                </p>
              ) : null}
              {offlineMutationId ? (
                <p style={{ margin: "4px 0 0", wordBreak: "break-all" }}>
                  <strong>{t("syncErrorDetail.offlineMutationId")}:</strong> {offlineMutationId}
                </p>
              ) : null}
              <p style={{ margin: "4px 0 0", color: "var(--neutral-500)" }}>
                {t("syncErrorDetail.attemptsSummary", { count: syncErrors.length })}
                {" · "}
                {relativeTime(createdAt, t)}
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {syncErrors.map((entry, index) => (
                <AttemptRow
                  key={`${entry.attempt}-${entry.recordedAt}`}
                  entry={entry}
                  defaultExpanded={index === 0}
                  t={t}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

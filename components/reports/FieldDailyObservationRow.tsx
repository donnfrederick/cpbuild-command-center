"use client";

import { ChevronRight, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ObsSummary } from "@/components/projects/UnitCards";
import { FieldNotePhotoStrip } from "@/components/shared/FieldNotePhotoStrip";

const OBS_TYPE_KEYS: Record<string, string> = {
  QUALITY: "obsTypeQuality",
  PROGRESS: "obsTypeProgress",
  SAFETY: "obsTypeSafety",
  OTHER: "obsTypeOther",
};

const OBS_TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  QUALITY: { bg: "var(--primary-50)", color: "var(--primary-700)" },
  PROGRESS: { bg: "var(--success-100)", color: "var(--success-700)" },
  SAFETY: { bg: "var(--warning-100)", color: "var(--warning-600)" },
  OTHER: { bg: "var(--neutral-100)", color: "var(--neutral-600)" },
};

function formatHubFieldNoteTime(
  iso: string,
  t: (key: "hubFieldNotesTimeJustNow" | "hubFieldNotesTimeMinutes" | "hubFieldNotesTimeHours" | "hubFieldNotesTimeDays", values?: { n: number }) => string,
): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t("hubFieldNotesTimeJustNow");
  if (diff < 3600) return t("hubFieldNotesTimeMinutes", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("hubFieldNotesTimeHours", { n: Math.floor(diff / 3600) });
  if (diff < 604800) return t("hubFieldNotesTimeDays", { n: Math.floor(diff / 86400) });
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Observation row — matches project hub field notes styling. */
export function FieldDailyObservationRow({
  obs,
  onClick,
}: {
  obs: ObsSummary;
  onClick: () => void;
}) {
  const tProjects = useTranslations("projects");
  const tUnits = useTranslations("units");
  const typeKey = OBS_TYPE_KEYS[obs.observationType] ?? "obsTypeOther";
  const typeStyle = OBS_TYPE_STYLES[obs.observationType] ?? OBS_TYPE_STYLES.OTHER;
  const authorName = obs.author.name ?? obs.author.email.split("@")[0];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        width: "100%",
        padding: "10px 12px",
        backgroundColor: "var(--color-surface)",
        borderBottom: "1px solid var(--neutral-100)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={onClick}
          style={{
            display: "block",
            width: "100%",
            padding: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, overflow: "hidden" }}>
            <span
              style={{
                flexShrink: 0,
                padding: "2px 8px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                backgroundColor: typeStyle.bg,
                color: typeStyle.color,
              }}
            >
              {tUnits(typeKey)}
            </span>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--neutral-900)",
                lineHeight: 1.35,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {obs.title || obs.description || tProjects("hubFieldNotesObsFallbackTitle")}
            </p>
          </div>
          {obs.description && obs.title && (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "var(--text-body)",
                color: "var(--neutral-700)",
                lineHeight: 1.45,
                whiteSpace: "pre-wrap",
              }}
            >
              {obs.description}
            </p>
          )}
          <span style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 3, display: "block" }}>
            {authorName} · {formatHubFieldNoteTime(obs.createdAt, tProjects)}
          </span>
          {obs._count.comments > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                marginTop: 6,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--primary-600)",
                backgroundColor: "var(--primary-50)",
                borderRadius: 99,
                padding: "2px 8px",
              }}
            >
              <MessageSquare size={11} aria-hidden />
              {obs._count.comments}
            </span>
          )}
        </button>
        <FieldNotePhotoStrip attachments={obs.attachments} />
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-hidden
        tabIndex={-1}
        style={{
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          flexShrink: 0,
          marginTop: 4,
        }}
      >
        <ChevronRight size={14} style={{ color: "var(--neutral-300)" }} />
      </button>
    </div>
  );
}

"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";

export type ProjectLifecycleStatus = "Active" | "Completed" | "Planning" | "On Hold";

interface StatusBadgeProps {
  /** Unifier phase / label (e.g. `CP_PROJECT_PHASEPD`) — shown as-is when not a known lifecycle key */
  label: string;
  /** Shell lifecycle (`UUU_SHELL_STATUS` mapped) — drives colors when no phase keyword matches */
  lifecycleStatus: ProjectLifecycleStatus;
}

const LIFECYCLE_STYLES: Record<ProjectLifecycleStatus, CSSProperties> = {
  Active: {
    color: "var(--green-600)",
    backgroundColor: "var(--green-100)",
  },
  Completed: {
    color: "var(--color-text-tertiary)",
    backgroundColor: "var(--color-surface-sunken)",
  },
  Planning: {
    color: "var(--amber-700)",
    backgroundColor: "var(--amber-100)",
  },
  "On Hold": {
    color: "var(--color-error)",
    backgroundColor: "var(--color-error-subtle)",
  },
};

/**
 * Keyword-to-color mapping for Unifier phase labels (CP_PROJECT_PHASEPD).
 * Checked in priority order — first match wins. Covers common CP Build phase strings.
 */
const PHASE_KEYWORD_STYLES: Array<{ keywords: string[]; style: CSSProperties }> = [
  {
    keywords: ["construct", "production", "install", "assembly"],
    style: { color: "var(--color-secondary-hover)", backgroundColor: "var(--color-secondary-subtle)" },
  },
  {
    keywords: ["ship", "deliver", "logistics"],
    style: { color: "var(--color-accent-hover)", backgroundColor: "var(--color-accent-subtle)" },
  },
  {
    keywords: ["pre-con", "pre con", "bid", "submittal", "design", "planning"],
    style: { color: "var(--amber-700)", backgroundColor: "var(--amber-100)" },
  },
  {
    keywords: ["complete", "closeout", "warranty", "handover", "archive"],
    style: { color: "var(--color-text-tertiary)", backgroundColor: "var(--color-surface-sunken)" },
  },
  {
    keywords: ["hold", "cancel", "pause", "suspend"],
    style: { color: "var(--color-error)", backgroundColor: "var(--color-error-subtle)" },
  },
];

/**
 * Resolves the badge color by checking the phase label text first, then falling
 * back to the lifecycle-based mapping. Phase keywords take priority because
 * Unifier's UUU_SHELL_STATUS often returns unmapped values that default to "Planning".
 */
function resolvePhaseStyle(label: string, lifecycleStatus: ProjectLifecycleStatus): CSSProperties {
  const lower = label.toLowerCase();
  for (const { keywords, style } of PHASE_KEYWORD_STYLES) {
    if (keywords.some((k) => lower.includes(k))) return style;
  }
  return LIFECYCLE_STYLES[lifecycleStatus];
}

const KNOWN_LIFECYCLE: readonly string[] = ["Active", "Completed", "Planning", "On Hold"];

export function StatusBadge({ label, lifecycleStatus }: StatusBadgeProps) {
  const t = useTranslations("status");
  const trimmed = label.trim();
  const displayText =
    trimmed === ""
      ? "—"
      : KNOWN_LIFECYCLE.includes(trimmed)
        ? t(trimmed as ProjectLifecycleStatus)
        : trimmed;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 12px",
        borderRadius: "var(--radius-pill)",
        fontSize: "var(--text-caption, 12px)",
        fontWeight: 700,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        ...resolvePhaseStyle(trimmed, lifecycleStatus),
      }}
    >
      {displayText}
    </span>
  );
}

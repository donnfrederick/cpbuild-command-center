"use client";

import type { ReactNode } from "react";

export type ToolbarActionVariant = "default" | "filter" | "filter-surface";

interface ToolbarActionButtonProps {
  label?: string;
  icon?: ReactNode;
  active?: boolean;
  badge?: number;
  onClick: () => void;
  tooltip?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  /** Filled filter trigger — `filter-surface` on white/light pages; `filter` on grey canvas. */
  variant?: ToolbarActionVariant;
}

export function ToolbarActionButton({
  label,
  icon,
  active = false,
  badge,
  onClick,
  tooltip,
  ariaLabel,
  disabled = false,
  className = "",
  variant = "default",
}: ToolbarActionButtonProps) {
  const classes = [
    "toolbar-action",
    variant === "filter" ? "toolbar-action--filter" : "",
    variant === "filter-surface" ? "toolbar-action--filter-surface" : "",
    label ? "" : "toolbar-action--icon-only",
    active ? "toolbar-action--active" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel ?? tooltip ?? label}
      className={classes}
    >
      {icon}
      {label}
      {badge != null && badge > 0 && (
        <span className="toolbar-action__badge">{badge}</span>
      )}
    </button>
  );
}

"use client";

import {
  Clipboard,
  ClipboardCheck,
  Copy,
  Hammer,
  Minus,
  Package,
} from "lucide-react";
import { combinedOptionDisplay } from "@/lib/scope-combined-options";
import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";

function StatusIcon({
  icon,
  color,
}: {
  icon?: ReturnType<typeof combinedOptionDisplay>["icon"];
  color: string;
}) {
  const shared = { color, flexShrink: 0 } as const;
  if (icon === "package") return <Package size={15} strokeWidth={2.35} style={shared} aria-hidden />;
  if (icon === "stack") return <Copy size={15} strokeWidth={2.35} style={shared} aria-hidden />;
  if (icon === "hammer") return <Hammer size={15} strokeWidth={2.35} style={shared} aria-hidden />;
  if (icon === "clipboard") return <Clipboard size={15} strokeWidth={2.35} style={shared} aria-hidden />;
  if (icon === "clipboard-check") return <ClipboardCheck size={15} strokeWidth={2.35} style={shared} aria-hidden />;
  if (icon === "dash") return <Minus size={15} strokeWidth={2.35} style={shared} aria-hidden />;
  return <Minus size={15} strokeWidth={2.35} style={shared} aria-hidden />;
}

/** Scope status pill — matches Locations page combined status styling. */
export function FieldDailyScopeStatusBadge({
  scopeStage,
  scopeStatus,
  label,
}: {
  scopeStage?: string | null;
  scopeStatus?: string | null;
  label?: string;
}) {
  if (!scopeStage || !scopeStatus) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: "var(--radius-sm)",
          fontSize: 13,
          fontWeight: 700,
          backgroundColor: "var(--neutral-100)",
          color: "var(--neutral-700)",
        }}
      >
        {label ?? "Status updated"}
      </span>
    );
  }

  const display = combinedOptionDisplay(scopeStage as ScopeStage, scopeStatus as ScopeStatus);
  const textColor = display.textColor ?? display.color;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: "var(--radius-sm)",
        fontSize: 13,
        fontWeight: 700,
        backgroundColor: display.triggerBg ?? display.bg,
        color: textColor,
        lineHeight: 1.2,
      }}
    >
      <StatusIcon icon={display.icon} color={textColor} />
      {label ?? display.label}
    </span>
  );
}

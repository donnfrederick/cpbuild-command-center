"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function FieldDailyExpandableGroup({
  summary,
  children,
  defaultExpanded = false,
  ariaLabel,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  ariaLabel: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div style={{ borderBottom: "1px solid var(--neutral-100)" }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={ariaLabel}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 0",
          border: "none",
          background: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>{summary}</div>
        <span style={{ flexShrink: 0, color: "var(--neutral-500)", display: "flex" }}>
          {expanded ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </span>
      </button>
      {expanded && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </div>
  );
}

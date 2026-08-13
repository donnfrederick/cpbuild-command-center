import type { CSSProperties } from "react";

export function filterPillStyle(active: boolean, disabled = false): CSSProperties {
  if (disabled) {
    return {
      padding: "4px 10px",
      borderRadius: 999,
      border: "1px solid var(--neutral-200)",
      backgroundColor: "var(--neutral-50)",
      color: "var(--neutral-400)",
      fontSize: 11,
      fontWeight: 500,
      cursor: "not-allowed",
      lineHeight: 1.2,
      opacity: 0.7,
    };
  }
  return {
    padding: "4px 10px",
    borderRadius: 999,
    border: `1px solid ${active ? "var(--neutral-900)" : "var(--neutral-300)"}`,
    backgroundColor: active ? "var(--neutral-100)" : "var(--neutral-0)",
    color: active ? "var(--neutral-900)" : "var(--neutral-700)",
    fontSize: 11,
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    lineHeight: 1.2,
  };
}

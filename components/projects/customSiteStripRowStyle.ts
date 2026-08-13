import type { CSSProperties } from "react";

/** Shared row shell for global + building-wide custom location strips. */
export const CUSTOM_SITE_STRIP_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  height: 40,
  padding: "0 10px 0 8px",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-card)",
  cursor: "pointer",
  userSelect: "none",
  boxSizing: "border-box",
};

export const CUSTOM_SITE_STRIP_TITLE_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "var(--tracking-tight)",
  lineHeight: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const CUSTOM_SITE_STRIP_COUNT_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 22,
  padding: "0 8px",
  borderRadius: "var(--radius-pill)",
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

/** Longhand frame + left stripe — avoids React warning when toggling border vs borderLeft. */
export function customSiteStripBarBorder(
  stripeColor: string,
  showFrame: boolean
): Pick<CSSProperties, "borderTop" | "borderRight" | "borderBottom" | "borderLeft"> {
  const frame = showFrame ? "1px solid var(--neutral-200)" : "none";
  return {
    borderTop: frame,
    borderRight: frame,
    borderBottom: frame,
    borderLeft: `4px solid ${stripeColor}`,
  };
}

export function customSiteStripAddButtonStyle(expanded: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    flexShrink: 0,
    padding: 0,
    border: "none",
    borderRadius: 4,
    backgroundColor: expanded ? "rgba(255,255,255,0.14)" : "var(--color-surface)",
    color: expanded ? "var(--neutral-0)" : "var(--color-text-secondary)",
    cursor: "pointer",
  };
}

import type { CSSProperties } from "react";

/** 12px caption × 1.08 line-height × 2 lines */
export const CUSTOM_SITE_TILE_TITLE_BLOCK_HEIGHT = 26;

/** 8px padding × 2 + title block + 4px gap + ~12px subtitle row */
export const CUSTOM_SITE_TILE_HEIGHT = 58;

export const customSiteTileTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "var(--text-caption)",
  fontWeight: "var(--font-weight-extrabold)",
  color: "var(--unit-grid-card-fg)",
  letterSpacing: "var(--tracking-tight)",
  lineHeight: 1.08,
  width: "100%",
  minHeight: CUSTOM_SITE_TILE_TITLE_BLOCK_HEIGHT,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  textOverflow: "ellipsis",
  wordBreak: "break-word",
};

export const customSiteTileShellStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  width: "100%",
  minWidth: 0,
  height: CUSTOM_SITE_TILE_HEIGHT,
  padding: 8,
  borderRadius: "var(--unit-grid-card-radius)",
  backgroundColor: "var(--unit-grid-card-bg)",
  boxShadow: "var(--unit-grid-card-shadow)",
  boxSizing: "border-box",
  overflow: "hidden",
};

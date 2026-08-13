"use client";

/**
 * Custom SVG grid tile for inspection pass/fail — matches Hannah v1 mock:
 * thin muted shield outline + soft fill; bold type abbrev inside (CI, FV, 2C).
 * Scope code (CAB, TOP) renders as HTML below the icon on grid tiles.
 */

const GRID_VIEWBOX = "0 0 40 52";
const COMPACT_VIEWBOX = "0 0 40 36";

/** Tight crop so the shield fills the same square footprint as Lucide icons on grid tiles. */
const COMPACT_TILE_VIEWBOX = "6.5 2.5 27 31";

/** Optical center of shield field — slightly above midpoint for even padding. */
const SHIELD_LABEL_X = 20;
const SHIELD_LABEL_Y = 15.6;

/** Grid scope tiles — icon row only (Lucide icons use the same square size). */
export const GRID_SCOPE_TILE_ICON_SIZE = 18;

/** Scope code label below the icon (CAB, TOP, …) — independent of icon size. */
export const GRID_SCOPE_TILE_ABBREV_FONT_SIZE = 10;

/** Thin outline on grid tiles — text carries the visual weight, not the stroke. */
export const COMPACT_TILE_STROKE_WIDTH = 1.15;

/** Heraldic shield — flat top, tapered sides, pointed base. */
const SHIELD_PATH =
  "M20 3.5 7.25 8.1V18.4c0 6.8 5.2 12.2 12.75 14.6 7.55-2.4 12.75-7.8 12.75-14.6V8.1L20 3.5Z";

function inspectionFontSize(label: string, compact: boolean, squareTile: boolean): number {
  const len = label.length;
  if (compact && squareTile) return len >= 3 ? 11 : 14;
  if (compact) return len >= 3 ? 11.5 : 14;
  return len >= 3 ? 9 : 10.5;
}

export function ScopeInspectionShieldIcon({
  inspectionLabel,
  scopeLabel,
  color,
  strokeColor,
  fillColor,
  width,
  height,
  compact = false,
}: {
  /** Inspection type inside shield — CI, FV, 2C, … */
  inspectionLabel: string;
  /** Scope code below shield — CAB, TOP, … (grid tiles only; prefer HTML label in grid) */
  scopeLabel?: string;
  /** Bold label text — full-contrast tile foreground. */
  color: string;
  /** Muted shield outline tinted by tile bg; falls back to semi-transparent label color. */
  strokeColor?: string;
  /** Soft shield interior; falls back to label color at low opacity. */
  fillColor?: string;
  /** Render width in px — omit when `height` is set on compact tiles */
  width?: number;
  /** Render height in px — grid tiles pass GRID_SCOPE_TILE_ICON_SIZE when compact */
  height?: number;
  /** Compact: shield + abbrev only (dropdowns); default false = full grid tile graphic */
  compact?: boolean;
}) {
  const inspection = inspectionLabel.toUpperCase();
  const scope = scopeLabel?.toUpperCase();
  const showScope = !compact && scope != null && scope.length > 0;
  const squareTile = compact && height != null;
  const viewBox = showScope ? GRID_VIEWBOX : squareTile ? COMPACT_TILE_VIEWBOX : COMPACT_VIEWBOX;
  const inspSize = inspectionFontSize(inspection, compact, squareTile);
  const useMutedShield = squareTile && strokeColor != null && fillColor != null;

  const renderHeight = height ?? Math.round((width ?? GRID_SCOPE_TILE_ICON_SIZE) * (showScope ? 52 / 40 : 36 / 40));
  const renderWidth = width ?? (squareTile ? renderHeight : height != null ? Math.round(height * (40 / 36)) : showScope ? 38 : GRID_SCOPE_TILE_ICON_SIZE * (40 / 36));

  return (
    <svg
      aria-hidden
      width={renderWidth}
      height={renderHeight}
      viewBox={viewBox}
      fill="none"
      style={{ flexShrink: 0, display: "block" }}
    >
      <path
        d={SHIELD_PATH}
        fill={useMutedShield ? fillColor : color}
        fillOpacity={useMutedShield ? 1 : 0.24}
        stroke={useMutedShield ? strokeColor : color}
        strokeWidth={squareTile ? COMPACT_TILE_STROKE_WIDTH : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x={SHIELD_LABEL_X}
        y={SHIELD_LABEL_Y}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontSize={inspSize}
        fontWeight="800"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        letterSpacing={inspection.length >= 3 ? "-0.04em" : "0.02em"}
      >
        {inspection}
      </text>
      {showScope ? (
        <text
          x="20"
          y="47"
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize="11.5"
          fontWeight="800"
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          letterSpacing="0.02em"
        >
          {scope}
        </text>
      ) : null}
    </svg>
  );
}

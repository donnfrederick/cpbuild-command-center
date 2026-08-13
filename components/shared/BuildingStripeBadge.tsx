import { Building2 } from "lucide-react";
import type { CSSProperties } from "react";
import { buildingLabelTextColor } from "@/lib/media/media-location-list";

/** Building pill chip — matches Locations page `BuildingGroupHeaderRow` styling. */
export function BuildingStripeBadge({
  label,
  buildingStripe,
  iconSize = 13,
  className,
  style,
  truncateLabel = true,
}: {
  label: string;
  buildingStripe: string;
  iconSize?: number;
  className?: string;
  style?: CSSProperties;
  truncateLabel?: boolean;
}) {
  const labelTextColor = buildingLabelTextColor(buildingStripe);

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 12px",
        borderRadius: "var(--radius-pill)",
        backgroundColor: buildingStripe,
        border: "none",
        minWidth: truncateLabel ? 0 : undefined,
        width: truncateLabel ? undefined : "max-content",
        maxWidth: truncateLabel ? "100%" : "none",
        boxShadow: "var(--shadow-card)",
        ...style,
      }}
    >
      <Building2
        size={iconSize}
        style={{ color: labelTextColor, opacity: 0.92, flexShrink: 0 }}
        aria-hidden
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: labelTextColor,
          textTransform: "uppercase",
          letterSpacing: "var(--tracking-ui)",
          whiteSpace: "nowrap",
          overflow: truncateLabel ? "hidden" : "visible",
          textOverflow: truncateLabel ? "ellipsis" : "clip",
        }}
      >
        {label}
      </span>
    </span>
  );
}

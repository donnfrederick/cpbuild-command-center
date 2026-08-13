"use client";

import { Plus } from "lucide-react";
import { CUSTOM_SITE_TILE_HEIGHT } from "@/components/projects/customSiteLocationTileStyle";

interface CustomSiteLocationAddTileProps {
  ariaLabel: string;
  onClick: () => void;
}

/** Grid cell — wraps with custom location tiles in `units-grid-squares`. */
export function CustomSiteLocationAddTile({ ariaLabel, onClick }: CustomSiteLocationAddTileProps) {
  return (
    <div style={{ minWidth: 0 }}>
      <button
        type="button"
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: CUSTOM_SITE_TILE_HEIGHT,
          padding: 8,
          borderRadius: "var(--unit-grid-card-radius)",
          border: "1px dashed var(--neutral-300)",
          backgroundColor: "var(--neutral-50)",
          color: "var(--neutral-500)",
          cursor: "pointer",
          boxSizing: "border-box",
        }}
      >
        <Plus size={18} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}

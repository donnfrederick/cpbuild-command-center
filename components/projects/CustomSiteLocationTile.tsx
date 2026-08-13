"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";
import {
  customSiteTileShellStyle,
  customSiteTileTitleStyle,
} from "@/components/projects/customSiteLocationTileStyle";

interface CustomSiteLocationTileProps {
  location: CustomSiteLocation;
  variant?: "summary" | "level";
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function CustomSiteLocationTile({
  location,
  variant = "summary",
  onOpen,
  onEdit,
  onDelete,
}: CustomSiteLocationTileProps) {
  const t = useTranslations("units.customSite");

  return (
    <div
      style={{
        ...customSiteTileShellStyle,
        borderLeft:
          variant === "level" ? "3px solid var(--primary-600)" : undefined,
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          gap: 4,
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
          overflow: "hidden",
        }}
      >
        <span style={customSiteTileTitleStyle}>{location.name}</span>
        <span
          style={{
            fontSize: 10,
            lineHeight: 1.2,
            color: "var(--neutral-500)",
            width: "100%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {t("counts", {
            observations: location.observationCount,
            issues: location.issueCount,
          })}
        </span>
      </button>

      {/* Vertically stacked action buttons — 20px each, 2px gap = 42px total = exact inner height */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <button
          type="button"
          aria-label={t("editAria", { name: location.name })}
          title={t("editAria", { name: location.name })}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          style={{
            width: 20,
            height: 20,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--neutral-100)",
            color: "var(--neutral-500)",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Pencil size={11} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={t("deleteAria", { name: location.name })}
          title={t("deleteAria", { name: location.name })}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            width: 20,
            height: 20,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--neutral-100)",
            color: "var(--neutral-500)",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Trash2 size={11} aria-hidden />
        </button>
      </div>
    </div>
  );
}

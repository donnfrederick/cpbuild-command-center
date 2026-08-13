"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import {
  cardLocationBuilderFields,
  type LocationBuilderFieldSource,
} from "@/lib/location-builder-display";

function lineStyle({
  variant,
  muted,
  onDark,
}: {
  variant: "inline" | "compact";
  muted: boolean;
  onDark: boolean;
}): CSSProperties {
  const fontSize = onDark ? 12 : variant === "compact" ? "var(--text-micro)" : 12;
  const color = onDark
    ? "rgba(255,255,255,0.78)"
    : muted
      ? "var(--neutral-500)"
      : "var(--neutral-600)";

  return {
    fontSize,
    fontWeight: 600,
    color,
    lineHeight: 1.25,
    minWidth: 0,
    maxWidth: "100%",
    display: "block",
    whiteSpace: "normal",
    overflowWrap: "break-word",
    wordBreak: "normal",
  };
}

export function LocationBuilderMeta({
  card,
  variant = "inline",
  muted = false,
  onDark = false,
  includePhase = true,
  includeArea = true,
}: {
  card: LocationBuilderFieldSource;
  /** inline = location strip; compact = grid card meta lines */
  variant?: "inline" | "compact";
  muted?: boolean;
  onDark?: boolean;
  includePhase?: boolean;
  includeArea?: boolean;
}) {
  const t = useTranslations("units");
  const { buildPhase, area } = cardLocationBuilderFields(card);
  const showPhase = includePhase && Boolean(buildPhase);
  const showArea = includeArea && Boolean(area);
  if (!showPhase && !showArea) return null;

  const textStyle = lineStyle({ variant, muted, onDark });
  const stackVertical = variant === "compact";

  const phaseLabel = showPhase && buildPhase ? t("locationMetaPhaseLabel", { phase: buildPhase }) : null;
  const areaLabel = showArea && area ? t("locationMetaAreaLabel", { area }) : null;

  return (
    <span
      data-testid="location-builder-meta"
      style={{
        display: "flex",
        flexDirection: stackVertical ? "column" : "row",
        flexWrap: "wrap",
        alignItems: stackVertical ? "stretch" : "flex-start",
        gap: stackVertical ? 2 : 8,
        minWidth: 0,
        maxWidth: "100%",
        width: stackVertical ? "100%" : undefined,
      }}
    >
      {phaseLabel ? <span style={{ ...textStyle, width: stackVertical ? "100%" : undefined }}>{phaseLabel}</span> : null}
      {areaLabel ? <span style={{ ...textStyle, width: stackVertical ? "100%" : undefined }}>{areaLabel}</span> : null}
    </span>
  );
}

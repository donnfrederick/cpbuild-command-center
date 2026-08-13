"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, MapPin } from "lucide-react";
import {
  formatCaptureCoordinates,
  formatDistanceFromProjectMeters,
} from "@/lib/geo/format-capture-proximity";
import type { SerializedActivityLocation } from "@/lib/activity/activity-location-schema";

export interface ActivityLocationSectionProps {
  activityLocation?: SerializedActivityLocation | null;
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** GPS / field location block on activity feed cards — always rendered. */
export function ActivityLocationSection({ activityLocation }: ActivityLocationSectionProps) {
  const t = useTranslations("activityLog.gpsSection");
  const tCapture = useTranslations("captureMetadata");

  const loc: SerializedActivityLocation = activityLocation ?? { outcome: "legacy" };

  let primary = "";
  if (loc.outcome === "on_map") {
    if (loc.distanceFromProjectMeters != null) {
      primary = formatDistanceFromProjectMeters(loc.distanceFromProjectMeters);
    } else if (loc.latitude != null && loc.longitude != null) {
      primary = formatCaptureCoordinates(loc.latitude, loc.longitude);
    } else {
      primary = tCapture("locationNotRecordedUnavailable");
    }
  } else if (loc.outcome === "denied") {
    primary = tCapture("locationNotRecordedDenied");
  } else if (loc.outcome === "timeout") {
    primary = tCapture("locationNotRecordedTimeout");
  } else if (loc.outcome === "unavailable") {
    primary = tCapture("locationNotRecordedUnavailable");
  } else if (loc.outcome === "no_capture") {
    primary = t("notCaptured");
  } else {
    primary = t("preDatesGpsTracking");
  }

  const hasCoords =
    loc.outcome === "on_map" && loc.latitude != null && loc.longitude != null;

  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 10px",
        borderRadius: 6,
        backgroundColor: "var(--neutral-50)",
        border: "1px solid var(--neutral-200)",
        fontSize: 11,
        lineHeight: 1.45,
        color: "var(--neutral-700)",
      }}
      aria-label={t("sectionAriaLabel")}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontWeight: 600,
          color: "var(--neutral-800)",
          marginBottom: 4,
        }}
      >
        <MapPin size={12} style={{ flexShrink: 0 }} aria-hidden />
        {t("title")}
      </div>
      <div>{primary}</div>
      {hasCoords ? (
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {loc.distanceFromProjectMeters == null ? (
            <span>{formatCaptureCoordinates(loc.latitude!, loc.longitude!)}</span>
          ) : null}
          <a
            href={mapsUrl(loc.latitude!, loc.longitude!)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "var(--primary-700)",
              textDecoration: "none",
            }}
          >
            {t("openInMaps")}
            <ExternalLink size={11} aria-hidden />
          </a>
        </div>
      ) : null}
    </div>
  );
}

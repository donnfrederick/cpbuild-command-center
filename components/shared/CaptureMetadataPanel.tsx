"use client";

import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import {
  formatCaptureCoordinates,
  formatDistanceFromProjectMeters,
} from "@/lib/geo/format-capture-proximity";
import type { SerializedCaptureContext } from "@/lib/media/serialize-capture-context";

export interface CaptureMetadataPanelProps {
  captureContext: SerializedCaptureContext;
}

function formatRecordedAt(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** Full capture metadata panel for lightbox / detail views. */
export function CaptureMetadataPanel({ captureContext }: CaptureMetadataPanelProps) {
  const t = useTranslations("captureMetadata");
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";

  const hasCoords =
    captureContext.gpsStatus === "granted"
    && captureContext.latitude != null
    && captureContext.longitude != null;

  let locationPrimary = "";
  if (!hasCoords) {
    if (captureContext.gpsStatus === "denied") locationPrimary = t("locationNotRecordedDenied");
    else if (captureContext.gpsStatus === "timeout") locationPrimary = t("locationNotRecordedTimeout");
    else locationPrimary = t("locationNotRecordedUnavailable");
  } else if (captureContext.distanceFromProjectMeters != null) {
    locationPrimary = formatDistanceFromProjectMeters(captureContext.distanceFromProjectMeters);
  } else if (!captureContext.projectSiteAddressAtCapture) {
    locationPrimary = t("distanceNotCalculatedNoAddress");
  } else if (!captureContext.projectGeocodeAvailable) {
    locationPrimary = t("distanceNotCalculatedGeocodeFailed");
  } else {
    locationPrimary = t("distanceNotCalculatedNoProject");
  }

  const methodKey = `method_${captureContext.captureMethod}` as const;
  const shellKey = `shell_${captureContext.appShell}` as const;

  return (
    <section
      style={{
        marginTop: 10,
        padding: "10px 12px",
        borderRadius: 6,
        backgroundColor: "var(--neutral-800)",
        color: "var(--neutral-200)",
        fontSize: 12,
        lineHeight: 1.5,
      }}
      aria-label={t("panelAriaLabel")}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--neutral-100)" }}>
        {t("sectionLocation")}
      </div>
      <div>{locationPrimary}</div>
      {hasCoords ? (
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>{formatCaptureCoordinates(captureContext.latitude!, captureContext.longitude!)}</span>
          <a
            href={mapsUrl(captureContext.latitude!, captureContext.longitude!)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--primary-300)", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            {t("openInMaps")}
            <ExternalLink size={12} aria-hidden />
          </a>
        </div>
      ) : null}
      {hasCoords && captureContext.distanceFromProjectMeters == null ? (
        <div style={{ marginTop: 4, color: "var(--neutral-400)" }}>
          {!captureContext.projectSiteAddressAtCapture
            ? t("distanceNotCalculatedNoAddress")
            : !captureContext.projectGeocodeAvailable
              ? t("distanceNotCalculatedGeocodeFailed")
              : t("distanceNotCalculatedNoProject")}
        </div>
      ) : null}

      <div style={{ fontWeight: 600, marginTop: 10, marginBottom: 4, color: "var(--neutral-100)" }}>
        {t("sectionDevice")}
      </div>
      <div>{captureContext.deviceType}</div>
      <div>{captureContext.browser}</div>
      <div>{t(shellKey)}</div>
      <div>{t(methodKey)}</div>
      <div style={{ marginTop: 6, color: "var(--neutral-400)" }}>
        {t("recordedAt", { when: formatRecordedAt(captureContext.captureRecordedAt, locale) })}
      </div>
    </section>
  );
}

/** Returns true when attachment has capture metadata (non-legacy row). */
export function hasCaptureMetadata(
  captureContext: SerializedCaptureContext | null | undefined,
): captureContext is SerializedCaptureContext {
  return Boolean(captureContext?.captureRecordedAt);
}

"use client";

import { useTranslations } from "next-intl";
import {
  formatCaptureCoordinates,
  formatDistanceFromProjectMeters,
} from "@/lib/geo/format-capture-proximity";
import type { SerializedCaptureContext } from "@/lib/media/serialize-capture-context";

export interface CaptureLocationStripProps {
  captureContext: SerializedCaptureContext;
}

function gpsFailureMessage(
  status: SerializedCaptureContext["gpsStatus"],
  t: ReturnType<typeof useTranslations<"captureMetadata">>,
): string {
  if (status === "denied") return t("locationNotRecordedDenied");
  if (status === "timeout") return t("locationNotRecordedTimeout");
  return t("locationNotRecordedUnavailable");
}

/** Compact one-line GPS summary for lightboxes (under the image). */
export function CaptureLocationStrip({ captureContext }: CaptureLocationStripProps) {
  const t = useTranslations("captureMetadata");

  if (
    captureContext.gpsStatus === "granted"
    && captureContext.latitude != null
    && captureContext.longitude != null
  ) {
    const coord = formatCaptureCoordinates(captureContext.latitude, captureContext.longitude);
    const distance =
      captureContext.distanceFromProjectMeters != null
        ? formatDistanceFromProjectMeters(captureContext.distanceFromProjectMeters)
        : null;
    const line = distance ? `${distance} · ${coord}` : coord;
    return (
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 12,
          color: "var(--neutral-300)",
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        {line}
      </p>
    );
  }

  return (
    <p
      style={{
        margin: "8px 0 0",
        fontSize: 12,
        color: "var(--neutral-400)",
        textAlign: "center",
        lineHeight: 1.4,
      }}
    >
      {gpsFailureMessage(captureContext.gpsStatus, t)}
    </p>
  );
}

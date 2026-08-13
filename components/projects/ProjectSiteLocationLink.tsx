"use client";

import type { CSSProperties, MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { buildGoogleMapsSearchUrl } from "@/lib/maps-url";

export interface ProjectSiteLocationLinkProps {
  siteLocation: string;
  /** Optional capture handler (e.g. stopPropagation inside a parent card Link). */
  onClickCapture?: (e: MouseEvent<HTMLAnchorElement>) => void;
  style?: CSSProperties;
}

export function ProjectSiteLocationLink({
  siteLocation,
  onClickCapture,
  style,
}: ProjectSiteLocationLinkProps) {
  const t = useTranslations("projects");
  const mapUrl = buildGoogleMapsSearchUrl(siteLocation);
  const display = siteLocation.trim() || siteLocation;

  if (!mapUrl) {
    return (
      <span style={style}>
        {display}
      </span>
    );
  }

  return (
    <a
      href={mapUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("openAddressInMapsAria", { address: display })}
      onClickCapture={onClickCapture}
      style={{
        color: "var(--primary-600)",
        ...style,
      }}
      className="no-underline hover:underline"
    >
      {display}
    </a>
  );
}

"use client";

/**
 * MediaWithOfflineFallback — wraps <img> and <video> elements.
 *
 * When the media URL fails to load (e.g. device is offline and the URL
 * hasn't been cached by the service worker), a styled placeholder is
 * shown instead of a broken-image icon.
 */

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";

interface ImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
}

interface VideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  placeholderLabel?: string;
}

function OfflinePlaceholder({ label = "Media unavailable offline" }: { label?: string }) {
  return (
    <div
      aria-label={label}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        backgroundColor: "var(--neutral-100)",
        color: "var(--neutral-400)",
        fontSize: 11,
        fontWeight: 500,
        borderRadius: 6,
        width: "100%",
        height: "100%",
        minHeight: 80,
        textAlign: "center",
        padding: 8,
      }}
    >
      <ImageOff size={20} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function ImgWithOfflineFallback({ src, alt, ...rest }: ImgProps) {
  const t = useTranslations("offlineMedia");
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <OfflinePlaceholder label={t("photoUnavailable")} />;
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}

export function VideoWithOfflineFallback({ src, placeholderLabel, ...rest }: VideoProps) {
  const t = useTranslations("offlineMedia");
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <OfflinePlaceholder label={placeholderLabel ?? t("videoUnavailable")} />;
  }

  return (
    <video
      src={src}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}

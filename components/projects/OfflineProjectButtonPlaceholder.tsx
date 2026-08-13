"use client";

/**
 * SSR placeholder for OfflineProjectButton — always "off" state so hydration
 * matches before the client-only button loads localStorage prefs.
 */

import { CloudDownload } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
  compact?: boolean;
}

export function OfflineProjectButtonPlaceholder({ compact = false }: Props) {
  const t = useTranslations("offlineProjectButton");

  return (
    <div
      className="relative flex items-center"
      style={compact ? { minWidth: 0, maxWidth: "100%" } : undefined}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        aria-label={t("preDownloadAriaLabel")}
        className={[
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
          compact ? "max-w-full shrink min-w-0" : "",
          "border border-neutral-200 bg-white text-neutral-600",
        ].join(" ")}
        style={
          compact
            ? { whiteSpace: "normal", textAlign: "left", lineHeight: 1.25 }
            : { whiteSpace: "nowrap" }
        }
      >
        <CloudDownload size={12} aria-hidden className="shrink-0" />
        {compact ? null : <span>{t("preDownload")}</span>}
      </button>
    </div>
  );
}

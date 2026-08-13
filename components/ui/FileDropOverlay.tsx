"use client";

import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useIsDesktopViewport } from "@/hooks/use-file-drop";

export interface FileDropOverlayProps {
  /** Show idle desktop hint (default true) */
  showHint?: boolean;
  /** Hide hint when uploads are disabled / full */
  disabled?: boolean;
  /** Hint copy; defaults to common.dropFilesHint */
  hint?: string;
}

export function FileDropOverlay({
  showHint = true,
  disabled = false,
  hint,
}: FileDropOverlayProps) {
  const t = useTranslations("common");
  const isDesktop = useIsDesktopViewport();

  if (!showHint || !isDesktop || disabled) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="file-drop-hint"
      style={{
        marginTop: "var(--space-2)",
        padding: "var(--space-3) var(--space-3)",
        borderRadius: "var(--radius-md)",
        border: "1.5px dashed var(--neutral-300)",
        backgroundColor: "color-mix(in srgb, var(--neutral-100) 60%, transparent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--inline-gap)",
        pointerEvents: "none",
      }}
    >
      <Upload size={14} color="var(--neutral-400)" aria-hidden />
      <span
        style={{
          fontSize: "var(--text-caption)",
          color: "var(--neutral-500)",
          fontWeight: 500,
        }}
      >
        {hint ?? t("dropFilesHint")}
      </span>
    </div>
  );
}

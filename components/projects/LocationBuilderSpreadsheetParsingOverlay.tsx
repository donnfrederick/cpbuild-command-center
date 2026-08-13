"use client";

import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useIsBrowser } from "@/hooks/use-is-browser";

export interface LocationBuilderSpreadsheetParsingOverlayProps {
  fileName?: string | null;
}

export function LocationBuilderSpreadsheetParsingOverlay({
  fileName,
}: LocationBuilderSpreadsheetParsingOverlayProps) {
  const t = useTranslations("projects");
  const isBrowser = useIsBrowser();

  if (!isBrowser) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="location-builder-spreadsheet-parsing"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 490,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.45))",
      }}
    >
      <div
        style={{
          width: "min(360px, 100%)",
          padding: "22px 24px",
          borderRadius: "var(--radius-md, 8px)",
          backgroundColor: "var(--neutral-0)",
          boxShadow: "var(--shadow-2)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          textAlign: "center",
        }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--primary-600)" }} aria-hidden />
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--neutral-900)" }}>
          {t("parseSpreadsheetTitle")}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-600)", lineHeight: 1.45 }}>
          {fileName ? t("parseSpreadsheetBodyNamed", { name: fileName }) : t("parseSpreadsheetBody")}
        </p>
      </div>
    </div>,
    document.body,
  );
}

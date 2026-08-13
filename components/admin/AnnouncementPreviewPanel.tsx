"use client";

import { useMemo, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AnnouncementOverlay, type AnnouncementDisplayContent } from "@/components/announcements/AnnouncementOverlay";
import type { AnnouncementPreviewPayload } from "@/lib/announcements/types";
import { effectiveAnnouncementCtaHref } from "@/lib/announcements/announcement-cta";
import { sanitizeAnnouncementHtml } from "@/lib/announcements/sanitize-announcement-html";

const PREVIEW_WIDTHS = {
  mobile: 375,
  tablet: 768,
  desktop: 1280,
} as const;

type PreviewViewport = keyof typeof PREVIEW_WIDTHS;

export interface AnnouncementPreviewDraft {
  titleEn: string;
  titleEs: string;
  bodyEn: string;
  bodyEs: string;
  heroImageUrlEn: string | null;
  heroImageUrlEs: string | null;
  ctaLabelEn: string | null;
  ctaLabelEs: string | null;
  ctaAction: AnnouncementPreviewPayload["ctaAction"];
  ctaHref: string | null;
}

interface AnnouncementPreviewPanelProps {
  draft: AnnouncementPreviewDraft;
  open: boolean;
  onClose: () => void;
}

export function AnnouncementPreviewPanel({ draft, open, onClose }: AnnouncementPreviewPanelProps) {
  const t = useTranslations("admin.announcements");
  const router = useRouter();
  const [viewport, setViewport] = useState<PreviewViewport>("mobile");
  const [locale, setLocale] = useState<"en" | "es">("en");

  const content: AnnouncementDisplayContent = useMemo(
    () => ({
      title: locale === "es" ? draft.titleEs : draft.titleEn,
      bodyHtml: sanitizeAnnouncementHtml(locale === "es" ? draft.bodyEs : draft.bodyEn),
      heroImageUrl:
        locale === "es" ? draft.heroImageUrlEs ?? draft.heroImageUrlEn : draft.heroImageUrlEn,
      ctaLabel: locale === "es" ? draft.ctaLabelEs : draft.ctaLabelEn,
      ctaAction: draft.ctaAction,
      ctaHref: draft.ctaHref,
    }),
    [draft, locale],
  );

  const handlePreviewCta = useCallback(() => {
    const href = effectiveAnnouncementCtaHref(draft.ctaAction, draft.ctaHref);
    onClose();
    if (href) router.push(href);
  }, [draft.ctaAction, draft.ctaHref, onClose, router]);

  if (!open) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 900,
          backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.35))",
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          right: 12,
          zIndex: 901,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          padding: 10,
          borderRadius: 8,
          backgroundColor: "var(--neutral-0)",
          boxShadow: "var(--shadow-2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <select
          aria-label={t("previewViewport")}
          value={viewport}
          onChange={(e) => setViewport(e.target.value as PreviewViewport)}
          style={controlStyle}
        >
          <option value="mobile">{t("previewMobile")}</option>
          <option value="tablet">{t("previewTablet")}</option>
          <option value="desktop">{t("previewDesktop")}</option>
        </select>
        <select
          aria-label={t("previewLocale")}
          value={locale}
          onChange={(e) => setLocale(e.target.value as "en" | "es")}
          style={controlStyle}
        >
          <option value="en">EN</option>
          <option value="es">ES</option>
        </select>
        <button type="button" onClick={onClose} style={controlStyle}>
          {t("closePreview")}
        </button>
      </div>

      <AnnouncementOverlay
        content={content}
        mode="preview"
        previewWidthPx={PREVIEW_WIDTHS[viewport]}
        onDismiss={onClose}
        onCta={handlePreviewCta}
      />
    </>
  );
}

const controlStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--neutral-200)",
  backgroundColor: "var(--neutral-0)",
  fontSize: 13,
};

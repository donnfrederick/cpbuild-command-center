"use client";

import { useCallback, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useIsBrowser } from "@/hooks/use-is-browser";
import { useAnnouncementViewportMode } from "@/hooks/use-announcement-viewport-mode";
import {
  effectiveAnnouncementCtaHref,
  shouldShowAnnouncementLinkButton,
} from "@/lib/announcements/announcement-cta";
import type { AnnouncementCtaAction } from "@/lib/announcements/types";

const OVERLAY_Z_INDEX = 650;

export interface AnnouncementDisplayContent {
  title: string;
  bodyHtml: string;
  heroImageUrl: string | null;
  ctaLabel: string | null;
  ctaAction: AnnouncementCtaAction;
  ctaHref: string | null;
}

export interface AnnouncementOverlayProps {
  content: AnnouncementDisplayContent;
  mode: "live" | "preview";
  previewWidthPx?: number;
  onDismiss: () => void;
  onCta?: () => void;
}

export function AnnouncementOverlay({
  content,
  mode,
  previewWidthPx,
  onDismiss,
  onCta,
}: AnnouncementOverlayProps) {
  const tAdmin = useTranslations("admin.announcements");
  const tCommon = useTranslations("common");
  const isBrowser = useIsBrowser();
  const viewportMode = useAnnouncementViewportMode();
  const isMobile = viewportMode === "mobile";
  const isTablet = viewportMode === "tablet";
  const stackCtas = isMobile || (isTablet && typeof window !== "undefined" && window.innerWidth < 820);

  const ctaHref = effectiveAnnouncementCtaHref(content.ctaAction, content.ctaHref);
  const showLinkCta = shouldShowAnnouncementLinkButton(content.ctaAction, content.ctaHref);

  const handleCta = useCallback(() => {
    if (mode === "preview") {
      onCta?.();
      return;
    }
    onCta?.();
    onDismiss();
  }, [mode, onCta, onDismiss]);

  if (!isBrowser) return null;

  const shellMaxWidth =
    previewWidthPx ??
    (isMobile ? undefined : isTablet ? Math.min(520, typeof window !== "undefined" ? window.innerWidth * 0.92 : 520) : 420);

  const linkLabel = content.ctaLabel?.trim() || tAdmin("defaultLinkLabel");

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-announcement-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: OVERLAY_Z_INDEX,
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 16,
        backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.5))",
      }}
      onClick={mode === "preview" ? undefined : onDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: previewWidthPx ? previewWidthPx : "100%",
          maxWidth: isMobile ? "100%" : shellMaxWidth,
          backgroundColor: "var(--neutral-0)",
          borderRadius: isMobile ? "16px 16px 0 0" : 12,
          boxShadow: "var(--shadow-2)",
          padding: isMobile
            ? "12px 12px calc(16px + env(safe-area-inset-bottom))"
            : isTablet
              ? 16
              : 20,
        }}
      >
        {mode === "preview" && (
          <div
            style={{
              marginBottom: 10,
              padding: "6px 10px",
              borderRadius: 8,
              backgroundColor: "var(--warning-50, var(--neutral-100))",
              color: "var(--warning-800, var(--neutral-800))",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {tAdmin("previewBanner")}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              id="app-announcement-title"
              style={{
                margin: 0,
                fontSize: isMobile ? 16 : 18,
                fontWeight: 700,
                color: "var(--neutral-900)",
                lineHeight: 1.3,
              }}
            >
              {content.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={tCommon("close")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              margin: -4,
              padding: 0,
              border: "none",
              borderRadius: 8,
              backgroundColor: "transparent",
              color: "var(--neutral-500)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {content.heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={content.heroImageUrl}
            alt=""
            style={{
              display: "block",
              width: "100%",
              maxHeight: isMobile ? "40vh" : 220,
              objectFit: "contain",
              borderRadius: 8,
              marginBottom: 12,
            }}
          />
        )}

        <div
          className="announcement-body-prose"
          style={{
            fontSize: isMobile || isTablet ? 14 : 15,
            lineHeight: 1.45,
            color: "var(--neutral-700)",
            marginBottom: 16,
            minWidth: 0,
            wordBreak: "break-word",
          }}
          dangerouslySetInnerHTML={{ __html: content.bodyHtml }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: stackCtas ? "column" : "row",
            gap: 8,
          }}
        >
          {showLinkCta &&
            (ctaHref ? (
              <Link href={ctaHref} onClick={handleCta} style={primaryLinkStyle(stackCtas)}>
                {linkLabel}
              </Link>
            ) : (
              <button type="button" onClick={handleCta} style={primaryButtonStyle(stackCtas)}>
                {linkLabel}
              </button>
            ))}
          <button type="button" onClick={onDismiss} style={secondaryButtonStyle(stackCtas)}>
            {tAdmin("dismiss")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function primaryButtonStyle(fullWidth: boolean): CSSProperties {
  return {
    width: fullWidth ? "100%" : undefined,
    flex: fullWidth ? undefined : 1,
    padding: "12px 14px",
    border: "none",
    borderRadius: 8,
    backgroundColor: "var(--primary-600)",
    color: "var(--neutral-0)",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

function primaryLinkStyle(fullWidth: boolean): CSSProperties {
  return {
    flex: fullWidth ? undefined : 1,
    width: fullWidth ? "100%" : undefined,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 14px",
    borderRadius: 8,
    backgroundColor: "var(--primary-600)",
    color: "var(--neutral-0)",
    fontSize: 15,
    fontWeight: 700,
    textDecoration: "none",
  };
}

function secondaryButtonStyle(fullWidth: boolean): CSSProperties {
  return {
    width: fullWidth ? "100%" : "auto",
    padding: "12px 14px",
    border: "1px solid var(--neutral-200)",
    borderRadius: 8,
    backgroundColor: "var(--neutral-0)",
    color: "var(--neutral-700)",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

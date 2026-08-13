"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { AnnouncementOverlay, type AnnouncementDisplayContent } from "@/components/announcements/AnnouncementOverlay";
import {
  ANNOUNCEMENT_PREVIEW_OPEN_EVENT,
  clearAnnouncementPreviewPayload,
  readAnnouncementPreviewPayload,
} from "@/lib/announcements/announcement-preview-storage";
import { sanitizeAnnouncementHtml } from "@/lib/announcements/sanitize-announcement-html";
import type { ActiveAnnouncementDto } from "@/lib/announcements/types";

type AnnouncementLocalizedSource = Pick<
  ActiveAnnouncementDto,
  "titleEn" | "titleEs" | "bodyEn" | "bodyEs" | "ctaLabelEn" | "ctaLabelEs"
>;

function pickLocalized(
  row: AnnouncementLocalizedSource,
  locale: string,
  enKey: keyof AnnouncementLocalizedSource,
  esKey: keyof AnnouncementLocalizedSource,
): string {
  return locale === "es" ? String(row[esKey] ?? row[enKey] ?? "") : String(row[enKey] ?? "");
}

function toDisplayContent(
  row: ActiveAnnouncementDto | NonNullable<ReturnType<typeof readAnnouncementPreviewPayload>>,
  locale: string,
): AnnouncementDisplayContent {
  const bodyKey = locale === "es" ? "bodyEs" : "bodyEn";
  const bodyRaw = String(row[bodyKey as keyof typeof row] ?? row.bodyEn ?? "");
  return {
    title: pickLocalized(row, locale, "titleEn", "titleEs"),
    bodyHtml: sanitizeAnnouncementHtml(bodyRaw),
    heroImageUrl:
      locale === "es"
        ? (row.heroImageUrlEs as string | null) ?? (row.heroImageUrlEn as string | null)
        : (row.heroImageUrlEn as string | null),
    ctaLabel: pickLocalized(row, locale, "ctaLabelEn", "ctaLabelEs") || null,
    ctaAction: row.ctaAction as AnnouncementDisplayContent["ctaAction"],
    ctaHref: (row.ctaHref as string | null) ?? null,
  };
}

export function AnnouncementHost() {
  const locale = useLocale();
  const [liveAnnouncement, setLiveAnnouncement] = useState<ActiveAnnouncementDto | null>(null);
  const [previewPayload, setPreviewPayload] = useState(
    () => readAnnouncementPreviewPayload(),
  );
  const [open, setOpen] = useState(() => Boolean(readAnnouncementPreviewPayload()));

  useEffect(() => {
    function openPreviewFromStorage() {
      const payload = readAnnouncementPreviewPayload();
      if (!payload) return;
      setPreviewPayload(payload);
      setOpen(true);
    }

    window.addEventListener(ANNOUNCEMENT_PREVIEW_OPEN_EVENT, openPreviewFromStorage);
    return () => window.removeEventListener(ANNOUNCEMENT_PREVIEW_OPEN_EVENT, openPreviewFromStorage);
  }, []);

  useEffect(() => {
    if (previewPayload) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/announcements/active");
        if (!res.ok) return;
        const data = (await res.json()) as { announcements: ActiveAnnouncementDto[] };
        if (cancelled) return;
        const announcements = data.announcements ?? [];
        if (announcements.length > 0) {
          setLiveAnnouncement(announcements[0] ?? null);
          setOpen(true);
        }
      } catch {
        /* non-blocking */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewPayload]);

  const isPreview = Boolean(previewPayload);

  const displaySource = useMemo(() => {
    if (previewPayload) return previewPayload;
    return liveAnnouncement;
  }, [liveAnnouncement, previewPayload]);

  const content = displaySource ? toDisplayContent(displaySource, previewPayload?.locale ?? locale) : null;

  const dismiss = useCallback(async () => {
    if (isPreview) {
      clearAnnouncementPreviewPayload();
      setPreviewPayload(null);
      setOpen(false);
      return;
    }
    if (liveAnnouncement) {
      setOpen(false);
      try {
        await fetch(`/api/announcements/${liveAnnouncement.id}/dismiss`, { method: "POST" });
      } catch {
        /* best effort */
      }
    }
  }, [isPreview, liveAnnouncement]);

  const handlePreviewCta = useCallback(() => {
    if (!isPreview) return;
    clearAnnouncementPreviewPayload();
    setPreviewPayload(null);
    setOpen(false);
  }, [isPreview]);

  if (!open || !content) return null;

  return (
    <AnnouncementOverlay
      content={content}
      mode={isPreview ? "preview" : "live"}
      onDismiss={dismiss}
      onCta={handlePreviewCta}
    />
  );
}

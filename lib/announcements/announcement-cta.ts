import type { AnnouncementCtaAction } from "@/lib/announcements/types";

/** Persisted action derived from whether a link href is set. */
export function resolveAnnouncementCtaAction(ctaHref: string | null | undefined): AnnouncementCtaAction {
  return ctaHref?.trim() ? "INTERNAL_LINK" : "DISMISS_ONLY";
}

export function normalizeAnnouncementCtaHref(href: string | null | undefined): string | null {
  const trimmed = href?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** Legacy rows may still store MOBILE_ACCOUNT_PROFILE — treat as internal link. */
export function effectiveAnnouncementCtaHref(
  ctaAction: AnnouncementCtaAction,
  ctaHref: string | null | undefined,
): string | null {
  const normalized = normalizeAnnouncementCtaHref(ctaHref);
  if (ctaAction === "DISMISS_ONLY") return null;
  if (ctaAction === "INTERNAL_LINK") return normalized;
  // MOBILE_ACCOUNT_PROFILE legacy
  return normalized ?? "/settings";
}

export function shouldShowAnnouncementLinkButton(
  ctaAction: AnnouncementCtaAction,
  ctaHref: string | null | undefined,
): boolean {
  if (ctaAction === "DISMISS_ONLY") return false;
  return Boolean(effectiveAnnouncementCtaHref(ctaAction, ctaHref));
}

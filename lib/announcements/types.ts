export const ANNOUNCEMENT_AUDIENCE_ALL = "ALL" as const;
export type AnnouncementAudience = typeof ANNOUNCEMENT_AUDIENCE_ALL;

export const ANNOUNCEMENT_CTA_ACTIONS = [
  "DISMISS_ONLY",
  "INTERNAL_LINK",
  "MOBILE_ACCOUNT_PROFILE",
] as const;
export type AnnouncementCtaAction = (typeof ANNOUNCEMENT_CTA_ACTIONS)[number];

export interface ActiveAnnouncementDto {
  id: string;
  slug: string;
  titleEn: string;
  titleEs: string;
  bodyEn: string;
  bodyEs: string;
  heroImageUrlEn: string | null;
  heroImageUrlEs: string | null;
  ctaLabelEn: string | null;
  ctaLabelEs: string | null;
  ctaAction: AnnouncementCtaAction;
  ctaHref: string | null;
  audience: AnnouncementAudience;
  campaignVersion: number;
  priority: number;
}

export interface AdminAnnouncementDto extends ActiveAnnouncementDto {
  startsAt: string;
  endsAt: string;
  active: boolean;
  dismissCount: number;
  createdAt: string;
  updatedAt: string;
}

export const ANNOUNCEMENT_PREVIEW_STORAGE_KEY = "cc-announcement-admin-preview";

export interface AnnouncementPreviewPayload {
  titleEn: string;
  titleEs: string;
  bodyEn: string;
  bodyEs: string;
  heroImageUrlEn: string | null;
  heroImageUrlEs: string | null;
  ctaLabelEn: string | null;
  ctaLabelEs: string | null;
  ctaAction: AnnouncementCtaAction;
  ctaHref: string | null;
  locale: "en" | "es";
  slug?: string;
}

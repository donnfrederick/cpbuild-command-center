import type { AppAnnouncement } from "@prisma/client";
import type { ActiveAnnouncementDto, AdminAnnouncementDto } from "@/lib/announcements/types";
import { sanitizeAnnouncementHtml } from "@/lib/announcements/sanitize-announcement-html";

export function mapActiveAnnouncement(row: AppAnnouncement): ActiveAnnouncementDto {
  return {
    id: row.id,
    slug: row.slug,
    titleEn: row.titleEn,
    titleEs: row.titleEs,
    bodyEn: sanitizeAnnouncementHtml(row.bodyEn),
    bodyEs: sanitizeAnnouncementHtml(row.bodyEs),
    heroImageUrlEn: row.heroImageUrlEn,
    heroImageUrlEs: row.heroImageUrlEs,
    ctaLabelEn: row.ctaLabelEn,
    ctaLabelEs: row.ctaLabelEs,
    ctaAction: row.ctaAction as ActiveAnnouncementDto["ctaAction"],
    ctaHref: row.ctaHref,
    audience: row.audience as ActiveAnnouncementDto["audience"],
    campaignVersion: row.campaignVersion,
    priority: row.priority,
  };
}

export function mapAdminAnnouncement(
  row: AppAnnouncement,
  dismissCount: number,
): AdminAnnouncementDto {
  return {
    ...mapActiveAnnouncement(row),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    active: row.active,
    dismissCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

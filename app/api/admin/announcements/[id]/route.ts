import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  adminGuardResponse,
  requireAnnouncementAdmin,
} from "@/lib/announcements/require-announcement-admin";
import { mapAdminAnnouncement } from "@/lib/announcements/map-announcement";
import { sanitizeAnnouncementHtml } from "@/lib/announcements/sanitize-announcement-html";
import {
  normalizeAnnouncementCtaHref,
  resolveAnnouncementCtaAction,
} from "@/lib/announcements/announcement-cta";
import { ANNOUNCEMENT_AUDIENCE_ALL } from "@/lib/announcements/types";

const PatchAnnouncementSchema = z.object({
  titleEn: z.string().min(1).max(200).optional(),
  titleEs: z.string().min(1).max(200).optional(),
  bodyEn: z.string().max(20000).optional(),
  bodyEs: z.string().max(20000).optional(),
  heroImageUrlEn: z.string().url().optional().nullable(),
  heroImageUrlEs: z.string().url().optional().nullable(),
  ctaLabelEn: z.string().max(100).optional().nullable(),
  ctaLabelEs: z.string().max(100).optional().nullable(),
  ctaHref: z.string().max(500).optional().nullable(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  active: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAnnouncementAdmin();
  if (guard.status) return adminGuardResponse(guard.status);

  const { id } = await context.params;
  const existing = await db.appAnnouncement.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchAnnouncementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const data = parsed.data;
  const startsAt = data.startsAt ? new Date(data.startsAt) : existing.startsAt;
  const endsAt = data.endsAt ? new Date(data.endsAt) : existing.endsAt;
  if (endsAt <= startsAt) {
    return NextResponse.json({ error: "endsAt must be after startsAt" }, { status: 422 });
  }

  const ctaHref =
    data.ctaHref !== undefined
      ? normalizeAnnouncementCtaHref(data.ctaHref)
      : existing.ctaHref;
  const ctaAction =
    data.ctaHref !== undefined ? resolveAnnouncementCtaAction(ctaHref) : existing.ctaAction;

  const row = await db.appAnnouncement.update({
    where: { id },
    data: {
      ...(data.titleEn !== undefined ? { titleEn: data.titleEn } : {}),
      ...(data.titleEs !== undefined ? { titleEs: data.titleEs } : {}),
      ...(data.bodyEn !== undefined
        ? { bodyEn: sanitizeAnnouncementHtml(data.bodyEn) }
        : {}),
      ...(data.bodyEs !== undefined
        ? { bodyEs: sanitizeAnnouncementHtml(data.bodyEs) }
        : {}),
      ...(data.heroImageUrlEn !== undefined ? { heroImageUrlEn: data.heroImageUrlEn } : {}),
      ...(data.heroImageUrlEs !== undefined ? { heroImageUrlEs: data.heroImageUrlEs } : {}),
      ...(data.ctaLabelEn !== undefined ? { ctaLabelEn: data.ctaLabelEn } : {}),
      ...(data.ctaLabelEs !== undefined ? { ctaLabelEs: data.ctaLabelEs } : {}),
      ...(data.ctaHref !== undefined ? { ctaHref, ctaAction } : {}),
      audience: ANNOUNCEMENT_AUDIENCE_ALL,
      ...(data.startsAt !== undefined ? { startsAt } : {}),
      ...(data.endsAt !== undefined ? { endsAt } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
    },
  });

  const dismissCount = await db.appAnnouncementDismissal.count({
    where: { announcementId: id },
  });

  return NextResponse.json({ announcement: mapAdminAnnouncement(row, dismissCount) });
}

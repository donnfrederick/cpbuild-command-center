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

const CreateAnnouncementSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  titleEn: z.string().min(1).max(200),
  titleEs: z.string().min(1).max(200),
  bodyEn: z.string().max(20000),
  bodyEs: z.string().max(20000),
  heroImageUrlEn: z.string().url().optional().nullable(),
  heroImageUrlEs: z.string().url().optional().nullable(),
  ctaLabelEn: z.string().max(100).optional().nullable(),
  ctaLabelEs: z.string().max(100).optional().nullable(),
  ctaHref: z.string().max(500).optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  active: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(0),
});

export async function GET() {
  const guard = await requireAnnouncementAdmin();
  if (guard.status) return adminGuardResponse(guard.status);

  const rows = await db.appAnnouncement.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  const counts = await db.appAnnouncementDismissal.groupBy({
    by: ["announcementId"],
    _count: { _all: true },
  });
  const countById = new Map(counts.map((c) => [c.announcementId, c._count._all]));

  return NextResponse.json({
    announcements: rows.map((row) =>
      mapAdminAnnouncement(row, countById.get(row.id) ?? 0),
    ),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAnnouncementAdmin();
  if (guard.status) return adminGuardResponse(guard.status);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateAnnouncementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const data = parsed.data;
  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (endsAt <= startsAt) {
    return NextResponse.json({ error: "endsAt must be after startsAt" }, { status: 422 });
  }

  const existing = await db.appAnnouncement.findUnique({ where: { slug: data.slug } });
  if (existing) {
    return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
  }

  const ctaHref = normalizeAnnouncementCtaHref(data.ctaHref);
  const ctaAction = resolveAnnouncementCtaAction(ctaHref);

  const row = await db.appAnnouncement.create({
    data: {
      slug: data.slug,
      titleEn: data.titleEn,
      titleEs: data.titleEs,
      bodyEn: sanitizeAnnouncementHtml(data.bodyEn),
      bodyEs: sanitizeAnnouncementHtml(data.bodyEs),
      heroImageUrlEn: data.heroImageUrlEn ?? null,
      heroImageUrlEs: data.heroImageUrlEs ?? null,
      ctaLabelEn: data.ctaLabelEn ?? null,
      ctaLabelEs: data.ctaLabelEs ?? null,
      ctaAction,
      ctaHref,
      audience: ANNOUNCEMENT_AUDIENCE_ALL,
      startsAt,
      endsAt,
      active: data.active,
      priority: data.priority,
      createdBy: guard.userId,
    },
  });

  return NextResponse.json({ announcement: mapAdminAnnouncement(row, 0) }, { status: 201 });
}

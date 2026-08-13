import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/masquerade", () => ({ getEffectiveSession: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    appAnnouncement: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    appAnnouncementDismissal: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

import { GET as getActive } from "@/app/api/announcements/active/route";
import { POST as postDismiss } from "@/app/api/announcements/[id]/dismiss/route";
import { GET as adminList, POST as adminCreate } from "@/app/api/admin/announcements/route";
import { PATCH as adminPatch } from "@/app/api/admin/announcements/[id]/route";
import { POST as adminResend } from "@/app/api/admin/announcements/[id]/resend/route";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import { db } from "@/lib/db";

const mockGetSession = vi.mocked(getSession);
const mockGetEffectiveSession = vi.mocked(getEffectiveSession);
const mockFindMany = vi.mocked(db.appAnnouncement.findMany);
const mockFindUnique = vi.mocked(db.appAnnouncement.findUnique);
const mockDismissFindMany = vi.mocked(db.appAnnouncementDismissal.findMany);
const mockDismissUpsert = vi.mocked(db.appAnnouncementDismissal.upsert);
const mockCreate = vi.mocked(db.appAnnouncement.create);
const mockUpdate = vi.mocked(db.appAnnouncement.update);
const mockGroupBy = vi.mocked(db.appAnnouncementDismissal.groupBy);

const MEMBER_SESSION = {
  user: { id: "u1", email: "m@example.com", role: "MEMBER", name: "M", specialPermissions: [] },
};

const ADMIN_SESSION = {
  user: { id: "admin-1", email: "a@example.com", role: "ADMIN", name: "A", specialPermissions: [] },
};

const ANNOUNCEMENT_ROW = {
  id: "ann-1",
  slug: "save-to-photos",
  titleEn: "Save photos",
  titleEs: "Fotos",
  bodyEn: "<p>EN</p>",
  bodyEs: "<p>ES</p>",
  heroImageUrlEn: null,
  heroImageUrlEs: null,
  ctaLabelEn: "Open",
  ctaLabelEs: "Abrir",
  ctaAction: "INTERNAL_LINK",
  ctaHref: "/settings",
  audience: "ALL",
  campaignVersion: 1,
  startsAt: new Date("2020-01-01"),
  endsAt: new Date("2099-01-01"),
  active: true,
  priority: 0,
  createdBy: "admin-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("announcements API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEffectiveSession.mockResolvedValue({
      user: ADMIN_SESSION.user,
      masquerade: null,
      rolePreview: null,
    });
  });

  describe("GET /api/announcements/active", () => {
    it("returns 401 without session", async () => {
      mockGetSession.mockResolvedValue(null);
      const res = await getActive();
      expect(res.status).toBe(401);
    });

    it("returns eligible announcements excluding dismissals", async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION as never);
      mockFindMany.mockResolvedValue([ANNOUNCEMENT_ROW]);
      mockDismissFindMany.mockResolvedValue([]);

      const res = await getActive();
      expect(res.status).toBe(200);
      const body = await res.json() as { announcements: { slug: string }[] };
      expect(body.announcements).toHaveLength(1);
      expect(body.announcements[0]?.slug).toBe("save-to-photos");
    });
  });

  describe("POST /api/announcements/[id]/dismiss", () => {
    it("records dismissal for current campaign version", async () => {
      mockGetSession.mockResolvedValue(MEMBER_SESSION as never);
      mockFindUnique.mockResolvedValue(ANNOUNCEMENT_ROW);
      mockDismissUpsert.mockResolvedValue({} as never);

      const res = await postDismiss(new NextRequest("http://localhost"), {
        params: Promise.resolve({ id: "ann-1" }),
      });
      expect(res.status).toBe(200);
      expect(mockDismissUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ campaignVersion: 1 }),
        }),
      );
    });
  });

  describe("admin routes", () => {
    it("GET /api/admin/announcements returns 403 for non-admin", async () => {
      mockGetSession.mockResolvedValue(MEMBER_SESSION as never);
      mockGetEffectiveSession.mockResolvedValue({
        user: MEMBER_SESSION.user,
        masquerade: null,
        rolePreview: null,
      });
      const res = await adminList();
      expect(res.status).toBe(403);
    });

    it("POST /api/admin/announcements creates sanitized announcement", async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION as never);
      mockFindUnique.mockResolvedValue(null);
      mockCreate.mockResolvedValue(ANNOUNCEMENT_ROW);

      const res = await adminCreate(
        new NextRequest("http://localhost", {
          method: "POST",
          body: JSON.stringify({
            slug: "save-to-photos",
            titleEn: "Save photos",
            titleEs: "Fotos",
            bodyEn: "<p>EN</p><script>x</script>",
            bodyEs: "<p>ES</p>",
            ctaHref: "/settings",
            startsAt: "2026-01-01T00:00:00.000Z",
            endsAt: "2026-12-31T00:00:00.000Z",
          }),
          headers: { "Content-Type": "application/json" },
        }),
      );
      expect(res.status).toBe(201);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bodyEn: expect.not.stringContaining("<script"),
            ctaAction: "INTERNAL_LINK",
            ctaHref: "/settings",
            audience: "ALL",
          }),
        }),
      );
    });

    it("POST /api/admin/announcements sets DISMISS_ONLY when no link", async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION as never);
      mockFindUnique.mockResolvedValue(null);
      mockCreate.mockResolvedValue({ ...ANNOUNCEMENT_ROW, ctaAction: "DISMISS_ONLY", ctaHref: null });

      const res = await adminCreate(
        new NextRequest("http://localhost", {
          method: "POST",
          body: JSON.stringify({
            slug: "info-only",
            titleEn: "Heads up",
            titleEs: "Aviso",
            bodyEn: "<p>EN</p>",
            bodyEs: "<p>ES</p>",
            startsAt: "2026-01-01T00:00:00.000Z",
            endsAt: "2026-12-31T00:00:00.000Z",
          }),
          headers: { "Content-Type": "application/json" },
        }),
      );
      expect(res.status).toBe(201);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ctaAction: "DISMISS_ONLY",
            ctaHref: null,
          }),
        }),
      );
    });

    it("PATCH /api/admin/announcements/[id] normalizes legacy audience to ALL", async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION as never);
      mockFindUnique.mockResolvedValue({
        ...ANNOUNCEMENT_ROW,
        audience: "WEB_SHARE_CAPABLE",
      });
      mockUpdate.mockResolvedValue({ ...ANNOUNCEMENT_ROW, audience: "ALL" });

      const res = await adminPatch(
        new NextRequest("http://localhost", {
          method: "PATCH",
          body: JSON.stringify({ active: false }),
          headers: { "Content-Type": "application/json" },
        }),
        { params: Promise.resolve({ id: "ann-1" }) },
      );
      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            active: false,
            audience: "ALL",
          }),
        }),
      );
    });

    it("POST resend increments campaignVersion", async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION as never);
      mockFindUnique.mockResolvedValue(ANNOUNCEMENT_ROW);
      mockUpdate.mockResolvedValue({ ...ANNOUNCEMENT_ROW, campaignVersion: 2 });
      vi.mocked(db.appAnnouncementDismissal.count).mockResolvedValue(0);

      const res = await adminResend(new Request("http://localhost"), {
        params: Promise.resolve({ id: "ann-1" }),
      });
      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { campaignVersion: { increment: 1 } } }),
      );
    });

    it("GET admin list returns rows with dismiss counts", async () => {
      mockGetSession.mockResolvedValue(ADMIN_SESSION as never);
      mockFindMany.mockResolvedValue([ANNOUNCEMENT_ROW]);
      mockGroupBy.mockResolvedValue([{ announcementId: "ann-1", _count: { _all: 3 } }]);

      const res = await adminList();
      expect(res.status).toBe(200);
      const body = await res.json() as { announcements: { dismissCount: number }[] };
      expect(body.announcements[0]?.dismissCount).toBe(3);
    });
  });
});

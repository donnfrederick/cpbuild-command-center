"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Megaphone, Plus, RefreshCw, Eye } from "lucide-react";
import dynamic from "next/dynamic";
import {
  AnnouncementPreviewPanel,
  type AnnouncementPreviewDraft,
} from "@/components/admin/AnnouncementPreviewPanel";
import {
  notifyAnnouncementPreviewOpen,
  writeAnnouncementPreviewPayload,
} from "@/lib/announcements/announcement-preview-storage";
import {
  normalizeAnnouncementCtaHref,
  resolveAnnouncementCtaAction,
} from "@/lib/announcements/announcement-cta";
import type { AdminAnnouncementDto } from "@/lib/announcements/types";
import { toDatetimeLocalValue } from "@/lib/datetime/datetime-local";

const AnnouncementRichTextEditor = dynamic(
  () =>
    import("@/components/admin/AnnouncementRichTextEditor").then((m) => ({
      default: m.AnnouncementRichTextEditor,
    })),
  { ssr: false, loading: () => null },
);

type AnnouncementFormState = AnnouncementPreviewDraft & {
  slug: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  priority: number;
};

const emptyDraft = (): AnnouncementFormState => {
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  return {
    slug: "",
    titleEn: "",
    titleEs: "",
    bodyEn: "<p></p>",
    bodyEs: "<p></p>",
    heroImageUrlEn: null,
    heroImageUrlEs: null,
    ctaLabelEn: null,
    ctaLabelEs: null,
    ctaAction: "DISMISS_ONLY",
    ctaHref: null,
    startsAt: toDatetimeLocalValue(now),
    endsAt: toDatetimeLocalValue(end),
    active: true,
    priority: 0,
  };
};

function ctaHrefForForm(row: AdminAnnouncementDto): string | null {
  if (row.ctaHref?.trim()) return row.ctaHref;
  if (row.ctaAction === "MOBILE_ACCOUNT_PROFILE") return "/settings";
  return null;
}

export function AnnouncementsManager() {
  const t = useTranslations("admin.announcements");
  const tCommon = useTranslations("common");
  const [rows, setRows] = useState<AdminAnnouncementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyDraft());
  const [previewLocale, setPreviewLocale] = useState<"en" | "es">("en");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/announcements");
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { announcements: AdminAnnouncementDto[] };
      setRows(data.announcements);
    } catch {
      setError(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyDraft());
    setError(null);
  };

  const cancelEdit = () => {
    startCreate();
  };

  const startEdit = (row: AdminAnnouncementDto) => {
    setEditingId(row.id);
    setForm({
      slug: row.slug,
      titleEn: row.titleEn,
      titleEs: row.titleEs,
      bodyEn: row.bodyEn,
      bodyEs: row.bodyEs,
      heroImageUrlEn: row.heroImageUrlEn,
      heroImageUrlEs: row.heroImageUrlEs,
      ctaLabelEn: row.ctaLabelEn,
      ctaLabelEs: row.ctaLabelEs,
      ctaAction: row.ctaAction,
      ctaHref: ctaHrefForForm(row),
      startsAt: toDatetimeLocalValue(new Date(row.startsAt)),
      endsAt: toDatetimeLocalValue(new Date(row.endsAt)),
      active: row.active,
      priority: row.priority,
    });
  };

  const uploadHero = async (locale: "en" | "es") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("image", file);
      formData.append("folderHint", form.slug || "draft");
      const res = await fetch("/api/admin/announcements/upload-image", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) return;
      const data = (await res.json()) as { url: string };
      setForm((prev) =>
        locale === "en"
          ? { ...prev, heroImageUrlEn: data.url }
          : { ...prev, heroImageUrlEs: data.url },
      );
    };
    input.click();
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const ctaHref = normalizeAnnouncementCtaHref(form.ctaHref);
      const payload = {
        ...form,
        ctaHref,
        ctaAction: resolveAnnouncementCtaAction(ctaHref),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      };
      const res = editingId
        ? await fetch(`/api/admin/announcements/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/announcements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "save failed");
      }
      await load();
      if (!editingId) startCreate();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const resend = async (id: string) => {
    const res = await fetch(`/api/admin/announcements/${id}/resend`, { method: "POST" });
    if (res.ok) await load();
  };

  const openPagePreview = (row?: AdminAnnouncementDto) => {
    const source = row ?? form;
    const ctaHref = row
      ? ctaHrefForForm(row)
      : normalizeAnnouncementCtaHref(form.ctaHref);
    writeAnnouncementPreviewPayload({
      titleEn: source.titleEn,
      titleEs: source.titleEs,
      bodyEn: source.bodyEn,
      bodyEs: source.bodyEs,
      heroImageUrlEn: source.heroImageUrlEn,
      heroImageUrlEs: source.heroImageUrlEs,
      ctaLabelEn: source.ctaLabelEn,
      ctaLabelEs: source.ctaLabelEs,
      ctaAction: resolveAnnouncementCtaAction(ctaHref),
      ctaHref,
      locale: previewLocale,
      slug: "slug" in source ? source.slug : undefined,
    });
    notifyAnnouncementPreviewOpen();
  };

  const previewDraft: AnnouncementPreviewDraft = useMemo(() => {
    const ctaHref = normalizeAnnouncementCtaHref(form.ctaHref);
    return {
      titleEn: form.titleEn,
      titleEs: form.titleEs,
      bodyEn: form.bodyEn,
      bodyEs: form.bodyEs,
      heroImageUrlEn: form.heroImageUrlEn,
      heroImageUrlEs: form.heroImageUrlEs,
      ctaLabelEn: form.ctaLabelEn,
      ctaLabelEs: form.ctaLabelEs,
      ctaAction: resolveAnnouncementCtaAction(ctaHref),
      ctaHref,
    };
  }, [form]);

  return (
    <div style={{ padding: "12px 16px 24px", maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Megaphone size={22} style={{ color: "var(--primary-600)" }} aria-hidden />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--neutral-900)" }}>
          {t("pageTitle")}
        </h1>
      </div>

      {error && (
        <p style={{ color: "var(--error-600)", fontSize: 14, marginBottom: 12 }} role="alert">
          {error}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        <section
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid var(--neutral-200)",
            backgroundColor: "var(--neutral-0)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <button type="button" onClick={startCreate} style={btnPrimary}>
              <Plus size={16} aria-hidden /> {t("newAnnouncement")}
            </button>
            <button type="button" onClick={() => setPreviewOpen(true)} style={btnSecondary}>
              <Eye size={16} aria-hidden /> {t("devicePreview")}
            </button>
            <select
              aria-label={t("previewLocale")}
              value={previewLocale}
              onChange={(e) => setPreviewLocale(e.target.value as "en" | "es")}
              style={inputStyle}
            >
              <option value="en">EN</option>
              <option value="es">ES</option>
            </select>
            <button type="button" onClick={() => openPagePreview()} style={btnSecondary}>
              <Eye size={16} aria-hidden /> {t("pagePreview")}
            </button>
          </div>

          {!editingId && (
            <label style={labelStyle}>
              {t("slug")}
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                style={inputStyle}
                placeholder="save-to-photos"
              />
            </label>
          )}

          <h2 style={sectionHeadingStyle}>{t("sectionEnglish")}</h2>
          <label style={labelStyle}>
            {t("titleEn")}
            <input
              value={form.titleEn}
              onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            {t("bodyEn")}
            <AnnouncementRichTextEditor
              value={form.bodyEn}
              onChange={(html) => setForm({ ...form, bodyEn: html })}
              uploadFolderHint={form.slug || "draft"}
            />
          </label>
          <button type="button" onClick={() => void uploadHero("en")} style={btnSecondary}>
            {t("uploadHeroEn")}
          </button>

          <h2 style={{ ...sectionHeadingStyle, marginTop: 20 }}>{t("sectionSpanish")}</h2>
          <label style={labelStyle}>
            {t("titleEs")}
            <input
              value={form.titleEs}
              onChange={(e) => setForm({ ...form, titleEs: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            {t("bodyEs")}
            <AnnouncementRichTextEditor
              value={form.bodyEs}
              onChange={(html) => setForm({ ...form, bodyEs: html })}
              uploadFolderHint={form.slug || "draft"}
            />
          </label>
          <button type="button" onClick={() => void uploadHero("es")} style={btnSecondary}>
            {t("uploadHeroEs")}
          </button>

          <h2 style={{ ...sectionHeadingStyle, marginTop: 20 }}>{t("ctaSection")}</h2>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--neutral-600)" }}>
            {t("ctaLinkHint")}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <label style={labelStyle}>
              {t("ctaHref")}
              <input
                value={form.ctaHref ?? ""}
                onChange={(e) => setForm({ ...form, ctaHref: e.target.value || null })}
                style={inputStyle}
                placeholder="/settings"
              />
            </label>
            <label style={labelStyle}>
              {t("ctaLabelEn")}
              <input
                value={form.ctaLabelEn ?? ""}
                onChange={(e) => setForm({ ...form, ctaLabelEn: e.target.value || null })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("ctaLabelEs")}
              <input
                value={form.ctaLabelEs ?? ""}
                onChange={(e) => setForm({ ...form, ctaLabelEs: e.target.value || null })}
                style={inputStyle}
              />
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 10,
              marginTop: 16,
            }}
          >
            <label style={labelStyle}>
              {t("startsAt")}
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("endsAt")}
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("priority")}
              <input
                type="number"
                min={0}
                max={100}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                style={inputStyle}
              />
            </label>
          </div>

          <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            {t("active")}
          </label>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => void save()} disabled={saving} style={btnPrimary}>
              {saving ? t("saving") : t("save")}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEdit} disabled={saving} style={btnSecondary}>
                {tCommon("cancel")}
              </button>
            )}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>{t("listTitle")}</h2>
          {loading ? (
            <p>{t("loading")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((row) => (
                <div
                  key={row.id}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid var(--neutral-200)",
                    backgroundColor: "var(--neutral-0)",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: "var(--neutral-900)" }}>{row.slug}</div>
                    <div style={{ fontSize: 13, color: "var(--neutral-600)" }}>
                      v{row.campaignVersion} · {t("dismissCount", { count: row.dismissCount })} ·{" "}
                      {row.active ? t("statusActive") : t("statusInactive")}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button type="button" onClick={() => startEdit(row)} style={btnSecondary}>
                      {t("edit")}
                    </button>
                    <button type="button" onClick={() => void resend(row.id)} style={btnSecondary}>
                      <RefreshCw size={14} aria-hidden /> {t("resend")}
                    </button>
                    <button type="button" onClick={() => openPagePreview(row)} style={btnSecondary}>
                      {t("pagePreview")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <AnnouncementPreviewPanel draft={previewDraft} open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </div>
  );
}

const sectionHeadingStyle: CSSProperties = {
  margin: "16px 0 10px",
  fontSize: 15,
  fontWeight: 700,
  color: "var(--neutral-800)",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--neutral-700)",
  marginBottom: 10,
};

const inputStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--neutral-200)",
  fontSize: 14,
  fontFamily: "inherit",
};

const btnPrimary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  border: "none",
  borderRadius: 8,
  backgroundColor: "var(--primary-600)",
  color: "var(--neutral-0)",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
};

const btnSecondary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  border: "1px solid var(--neutral-200)",
  borderRadius: 8,
  backgroundColor: "var(--neutral-0)",
  color: "var(--neutral-800)",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};

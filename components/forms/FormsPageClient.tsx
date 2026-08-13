"use client";

import React, { startTransition, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useIsBrowser } from "@/hooks/use-is-browser";
import { createPortal } from "react-dom";
import { useRouter } from "@/i18n/navigation";
import { useOptionalRouteFetch } from "@/components/navigation/route-fetch-provider";
import { isAbortError } from "@/lib/route-fetch";
import { useSearchParams } from "next/navigation";
import { ClipboardList, MoreHorizontal, FileEdit, Copy, Trash2, CheckCircle2, Eye, X } from "lucide-react";
import { SearchInput } from "@/components/shared/SearchInput";
import { useTranslations } from "next-intl";
import {
  listForms,
  createForm,
  deleteForm as deleteApiForm,
  saveFormDraft,
  type StoredForm,
} from "@/lib/forms/formsApi";
import { FormSetupModal, type FormSetupValues } from "./FormSetupModal";
import { FormFillLoader } from "./FormFillClient";
import { INSPECTION_CATEGORY_LABELS } from "./formTypes";
import {
  getFormListScopeCodes,
  normalizeFormListLevel,
  showCategoryTag,
  storedFormToListItem,
  type FormListItem,
} from "@/lib/forms/forms-list-display";

// ── Types ─────────────────────────────────────────────────────────────────────

type InspectionForm = FormListItem;

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<InspectionForm["status"], { bg: string; color: string; label: string }> = {
  draft:     { bg: "var(--color-surface-sunken)", color: "var(--color-text-secondary)", label: "Draft" },
  published: { bg: "var(--green-50)",             color: "var(--green-600)",            label: "Published" },
  archived:  { bg: "var(--color-surface-sunken)", color: "var(--color-text-disabled)",  label: "Archived" },
};

function StatusPill({ status }: { status: InspectionForm["status"] }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

// Pure helper — avoids calling Date.now() directly during render (React Compiler)
function computeRelativeDate(updatedAt: string, now: number): string {
  const diff = (now - new Date(updatedAt).getTime()) / 1000;
  if (diff < 60)     return "just now";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Form tag chip ─────────────────────────────────────────────────────────────

const TAG_COLORS = {
  blue:          { bg: "var(--color-secondary-subtle)", color: "var(--blue-700)" },
  purple:        { bg: "var(--color-accent-subtle)",     color: "var(--color-accent-hover)" },
  scope:         { bg: "var(--orange-50, #fff7ed)",      color: "var(--orange-700, #c2410c)" },
  neutral:       { bg: "var(--color-surface-sunken)",   color: "var(--color-text-secondary)" },
  documentation: { bg: "var(--color-surface-sunken)",   color: "var(--color-text-secondary)" },
  inspection:    { bg: "var(--color-secondary-subtle)", color: "var(--blue-700)" },
} as const;

function FormTag({
  children,
  color,
}: {
  children: React.ReactNode;
  color: keyof typeof TAG_COLORS;
}) {
  const s = TAG_COLORS[color];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 7px",
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.02em",
        backgroundColor: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// ── Form card ─────────────────────────────────────────────────────────────────

function FormCard({
  form,
  highlighted,
  canManageForms,
  scopeTypeNames,
  canonicalScopeCodes,
  onEdit,
  onPreview,
  onDuplicate,
  onDelete,
}: {
  form: InspectionForm;
  highlighted?: boolean;
  canManageForms: boolean;
  scopeTypeNames: Map<string, string>;
  canonicalScopeCodes: Set<string>;
  onEdit: () => void;
  onPreview: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const tSetup = useTranslations("forms.setup");
  const tList = useTranslations("forms.list");
  const [menuOpen, setMenuOpen] = useState(false);

  const [renderNow] = useState(() => Date.now());
  const relativeDate = computeRelativeDate(form.updatedAt, renderNow);
  const listLevel = normalizeFormListLevel(form.level);
  const visibleScopeCodes = getFormListScopeCodes(form.scopeTypeCodes, canonicalScopeCodes);

  const levelTag =
    listLevel === "project" ? (
      <FormTag color="blue">{tList("levelProject")}</FormTag>
    ) : listLevel === "unit" ? (
      <FormTag color="purple">{tList("levelUnit")}</FormTag>
    ) : (
      <FormTag color="scope">{tList("levelScope")}</FormTag>
    );

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        border: "none",
        borderRadius: "var(--radius-lg)",
        padding: "10px 12px",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        cursor: "pointer",
        transition: "box-shadow 0.2s",
        position: "relative",
        boxShadow: highlighted
          ? "0 0 0 2px var(--green-500), var(--shadow-card)"
          : "var(--shadow-card)",
        backgroundImage: highlighted
          ? "linear-gradient(to right, rgba(22,163,74,0.04), transparent 40%)"
          : undefined,
      }}
      onClick={onEdit}
      onMouseEnter={(e) => {
        if (highlighted) return;
        e.currentTarget.style.boxShadow = "var(--shadow-nav)";
      }}
      onMouseLeave={(e) => {
        if (highlighted) return;
        e.currentTarget.style.boxShadow = "var(--shadow-card)";
      }}
    >
      {/* Published-just-now ribbon */}
      {highlighted && (
        <div
          style={{
            position: "absolute",
            top: -10,
            left: 12,
            backgroundColor: "var(--success-500, #22c55e)",
            color: "#fff",
            padding: "3px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            boxShadow: "0 2px 6px rgba(34,197,94,0.35)",
            letterSpacing: "0.02em",
          }}
        >
          <CheckCircle2 size={12} aria-hidden />
          Just published
        </div>
      )}

      {/* Content — `minWidth: 0` lets the title wrap correctly inside
          the flex row; without it the title would try to take its
          intrinsic width and shove the action buttons off-screen. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1.3 }}>
            {form.name}
          </span>
          <StatusPill status={form.status} />
          <FormTag
            color={form.formPurpose === "documentation" ? "documentation" : "inspection"}
          >
            {form.formPurpose === "documentation"
              ? tSetup("purposeDocumentation")
              : tSetup("purposeInspection")}
          </FormTag>
          {levelTag}
        </div>

        {form.description && (
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 12,
              color: "var(--neutral-500)",
              lineHeight: 1.4,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {form.description}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--neutral-400)" }}>
            {form.questionCount} {form.questionCount === 1 ? "question" : "questions"}
          </span>
          <span style={{ fontSize: 11, color: "var(--neutral-300)" }}>·</span>
          <span style={{ fontSize: 11, color: "var(--neutral-400)" }}>
            Edited {relativeDate}
          </span>
        </div>

        {/* Category + selected scope type tags (level pill lives in the header row) */}
        {(showCategoryTag(form) || visibleScopeCodes.length > 0) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexWrap: "wrap",
              marginTop: 5,
            }}
          >
            {showCategoryTag(form) && (
              <FormTag color="blue">
                {INSPECTION_CATEGORY_LABELS[form.category as keyof typeof INSPECTION_CATEGORY_LABELS] ?? form.category}
              </FormTag>
            )}
            {visibleScopeCodes.map((code) => (
              <FormTag key={code} color="neutral">
                {scopeTypeNames.get(code) ?? code}
              </FormTag>
            ))}
          </div>
        )}
      </div>

      {/* Right-side card actions (preview + context menu).
          Rendered as a REAL FLEX SIBLING (not absolute-positioned) so
          the title/content in the flex:1 column physically cannot flow
          underneath them. The previous `position:absolute` approach let
          long titles overlap the icons. See
          `.cursor/rules/mobile-density.mdc` rule 9 for the invariant. */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 2,
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Preview — opens as a modal overlay */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          aria-label={`Preview ${form.name}`}
          title="Preview form"
          className="fb-card-preview-btn"
          style={{
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            border: "none",
            backgroundColor: "transparent",
            color: "var(--neutral-500)",
            cursor: "pointer",
            transition: "background-color 0.12s, color 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--neutral-100)";
            e.currentTarget.style.color = "var(--primary-600)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--neutral-500)";
          }}
        >
          <Eye size={16} aria-hidden />
        </button>

        {canManageForms && (
          <>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Form options"
              style={{
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                border: "none",
                backgroundColor: menuOpen ? "var(--neutral-100)" : "transparent",
                color: "var(--neutral-500)",
                cursor: "pointer",
              }}
            >
              <MoreHorizontal size={16} aria-hidden />
            </button>

            {menuOpen && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 9 }}
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 32,
                    right: 0,
                    zIndex: 10,
                    backgroundColor: "var(--neutral-0)",
                    border: "1px solid var(--neutral-200)",
                    borderRadius: 10,
                    boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                    minWidth: 160,
                    overflow: "hidden",
                    padding: "4px 0",
                  }}
                >
                  {[
                    { label: "Edit", icon: FileEdit, action: onEdit, color: "var(--neutral-700)" },
                    { label: "Duplicate", icon: Copy, action: onDuplicate, color: "var(--neutral-700)" },
                    { label: "Delete", icon: Trash2, action: onDelete, color: "var(--error-600)" },
                  ].map(({ label, icon: Icon, action, color }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => { setMenuOpen(false); action(); }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 14px",
                        border: "none",
                        backgroundColor: "transparent",
                        color,
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--neutral-50)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <Icon size={14} aria-hidden />
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function FormsListSkeleton() {
  return (
    <>
      <style>{`
        @keyframes forms-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div
        style={{
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: 800,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              borderRadius: 10,
              border: "1px solid var(--neutral-200)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              backgroundColor: "var(--neutral-0)",
            }}
          >
            {/* Title + status pill row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  height: 14,
                  width: `${140 + i * 40}px`,
                  borderRadius: 4,
                  background: "linear-gradient(90deg, var(--neutral-100) 25%, var(--neutral-200) 50%, var(--neutral-100) 75%)",
                  backgroundSize: "200% 100%",
                  animation: `forms-shimmer 1.4s ease-in-out infinite`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
              <div
                style={{
                  height: 18,
                  width: 56,
                  borderRadius: 99,
                  background: "linear-gradient(90deg, var(--neutral-100) 25%, var(--neutral-200) 50%, var(--neutral-100) 75%)",
                  backgroundSize: "200% 100%",
                  animation: `forms-shimmer 1.4s ease-in-out infinite`,
                  animationDelay: `${i * 0.1 + 0.05}s`,
                }}
              />
            </div>
            {/* Meta row */}
            <div
              style={{
                height: 11,
                width: 100,
                borderRadius: 4,
                background: "linear-gradient(90deg, var(--neutral-100) 25%, var(--neutral-200) 50%, var(--neutral-100) 75%)",
                backgroundSize: "200% 100%",
                animation: `forms-shimmer 1.4s ease-in-out infinite`,
                animationDelay: `${i * 0.1 + 0.1}s`,
              }}
            />
          </div>
        ))}
      </div>
    </>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ canManageForms, onCreateForm }: { canManageForms: boolean; onCreateForm: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "80px 24px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "var(--radius-lg)",
          backgroundColor: "var(--color-accent-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <ClipboardList size={30} style={{ color: "var(--color-accent)" }} aria-hidden />
      </div>
      <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)" }}>
        No forms yet
      </h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, fontWeight: 500, color: "var(--color-text-tertiary)", maxWidth: 320, lineHeight: 1.5 }}>
        Create inspection forms to standardize how your team documents quality, safety, and progress on site.
      </p>
      {canManageForms && (
        <button
          type="button"
          onClick={onCreateForm}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 40,
            padding: "0 16px",
            borderRadius: "var(--radius-md)",
            border: "none",
            backgroundColor: "var(--color-accent)",
            color: "var(--color-text-inverse)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "var(--tracking-ui)",
            cursor: "pointer",
          }}
        >
          + New Form
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FormsPageClient({
  canManageForms = false,
}: {
  canManageForms?: boolean;
}) {
  const t = useTranslations("forms");
  const tSetup = useTranslations("forms.setup");
  const router = useRouter();
  const routeFetch = useOptionalRouteFetch();
  const searchParams = useSearchParams();
  const isBrowser = useIsBrowser();
  const mountedRef = useRef(false);
  const [forms, setForms] = useState<InspectionForm[]>([]);
  const [formsLoading, setFormsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  /** Form ID whose full preview modal is open, or null. */
  const [previewFormId, setPreviewFormId] = useState<string | null>(null);
  /** code → displayName map for canonical scope types, loaded once from /api/lookups. */
  const [scopeTypeNames, setScopeTypeNames] = useState<Map<string, string>>(new Map());
  const justPublishedId = searchParams?.get("just") ?? null;
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const canonicalScopeCodes = useMemo(
    () => new Set(scopeTypeNames.keys()),
    [scopeTypeNames],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    routeFetch("/api/lookups")
      .then((r) => r.json())
      .then((data: { canonicalScopeTypes?: { code: string; displayName: string }[] }) => {
        if (cancelled || !mountedRef.current) return;
        const map = new Map<string, string>();
        for (const st of data.canonicalScopeTypes ?? []) {
          map.set(st.code, st.displayName);
        }
        setScopeTypeNames(map);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
      });
    return () => {
      cancelled = true;
    };
  }, [routeFetch]);

  useEffect(() => {
    if (!previewFormId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPreviewFormId(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [previewFormId]);

  const refresh = useCallback((showLoader = false) => {
    if (showLoader && mountedRef.current) setFormsLoading(true);
    listForms()
      .then((stored) => {
        if (!mountedRef.current) return;
        startTransition(() => {
          if (!mountedRef.current) return;
          setForms(stored.map(storedFormToListItem));
          setFormsLoading(false);
        });
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        console.warn("[FormsPageClient] Failed to load forms", err);
        setFormsLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh(true);
  }, [refresh]);

  /**
   * If we arrived via `?just={id}` (set by the builder after a publish),
   * briefly highlight that row so Hannah can visually confirm the form
   * landed here. The highlight auto-clears after a few seconds.
   */
  useEffect(() => {
    if (!justPublishedId) return;
    setHighlightId(justPublishedId);
    const timer = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(timer);
  }, [justPublishedId]);

  const filtered = useMemo(
    () =>
      forms.filter(
        (f) =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.description.toLowerCase().includes(search.toLowerCase()),
      ),
    [forms, search],
  );

  function handleCreateForm() {
    setSetupOpen(true);
  }

  async function handleSetupConfirm(values: FormSetupValues) {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const stored = await createForm({
        name:
          values.formPurpose === "documentation"
            ? tSetup("defaultDocumentationFormName")
            : INSPECTION_CATEGORY_LABELS[values.category],
        formPurpose: values.formPurpose,
        level: values.level,
        category: values.category,
        scopeTypeCodes: values.scopeTypeCodes,
      });
      setSetupOpen(false);
      router.push(`/forms/${stored.id}/edit`);
    } catch (err) {
      console.error("[FormsPageClient] Failed to create form", err);
    } finally {
      setIsCreating(false);
    }
  }

  function handleEdit(id: string) {
    router.push(`/forms/${id}/edit`);
  }

  const handleDuplicate = useCallback(async (id: string) => {
    const stored = forms.find((f) => f.id === id);
    if (!stored) return;
    try {
      // Fetch the full form to get sections, then create a copy
      const res = await fetch(`/api/forms/${id}`);
      const data = (await res.json()) as { form: { draftSections: unknown; versions: { sections: unknown }[] } };
      const sections = data.form.draftSections ?? data.form.versions[0]?.sections ?? [];
      const newForm = await createForm({
        name: `${stored.name || "Untitled form"} (copy)`,
        description: stored.description,
        level: "scope",
        category: "OTHER",
        scopeTypeCodes: [],
      });
      await saveFormDraft(newForm.id, { ...newForm.template, sections: sections as [] });
      refresh();
    } catch (err) {
      console.error("[FormsPageClient] Failed to duplicate form", err);
    }
  }, [forms, refresh]);

  function handleDelete(id: string) {
    if (!window.confirm("Delete this form? This cannot be undone.")) return;
    deleteApiForm(id)
      .then(() => refresh())
      .catch((err) => console.error("[FormsPageClient] Failed to delete form", err));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

      {/* ── Page header ──
          Mobile-first: title and the "New form" CTA always sit on ONE
          row. The subtitle is purely introductory copy — it's hidden on
          narrow viewports (see `.fb-page-subtitle` in globals.css)
          because a user opening the Forms page every day doesn't need
          to be told what the Forms page is for, and it burned ~40 px
          of vertical real estate on phones. See
          `docs/design/MOBILE_DENSITY.md` for the underlying rule. */}
      <div
        className="fb-page-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-divider)",
          backgroundColor: "var(--color-surface)",
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "var(--tracking-tight)",
              color: "var(--color-text-primary)",
              lineHeight: 1.2,
            }}
          >
            {t("title")}
          </h1>
          <p
            className="fb-page-subtitle"
            style={{
              margin: "2px 0 0",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-text-tertiary)",
              lineHeight: 1.4,
            }}
          >
            {t("subtitle")}
          </p>
        </div>

        {canManageForms && (
          <button
            type="button"
            onClick={handleCreateForm}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              height: 40,
              padding: "0 16px",
              borderRadius: "var(--radius-md)",
              border: "none",
              backgroundColor: "var(--color-accent)",
              color: "var(--color-text-inverse)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "var(--tracking-ui)",
              cursor: "pointer",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            + New Form
          </button>
        )}
      </div>

      {!formsLoading && forms.length > 0 && (
        <div
          style={{
            padding: "var(--space-2) var(--space-4)",
            borderBottom: "1px solid var(--color-divider)",
            backgroundColor: "var(--color-surface)",
            flexShrink: 0,
          }}
        >
          <div style={{ maxWidth: 400 }}>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search forms…"
              fontSize={13}
            />
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {formsLoading ? (
          <FormsListSkeleton />
        ) : forms.length === 0 ? (
          <EmptyState canManageForms={canManageForms} onCreateForm={handleCreateForm} />
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 56 }}>
            <p style={{ fontSize: 14, color: "var(--neutral-400)" }}>
              No forms match &ldquo;{search}&rdquo;
            </p>
          </div>
        ) : (
          <div
            style={{
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxWidth: 800,
            }}
          >
            {filtered.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                highlighted={form.id === highlightId}
                canManageForms={canManageForms}
                scopeTypeNames={scopeTypeNames}
                canonicalScopeCodes={canonicalScopeCodes}
                onEdit={() => handleEdit(form.id)}
                onPreview={() => setPreviewFormId(form.id)}
                onDuplicate={() => handleDuplicate(form.id)}
                onDelete={() => handleDelete(form.id)}
              />
            ))}
          </div>
        )}
      </div>

      {setupOpen && (
        <FormSetupModal
          mode="create"
          onSubmit={handleSetupConfirm}
          onClose={() => setSetupOpen(false)}
        />
      )}

      {/* ── Form preview modal ── */}
      {isBrowser && previewFormId &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Form preview"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 300,
              display: "flex",
              flexDirection: "column",
              backgroundColor: "var(--neutral-50, #fafafa)",
            }}
          >
            {/* Close button — floated above the form content */}
            <button
              type="button"
              aria-label="Close preview"
              onClick={() => setPreviewFormId(null)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                zIndex: 10,
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 99,
                border: "none",
                backgroundColor: "rgba(0,0,0,0.12)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <X size={18} aria-hidden />
            </button>

            {/* FormFillLoader fetches the form by ID and renders the preview.
                onClose is forwarded so the form's own header back button also
                closes this overlay (in addition to the X button above). */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              <FormFillLoader
                id={previewFormId}
                onClose={() => setPreviewFormId(null)}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

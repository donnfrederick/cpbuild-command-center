"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ChevronRight, Loader2, X } from "lucide-react";
import { listPublishedForms, type StoredForm } from "@/lib/forms/formsApi";
import {
  draftToStoredForm,
  listResumableLiveDrafts,
} from "@/lib/inspections/inspection-draft-discovery";
import { listPublishedProjectLevelForms } from "@/lib/inspections/project-level-form-eligibility";
import { PROJECT_LEVEL_INSPECTION_UNIT_ID } from "@/lib/inspections/unit-inspection-ref";
import { INSPECTION_SHEET_CSS } from "./inspectionSheetPrimitive";

const ROW_BUTTON_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-3)",
  width: "100%",
  padding: "12px 16px",
  border: "none",
  borderBottom: "1px solid var(--neutral-100)",
  background: "none",
  cursor: "pointer",
  textAlign: "left",
};

const SHIMMER_STYLE: React.CSSProperties = {
  flex: 1,
  height: 16,
  borderRadius: "var(--radius-sm)",
  background:
    "linear-gradient(90deg, var(--neutral-100) 25%, var(--neutral-150) 50%, var(--neutral-100) 75%)",
  backgroundSize: "200% 100%",
  animation: "spis-shimmer 1.4s ease-in-out infinite",
};

export function StartProjectInspectionSheet({
  projectId,
  onStartFill,
  onClose,
}: {
  projectId: string;
  onStartFill: (form: StoredForm) => void;
  onClose: () => void;
}) {
  const t = useTranslations("inspections");
  const tCommon = useTranslations("common");
  const titleId = useId();
  const [visible, setVisible] = useState(false);
  const [forms, setForms] = useState<StoredForm[]>([]);
  const [formsLoading, setFormsLoading] = useState(true);
  const [formsFromCache, setFormsFromCache] = useState(false);
  const [resumableDraftForm, setResumableDraftForm] = useState<StoredForm | null>(null);

  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listPublishedForms()
      .then((result) => {
        if (!cancelled && mountedRef.current) {
          setForms(result.forms);
          setFormsFromCache(result.isFromCache);
          setFormsLoading(false);
        }
      })
      .catch((err) => {
        console.warn("[StartProjectInspectionSheet] Failed to load forms", err);
        if (!cancelled && mountedRef.current) setFormsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listResumableLiveDrafts({
      projectId,
      unitId: PROJECT_LEVEL_INSPECTION_UNIT_ID,
    })
      .then((drafts) => {
        if (cancelled || !mountedRef.current) return;
        const draft = drafts[0];
        setResumableDraftForm(draft ? draftToStoredForm(draft) : null);
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setResumableDraftForm(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const projectLevelForms = useMemo(
    () => listPublishedProjectLevelForms(forms),
    [forms],
  );

  const finishClose = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 260);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finishClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishClose]);

  function handleResumeDraft() {
    if (!resumableDraftForm) return;
    setVisible(false);
    window.setTimeout(() => {
      onStartFill(resumableDraftForm);
      onClose();
    }, 260);
  }

  function handleFormSelect(form: StoredForm) {
    setVisible(false);
    window.setTimeout(() => {
      onStartFill(form);
      onClose();
    }, 260);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <style>{INSPECTION_SHEET_CSS}</style>
      <style>{`@keyframes spis-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      <div
        role="presentation"
        className="ibs-backdrop"
        style={{
          backgroundColor: visible ? "var(--overlay-bg, rgba(0,0,0,0.5))" : "transparent",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) finishClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-busy={formsLoading}
          className={`ibs-sheet${visible ? " ibs-visible" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ibs-handle" aria-hidden />

          <div
            style={{
              padding: "12px 20px 14px",
              borderBottom: "1px solid var(--neutral-200)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "var(--space-3)",
              }}
            >
              <h2
                id={titleId}
                style={{
                  margin: 0,
                  flex: 1,
                  minWidth: 0,
                  fontSize: "var(--text-subheading)",
                  fontWeight: 700,
                  color: "var(--neutral-900)",
                  lineHeight: 1.2,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {t("projectFormListHeading")}
              </h2>
              <button
                type="button"
                onClick={finishClose}
                aria-label={tCommon("close")}
                style={{
                  padding: 6,
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  color: "var(--neutral-500)",
                  flexShrink: 0,
                }}
              >
                <X size={20} aria-hidden />
              </button>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              paddingBottom: "max(32px, env(safe-area-inset-bottom, 0px))",
            }}
          >
            <ProjectFormPicker
              forms={projectLevelForms}
              loading={formsLoading}
              formsFromCache={formsFromCache}
              resumableDraft={resumableDraftForm}
              onResumeDraft={resumableDraftForm ? handleResumeDraft : undefined}
              onSelect={handleFormSelect}
            />
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function ProjectFormLoadingRows() {
  const t = useTranslations("inspections");

  return (
    <div role="status" aria-live="polite" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            ...ROW_BUTTON_STYLE,
            cursor: "default",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              ...SHIMMER_STYLE,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        </div>
      ))}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-2)",
          padding: "var(--space-3) var(--space-4)",
          color: "var(--neutral-500)",
          fontSize: "var(--text-caption)",
        }}
      >
        <Loader2 size={14} className="animate-spin" aria-hidden />
        {t("projectFormListLoading")}
      </div>
    </div>
  );
}

function ProjectFormPicker({
  forms,
  loading,
  formsFromCache,
  resumableDraft,
  onResumeDraft,
  onSelect,
}: {
  forms: StoredForm[];
  loading: boolean;
  formsFromCache: boolean;
  resumableDraft?: StoredForm | null;
  onResumeDraft?: () => void;
  onSelect: (form: StoredForm) => void;
}) {
  const t = useTranslations("inspections");

  if (loading) {
    return <ProjectFormLoadingRows />;
  }

  if (forms.length === 0) {
    return (
      <div style={{ padding: "20px 16px" }}>
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-caption)",
            color: "var(--neutral-500)",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          {t("noProjectLevelFormsAvailable")}
        </p>
      </div>
    );
  }

  const resumeFormName =
    resumableDraft?.template?.name?.trim() || t("untitledForm");

  return (
    <div>
      {formsFromCache && (
        <p
          style={{
            margin: "var(--space-2) var(--space-4) var(--space-3)",
            fontSize: "var(--text-caption)",
            color: "var(--neutral-500)",
          }}
        >
          {t("formsFromCacheBanner")}
        </p>
      )}

      {resumableDraft && onResumeDraft && (
        <div style={{ padding: "0 var(--space-4) var(--space-2)" }}>
          <button
            type="button"
            onClick={onResumeDraft}
            style={{
              ...ROW_BUTTON_STYLE,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--primary-200)",
              borderBottom: "1px solid var(--primary-200)",
              backgroundColor: "var(--primary-50)",
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: "var(--text-body)",
                fontWeight: 600,
                color: "var(--primary-700)",
              }}
            >
              {t("resumeDraftLabel", { formName: resumeFormName })}
            </span>
            <ChevronRight size={16} aria-hidden style={{ color: "var(--primary-400)" }} />
          </button>
        </div>
      )}

      {forms.map((form) => (
        <button
          key={form.id}
          type="button"
          onClick={() => onSelect(form)}
          style={ROW_BUTTON_STYLE}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: "var(--text-body)",
              fontWeight: 600,
              color: "var(--neutral-900)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {form.template?.name?.trim() || t("untitledForm")}
          </span>
          <ChevronRight size={16} aria-hidden style={{ color: "var(--neutral-300)" }} />
        </button>
      ))}
    </div>
  );
}

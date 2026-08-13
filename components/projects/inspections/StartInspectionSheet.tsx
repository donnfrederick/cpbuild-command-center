"use client";

/**
 * Three-step bottom sheet for starting an inspection from the unit
 * detail modal's Inspections row "+ Add" button.
 *
 * Step 1 — Category:  "What type of inspection is this?"
 *           Rows for every user-startable category (not calibration).
 *           Gypcrete appears only when the unit has a floor-covering scope.
 *
 * Step 2 — Scope:     "Which scope does this apply to?" (scope-level only)
 *
 * Step 3 — Form:      Published forms for the selected category.
 *           Unit-level categories (Gypcrete) skip step 2.
 */

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, ClipboardCheck, Layers, Lock } from "lucide-react";
import {
  INSPECTION_CATEGORY_LABELS,
  USER_STARTABLE_INSPECTION_CATEGORIES,
  isUnitLevelInspectionCategory,
  type InspectionCategory,
} from "@/components/forms/formTypes";
import {
  listPublishedForms,
  type StoredForm,
} from "@/lib/forms/formsApi";
import {
  draftToStoredForm,
  listResumableLiveDrafts,
} from "@/lib/inspections/inspection-draft-discovery";
import type { ScopeRow } from "@/components/projects/UnitCards";
import { isPublishedGypcreteFormEligibleForUnit } from "@/lib/inspections/scope-hub-form-eligibility";
import {
  getClearInspectionScopeLockReason,
  isProjectRowInstallCompleteForClearInspection,
  scopeNeedsClearInspectionPrepGate,
} from "@/lib/inspections/clear-inspection-scope-gate";
import { ClearInspectionGateRow } from "@/components/projects/inspections/ClearInspectionGateRow";
import { INSPECTION_SHEET_CSS } from "./inspectionSheetPrimitive";

type Step = "category" | "scope" | "forms";

export function StartInspectionSheet({
  projectId,
  unitId,
  scopes,
  unitHasFlooring,
  onStartFill,
  onClose,
  patchScopeRow,
}: {
  projectId: string;
  unitId: string;
  /** The scopes belonging to the unit — shown in step 2. */
  scopes: ScopeRow[];
  /** When false, Gypcrete Moisture Test is hidden from the category list. */
  unitHasFlooring: boolean;
  onStartFill: (form: StoredForm, scope?: ScopeRow) => void;
  onClose: () => void;
  /** When set, Clear Inspection forms show inline subcontractor + install prep. */
  patchScopeRow?: (scope: ScopeRow, updates: Partial<ScopeRow>) => Promise<boolean>;
}) {
  const t = useTranslations("inspections");
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>("category");
  const [selectedCategory, setSelectedCategory] =
    useState<InspectionCategory | null>(null);
  const [selectedScope, setSelectedScope] = useState<ScopeRow | null>(null);
  const [forms, setForms] = useState<StoredForm[]>([]);
  const [formsLoading, setFormsLoading] = useState(true);
  const [formsFromCache, setFormsFromCache] = useState(false);
  const [resumeDraftLookup, setResumeDraftLookup] = useState<{
    key: string;
    form: StoredForm | null;
  } | null>(null);

  const resumeLookupKey =
    step === "forms" && selectedCategory
      ? `${selectedScope?.id ?? "unit"}:${selectedCategory}`
      : null;

  const resumableDraftForm =
    resumeLookupKey && resumeDraftLookup?.key === resumeLookupKey
      ? resumeDraftLookup.form
      : null;

  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
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
          startTransition(() => {
            setForms(result.forms);
            setFormsFromCache(result.isFromCache);
            setFormsLoading(false);
          });
        }
      })
      .catch((err) => {
        console.warn("[StartInspectionSheet] Failed to load forms", err);
        if (!cancelled && mountedRef.current) setFormsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!resumeLookupKey) return;
    let cancelled = false;
    void listResumableLiveDrafts({
      projectId,
      unitId,
      scopeRowId: selectedScope?.id,
      category: selectedCategory!,
    })
      .then((drafts) => {
        if (cancelled) return;
        setResumeDraftLookup({
          key: resumeLookupKey,
          form: drafts.length > 0 ? draftToStoredForm(drafts[0]!) : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setResumeDraftLookup({ key: resumeLookupKey, form: null });
        }
      });
    return () => { cancelled = true; };
  }, [resumeLookupKey, projectId, unitId, selectedScope?.id, selectedCategory]);

  const finishClose = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 260);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finishClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishClose]);

  const visibleCategories = useMemo(
    () =>
      USER_STARTABLE_INSPECTION_CATEGORIES.filter(
        (category) =>
          category !== "GYPCRETE_MOISTURE_TEST" || unitHasFlooring,
      ),
    [unitHasFlooring],
  );

  const eligibleForms = useMemo(() => {
    if (step !== "forms" || !selectedCategory) return [];

    if (isUnitLevelInspectionCategory(selectedCategory)) {
      return forms.filter((f) => {
        const tmpl = f.template;
        if (!tmpl) return false;
        return isPublishedGypcreteFormEligibleForUnit(tmpl, scopes);
      });
    }

    if (!selectedScope) return [];

    return forms.filter((f) => {
      const tmpl = f.template;
      if (!tmpl || tmpl.status !== "published" || tmpl.level !== "scope") return false;
      if (tmpl.category === "CALIBRATION_INSPECTION") return false;
      if (tmpl.category !== selectedCategory) return false;
      const code =
        selectedScope.scopeType?.canonicalScopeType?.code ??
        selectedScope.scopeType?.code;
      return code ? tmpl.scopeTypeCodes.includes(code) : false;
    });
  }, [step, selectedCategory, selectedScope, forms, scopes]);

  function handleCategorySelect(category: InspectionCategory) {
    setSelectedCategory(category);
    if (isUnitLevelInspectionCategory(category)) {
      setSelectedScope(null);
      setStep("forms");
    } else {
      setStep("scope");
    }
  }

  function handleScopeSelect(scope: ScopeRow) {
    setSelectedScope(scope);
    setStep("forms");
  }

  function handleResumeDraft() {
    if (!resumableDraftForm) return;
    setVisible(false);
    window.setTimeout(() => {
      if (selectedCategory && isUnitLevelInspectionCategory(selectedCategory)) {
        onStartFill(resumableDraftForm);
      } else if (selectedScope) {
        onStartFill(resumableDraftForm, selectedScope);
      }
      onClose();
    }, 180);
  }

  function handleClearInspectionStart(form: StoredForm) {
    setVisible(false);
    window.setTimeout(() => {
      if (selectedScope) {
        onStartFill(form, selectedScope);
      }
      onClose();
    }, 180);
  }

  function handleFormSelect(form: StoredForm) {
    setVisible(false);
    window.setTimeout(() => {
      if (selectedCategory && isUnitLevelInspectionCategory(selectedCategory)) {
        onStartFill(form);
      } else if (selectedScope) {
        onStartFill(form, selectedScope);
      }
      onClose();
    }, 180);
  }

  function handleBack() {
    if (step === "scope") {
      setSelectedCategory(null);
      setStep("category");
    } else if (step === "forms") {
      if (selectedCategory && isUnitLevelInspectionCategory(selectedCategory)) {
        setSelectedCategory(null);
        setStep("category");
      } else {
        setSelectedScope(null);
        setStep("scope");
      }
    }
  }

  const categoryLabel = selectedCategory
    ? INSPECTION_CATEGORY_LABELS[selectedCategory]
    : "";

  const stepTitle =
    step === "category"
      ? t("startInspectionTitle")
      : categoryLabel;

  const stepSubtitle =
    step === "category"
      ? t("step1Title")
      : step === "scope"
        ? t("step2Title")
        : t("step3Title");

  const formStepScopeName =
    selectedScope?.scopeType?.canonicalScopeType?.displayName ??
    selectedScope?.scopeType?.name ??
    selectedScope?.description ??
    (selectedCategory && isUnitLevelInspectionCategory(selectedCategory)
      ? t("unitLevelInspectionScope")
      : t("unknownScope"));

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <style>{INSPECTION_SHEET_CSS}</style>
      <div
        role="presentation"
        className="ibs-backdrop"
        style={{ backgroundColor: visible ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)" }}
        onClick={(e) => { if (e.target === e.currentTarget) finishClose(); }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={stepTitle}
          className={`ibs-sheet${visible ? " ibs-visible" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ibs-handle" aria-hidden />

          <div
            style={{
              padding: "12px 16px 12px",
              borderBottom: "1px solid var(--neutral-150, #ebebeb)",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {step !== "category" && (
              <button
                type="button"
                onClick={handleBack}
                aria-label={t("backAriaLabel")}
                style={{
                  flexShrink: 0,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  background: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  color: "var(--neutral-500)",
                  marginLeft: -4,
                }}
              >
                <ChevronLeft size={20} />
              </button>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: "var(--neutral-900)",
                  lineHeight: 1.2,
                }}
              >
                {stepTitle}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--neutral-500)",
                  marginTop: 2,
                  lineHeight: 1.3,
                }}
              >
                {stepSubtitle}
              </div>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))",
            }}
          >
            {step === "category" && (
              <CategoryStep
                categories={visibleCategories}
                onSelect={handleCategorySelect}
              />
            )}
            {step === "scope" && (
              <ScopeStep
                scopes={scopes}
                selectedCategory={selectedCategory}
                onSelect={handleScopeSelect}
              />
            )}
            {step === "forms" && (
              <FormStep
                forms={eligibleForms}
                loading={formsLoading}
                formsFromCache={formsFromCache}
                categoryLabel={categoryLabel}
                scopeName={formStepScopeName}
                selectedCategory={selectedCategory}
                selectedScope={selectedScope}
                isUnitLevel={
                  selectedCategory != null && isUnitLevelInspectionCategory(selectedCategory)
                }
                resumableDraft={step === "forms" ? resumableDraftForm : null}
                onResumeDraft={step === "forms" && resumableDraftForm ? handleResumeDraft : undefined}
                onSelect={handleFormSelect}
                patchScopeRow={patchScopeRow}
                onClearInspectionStart={handleClearInspectionStart}
              />
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function CategoryStep({
  categories,
  onSelect,
}: {
  categories: InspectionCategory[];
  onSelect: (category: InspectionCategory) => void;
}) {
  return (
    <div style={{ padding: "8px 0 8px" }}>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onSelect(category)}
          style={rowButtonStyle}
        >
          <ClipboardCheck
            size={18}
            aria-hidden
            style={{ color: "var(--primary-500)", flexShrink: 0 }}
          />
          <span
            style={{
              flex: 1,
              fontSize: 15,
              fontWeight: 600,
              color: "var(--neutral-900)",
              textAlign: "left",
            }}
          >
            {INSPECTION_CATEGORY_LABELS[category]}
          </span>
          <ChevronRight
            size={16}
            aria-hidden
            style={{ color: "var(--neutral-300)", flexShrink: 0 }}
          />
        </button>
      ))}
    </div>
  );
}

function ScopeStep({
  scopes,
  selectedCategory,
  onSelect,
}: {
  scopes: ScopeRow[];
  selectedCategory: InspectionCategory | null;
  onSelect: (scope: ScopeRow) => void;
}) {
  const t = useTranslations("inspections");
  if (scopes.length === 0) {
    return (
      <p
        style={{
          margin: "20px 16px 0",
          fontSize: 13,
          color: "var(--neutral-500)",
          fontStyle: "italic",
        }}
      >
        {t("noScopesFound")}
      </p>
    );
  }

  return (
    <div style={{ padding: "8px 0 8px" }}>
      {scopes.map((scope) => {
        const typeName = scope.scopeType?.name ?? t("unknownType");
        const desc = scope.description?.trim();

        const lockReason =
          selectedCategory === "CLEAR_INSPECTION"
            ? getClearInspectionScopeLockReason({
                scopeStage: scope.scopeStage,
                scopeStatus: scope.scopeStatus,
                subScopeInstances: scope.subScopeInstances,
                unifierSubId: scope.unifierSubId,
              })
            : null;

        const lockLabel =
          lockReason === "install_complete"
            ? t("clearInspectionScopeLockedInstallComplete")
            : lockReason === "subcontractor"
              ? t("clearInspectionScopeLockedSubcontractor")
              : null;

        return lockReason ? (
          <div
            key={scope.id}
            role="button"
            aria-disabled="true"
            style={{
              ...rowButtonStyle,
              cursor: "not-allowed",
              opacity: 0.55,
              borderBottom: "1px solid var(--neutral-100)",
            }}
          >
            <Lock
              size={16}
              aria-hidden
              style={{ color: "var(--neutral-400)", flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--neutral-600)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {typeName}
              </div>
              {lockLabel && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--neutral-400)",
                    marginTop: 1,
                  }}
                >
                  {lockLabel}
                </div>
              )}
            </div>
          </div>
        ) : (
          <button
            key={scope.id}
            type="button"
            onClick={() => onSelect(scope)}
            style={rowButtonStyle}
          >
            <Layers
              size={18}
              aria-hidden
              style={{ color: "var(--neutral-400)", flexShrink: 0 }}
            />
            <div
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "left",
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--neutral-900)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {typeName}
              </div>
              {desc && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--neutral-500)",
                    marginTop: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {desc}
                </div>
              )}
            </div>
            <ChevronRight
              size={16}
              aria-hidden
              style={{ color: "var(--neutral-300)", flexShrink: 0 }}
            />
          </button>
        );
      })}
    </div>
  );
}

function FormStep({
  forms,
  loading,
  formsFromCache,
  categoryLabel,
  scopeName,
  selectedCategory,
  selectedScope,
  isUnitLevel,
  resumableDraft,
  onResumeDraft,
  onSelect,
  patchScopeRow,
  onClearInspectionStart,
}: {
  forms: StoredForm[];
  loading: boolean;
  formsFromCache: boolean;
  categoryLabel: string;
  scopeName: string;
  selectedCategory: InspectionCategory | null;
  selectedScope: ScopeRow | null;
  isUnitLevel: boolean;
  resumableDraft?: StoredForm | null;
  onResumeDraft?: () => void;
  onSelect: (form: StoredForm) => void;
  patchScopeRow?: (scope: ScopeRow, updates: Partial<ScopeRow>) => Promise<boolean>;
  onClearInspectionStart: (form: StoredForm) => void;
}) {
  const t = useTranslations("inspections");
  const isClearInspection =
    selectedCategory === "CLEAR_INSPECTION" && selectedScope != null;
  const isInstallComplete =
    selectedScope != null &&
    isProjectRowInstallCompleteForClearInspection({
      scopeStage: selectedScope.scopeStage,
      scopeStatus: selectedScope.scopeStatus,
      subScopeInstances: selectedScope.subScopeInstances,
    });
  const clearInspectionNeedsPrepGate =
    isClearInspection &&
    selectedScope != null &&
    scopeNeedsClearInspectionPrepGate(selectedScope, isInstallComplete);
  const scopePatch =
    selectedScope && patchScopeRow
      ? (updates: Partial<ScopeRow>) => patchScopeRow(selectedScope, updates)
      : undefined;

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "16px 16px" }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 52,
              borderRadius: 10,
              background: "linear-gradient(90deg, var(--neutral-100) 25%, var(--neutral-150) 50%, var(--neutral-100) 75%)",
              backgroundSize: "200% 100%",
              animation: "sis-shimmer 1.4s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
        <style>{`@keyframes sis-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>
    );
  }

  if (forms.length === 0) {
    return (
      <div style={{ padding: "20px 16px" }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--neutral-500)",
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
          {isUnitLevel
            ? t("noUnitLevelFormsForCategory", { categoryLabel })
            : t("noFormsForScopeStart", { categoryLabel, scopeName })}
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 16px 8px" }}>
      {formsFromCache && (
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 12,
            color: "var(--neutral-500)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {t("formsFromCacheBanner")}
        </p>
      )}

      {resumableDraft && onResumeDraft && !(isClearInspection && clearInspectionNeedsPrepGate) && (
        <button
          type="button"
          onClick={onResumeDraft}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid var(--primary-300)",
            backgroundColor: "var(--primary-50)",
            color: "var(--primary-800)",
            fontFamily: "inherit",
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
            marginBottom: 10,
          }}
        >
          <ClipboardCheck size={18} aria-hidden style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{t("resumeDraftCta")}</div>
            <div style={{ fontSize: 12, color: "var(--primary-700)", marginTop: 2 }}>
              {t("resumeDraftHint")}
            </div>
          </div>
        </button>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 0 12px",
          borderBottom: "1px solid var(--neutral-100)",
          marginBottom: 8,
        }}
      >
        <Layers size={13} aria-hidden style={{ color: "var(--neutral-400)" }} />
        <span
          style={{
            fontSize: 12,
            color: "var(--neutral-500)",
            fontWeight: 500,
          }}
        >
          {scopeName}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {forms.map((form) => {
          const template = form.template;
          if (!template) return null;

          if (isClearInspection && clearInspectionNeedsPrepGate) {
            return (
              <ClearInspectionGateRow
                key={form.id}
                template={template}
                stored={form}
                scope={selectedScope}
                isInstallComplete={isInstallComplete}
                patchScopeRow={scopePatch}
                resumeDraftForm={resumableDraft ?? null}
                onStartInspection={onClearInspectionStart}
              />
            );
          }

          return (
          <button
            key={form.id}
            type="button"
            onClick={() => onSelect(form)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--neutral-200)",
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-900)",
              fontFamily: "inherit",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
            }}
          >
            <ClipboardCheck
              size={18}
              aria-hidden
              style={{ color: "var(--primary-500)", flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--neutral-900)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {form.template?.name?.trim() || t("untitledForm")}
              </div>
              {form.template?.description?.trim() && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--neutral-500)",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {form.template.description}
                </div>
              )}
            </div>
            <ChevronRight
              size={16}
              aria-hidden
              style={{ color: "var(--neutral-300)", flexShrink: 0 }}
            />
          </button>
          );
        })}
      </div>
    </div>
  );
}

const rowButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "13px 16px",
  width: "100%",
  border: "none",
  borderBottom: "1px solid var(--neutral-100)",
  backgroundColor: "var(--neutral-0)",
  fontFamily: "inherit",
  cursor: "pointer",
  textAlign: "left",
};

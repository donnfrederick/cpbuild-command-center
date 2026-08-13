"use client";

import { useState, useId, useEffect, useRef } from "react";
import { ChevronLeft, X, Plus, Trash2, Split, CheckCircle2, Loader2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { unitTypeColor } from "@/components/projects/UnitCards";
import type { ScopeTypeOption } from "@/components/projects/UnitCards";

// ── Sheet animation CSS (mobile: slide from bottom; desktop ≥768px: slide from right) ──

const SHEET_CSS = `
  .ssm-backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: flex-end; justify-content: center; background: rgba(0,0,0,0); transition: background-color 0.26s ease; }
  .ssm-backdrop.ssm-visible { background: rgba(0,0,0,0.45); }
  .ssm-sheet { width: 100%; max-width: 520px; height: 82dvh; min-height: 360px; max-height: 640px; background: var(--neutral-0); border-radius: 16px 16px 0 0; display: flex; flex-direction: column; overflow: hidden; pointer-events: auto; box-shadow: 0 -4px 32px rgba(0,0,0,0.18); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); }
  .ssm-sheet.ssm-visible { transform: translateY(0); }
  .ssm-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 0; flex-shrink: 0; }
  @media (min-width: 768px) {
    .ssm-backdrop { align-items: stretch; justify-content: flex-end; }
    .ssm-sheet { width: min(520px, 100vw); max-width: none; height: 100%; max-height: none; border-radius: 0; transform: translateX(105%); box-shadow: -4px 0 32px rgba(0,0,0,0.18); }
    .ssm-sheet.ssm-visible { transform: translateX(0); }
    .ssm-handle { display: none; }
  }
`;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SubScopesModalProps {
  projectId: string;
  unitTypes: string[];
  /** Scope types keyed by unit type — populated by UnitCards from live row data. */
  scopeTypesByUnitType: Record<string, ScopeTypeOption[]>;
  onClose: () => void;
  onCreated: () => void;
}

type Step = "unit-type" | "scope" | "define";
type DistributionMode = "even" | "manual";

interface SubScopeEntry {
  id: string;
  name: string;
  qty: string;
}

/** Per-scope independent configuration stored for the step 3 walk-through. */
interface ScopeConfig {
  scopeType: ScopeTypeOption;
  subScopes: SubScopeEntry[];
  distributionMode: DistributionMode;
  nameErrors: Record<string, string>;
}

function makeEntry(): SubScopeEntry {
  return { id: Math.random().toString(36).slice(2), name: "", qty: "" };
}

// ── Even-split computation ──────────────────────────────────────────────────────

/**
 * Computes how qty should be split across n sub-scopes.
 * - Whole-number qty that doesn't divide evenly: first sub-scope absorbs the remainder as a
 *   whole unit (e.g. 10 ÷ 3 → [4, 3, 3]).
 * - Already-fractional qty: divides evenly across all (e.g. 10.5 ÷ 3 → [3.5, 3.5, 3.5]).
 * - Clean division: all equal.
 */
function computeEvenSplit(qty: number, n: number): { amounts: number[]; uneven: boolean } {
  if (n <= 0) return { amounts: [], uneven: false };
  if (Number.isInteger(qty) && qty % n !== 0) {
    const base = Math.floor(qty / n);
    const remainder = qty - base * n;
    return {
      amounts: [base + remainder, ...Array(Math.max(0, n - 1)).fill(base)],
      uneven: true,
    };
  }
  const each = qty / n;
  return { amounts: Array(n).fill(each), uneven: false };
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

// ── Step progress indicator ────────────────────────────────────────────────────

const STEPS = ["unit-type", "scope", "define"] as const;

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.indexOf(current);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 20px",
        borderBottom: "1px solid var(--neutral-150)",
        flexShrink: 0,
      }}
    >
      {STEPS.map((s, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const isLast = idx === STEPS.length - 1;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", flex: isLast ? 0 : 1 }}>
            {/* Circle */}
            <div
              style={{
                width: 26, height: 26, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                backgroundColor: done || active ? "var(--primary-500)" : "var(--neutral-150)",
                color: done || active ? "var(--neutral-0)" : "var(--neutral-400)",
                fontSize: 12, fontWeight: 700,
                transition: "background-color 0.2s",
              }}
            >
              {done
                ? <Check size={13} strokeWidth={2.5} />
                : idx + 1}
            </div>
            {/* Connecting line */}
            {!isLast && (
              <div style={{ flex: 1, height: 2, margin: "0 6px", borderRadius: 99, overflow: "hidden", backgroundColor: "var(--neutral-150)" }}>
                <div
                  style={{
                    height: "100%",
                    width: done ? "100%" : "0%",
                    backgroundColor: "var(--primary-400)",
                    transition: "width 0.25s ease",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────

export function SubScopesModal({
  projectId,
  unitTypes,
  scopeTypesByUnitType,
  onClose,
  onCreated,
}: SubScopesModalProps) {
  const t = useTranslations("units");
  const nameBaseId = useId();

  // Animate in
  const [visible, setVisible] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(raf);
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    };
  }, []);

  function handleClose() {
    setVisible(false);
    closeTimerRef.current = setTimeout(onClose, 320);
  }

  const [step, setStep] = useState<Step>("unit-type");
  // Single-select unit type
  const [selectedUnitType, setSelectedUnitType] = useState<string | null>(null);
  const [selectedScopeTypes, setSelectedScopeTypes] = useState<ScopeTypeOption[]>([]);
  // Per-scope configuration for step 3
  const [scopeConfigs, setScopeConfigs] = useState<ScopeConfig[]>([]);
  const [scopeConfigIndex, setScopeConfigIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already-configured (unitType, scopeTypeId) pairs — fetched on mount so step 2 can
  // show which scopes are already split and prevent re-selecting them.
  const [configuredPairs, setConfiguredPairs] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch(`/api/projects/${projectId}/sub-scopes`)
      .then((r) => r.json())
      .then((d: { subScopes?: Array<{ unitType: string; scopeTypeId: string }> }) => {
        const pairs = new Set<string>();
        for (const g of d.subScopes ?? []) pairs.add(`${g.unitType}:${g.scopeTypeId}`);
        setConfiguredPairs(pairs);
      })
      .catch(() => {});
  }, [projectId]);

  function isAlreadyConfigured(scopeTypeId: string): boolean {
    return selectedUnitType != null && configuredPairs.has(`${selectedUnitType}:${scopeTypeId}`);
  }

  // Scopes available for the selected unit type only
  const availableScopes: ScopeTypeOption[] =
    selectedUnitType ? (scopeTypesByUnitType[selectedUnitType] ?? []) : [];

  // Current scope config (step 3)
  const currentConfig: ScopeConfig | undefined = scopeConfigs[scopeConfigIndex];

  // ── Navigation ───────────────────────────────────────────────────────────────

  function goToScope() {
    if (!selectedUnitType) return;
    setSelectedScopeTypes([]);
    setStep("scope");
  }

  function goToDefine() {
    if (selectedScopeTypes.length === 0) return;
    setScopeConfigs(
      selectedScopeTypes.map((st) => ({
        scopeType: st,
        subScopes: [makeEntry(), makeEntry()],
        distributionMode: "even",
        nameErrors: {},
      }))
    );
    setScopeConfigIndex(0);
    setStep("define");
  }

  function goBack() {
    if (step === "scope") { setStep("unit-type"); return; }
    if (step === "define") {
      if (scopeConfigIndex > 0) {
        setScopeConfigIndex((i) => i - 1);
      } else {
        setStep("scope");
      }
    }
  }

  // ── Config mutation helpers (all operate on scopeConfigs[scopeConfigIndex]) ──

  function updateConfig(patch: Partial<Omit<ScopeConfig, "scopeType">>) {
    setScopeConfigs((prev) =>
      prev.map((c, i) => (i === scopeConfigIndex ? { ...c, ...patch } : c))
    );
  }

  function updateSubScopeEntry(id: string, field: keyof Omit<SubScopeEntry, "id">, value: string) {
    setScopeConfigs((prev) =>
      prev.map((c, i) => {
        if (i !== scopeConfigIndex) return c;
        const subScopes = c.subScopes.map((e) => (e.id === id ? { ...e, [field]: value } : e));
        const nameErrors =
          field === "name"
            ? (({ [id]: _, ...rest }) => rest)(c.nameErrors)
            : c.nameErrors;
        return { ...c, subScopes, nameErrors };
      })
    );
  }

  function addSubScopeEntry() {
    if (!currentConfig) return;
    updateConfig({ subScopes: [...currentConfig.subScopes, makeEntry()] });
  }

  function removeSubScopeEntry(id: string) {
    if (!currentConfig || currentConfig.subScopes.length <= 2) return;
    updateConfig({ subScopes: currentConfig.subScopes.filter((e) => e.id !== id) });
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validateCurrentConfig(): boolean {
    if (!currentConfig) return false;
    const errors: Record<string, string> = {};
    const seen = new Set<string>();
    for (const e of currentConfig.subScopes) {
      const trimmed = e.name.trim();
      if (!trimmed) { errors[e.id] = t("subScopesNameRequired"); continue; }
      if (seen.has(trimmed.toLowerCase())) { errors[e.id] = t("subScopesNameUnique"); continue; }
      seen.add(trimmed.toLowerCase());
    }
    updateConfig({ nameErrors: errors });
    return Object.keys(errors).length === 0;
  }

  // ── Manual qty totals ─────────────────────────────────────────────────────

  function manualAssignedTotal(config: ScopeConfig): number {
    return config.subScopes.reduce((sum, e) => sum + (parseFloat(e.qty) || 0), 0);
  }

  function isManualQtyValid(config: ScopeConfig): boolean {
    if (config.distributionMode !== "manual") return true;
    const scopeQty = config.scopeType.qtyPerUnit;
    if (scopeQty === null || config.scopeType.qtyVaries) return true;
    return Math.abs(manualAssignedTotal(config) - scopeQty) < 0.001;
  }

  // ── Advance within step 3 or submit ──────────────────────────────────────

  function advanceScopeOrSubmit() {
    if (!validateCurrentConfig()) return;
    if (!isManualQtyValid(currentConfig!)) return;
    if (scopeConfigIndex < scopeConfigs.length - 1) {
      setScopeConfigIndex((i) => i + 1);
    } else {
      void handleSubmit();
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!selectedUnitType || scopeConfigs.length === 0) return;

    setIsSubmitting(true);
    try {
      let totalInstances = 0;
      let totalSubScopeCount = 0;

      for (const config of scopeConfigs) {
        const subScopePayload = config.subScopes.map((e, i) => ({
          name: e.name.trim(),
          displayOrder: i,
          ...(config.distributionMode === "manual" && e.qty !== ""
            ? { qty: parseFloat(e.qty) }
            : {}),
        }));

        const res = await fetch(`/api/projects/${projectId}/sub-scopes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unitType: selectedUnitType,
            scopeTypeId: config.scopeType.id,
            distributionMode: config.distributionMode,
            subScopes: subScopePayload,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string | object };
          const msg = typeof data.error === "string" ? data.error : t("subScopesErrorGeneric");
          toast.error(msg);
          return;
        }

        const data = await res.json() as { rowCount?: number };
        totalInstances += data.rowCount ?? 0;
        totalSubScopeCount += config.subScopes.length;
      }

      toast.success(t("subScopesSuccessTitle"), {
        description: t("subScopesSuccessDesc", {
          count: totalInstances,
          subScopeCount: totalSubScopeCount,
        }),
      });
      onCreated();
      handleClose();
    } catch {
      toast.error(t("subScopesErrorGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isOnLastScope = scopeConfigIndex === scopeConfigs.length - 1;
  const canAdvanceOrSubmit = (() => {
    if (!currentConfig) return false;
    const hasNames = currentConfig.subScopes.every((e) => e.name.trim().length > 0);
    return hasNames && isManualQtyValid(currentConfig);
  })();

  return (
    <>
      <style>{SHEET_CSS}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sub-scopes-modal-title"
        className={`ssm-backdrop${visible ? " ssm-visible" : ""}`}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        onKeyDown={(e) => { if (e.key === "Escape") handleClose(); }}
      >
        {/* Drag handle — mobile only */}
        <div className="ssm-handle" aria-hidden="true" />

        <div
          className={`ssm-sheet${visible ? " ssm-visible" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px 20px 16px",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  backgroundColor: "var(--primary-50)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Split size={16} style={{ color: "var(--primary-600)" }} />
              </div>
              <div>
                <h2
                  id="sub-scopes-modal-title"
                  style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--neutral-900)", lineHeight: 1.2 }}
                >
                  {t("subScopesModalTitle")}
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--neutral-500)", lineHeight: 1.3 }}>
                  {t("subScopesModalSubtitle")}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: "none", backgroundColor: "transparent",
                color: "var(--neutral-500)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Step progress indicator */}
          <StepIndicator current={step} />

          {/* Body */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* ── Step 1: Unit Type (single-select) ── */}
            {step === "unit-type" && (
              <>
                {/* Pinned description */}
                <div style={{ flexShrink: 0, padding: "16px 20px 0" }}>
                  <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--neutral-600)" }}>
                    {t("subScopesStep1Desc")}
                  </p>
                </div>

                {/* Scrollable list */}
                <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
                  {unitTypes.length === 0 ? (
                    <p style={{ color: "var(--neutral-500)", fontSize: 14 }}>{t("subScopesNoUnitTypes")}</p>
                  ) : (
                    <div
                      role="listbox"
                      aria-label={t("subScopesStep1Title")}
                      style={{
                        border: "1px solid var(--neutral-200)",
                        borderRadius: 10,
                        overflow: "hidden",
                      }}
                    >
                      {unitTypes.map((ut, idx) => {
                        const isSelected = selectedUnitType === ut;
                        const isLast = idx === unitTypes.length - 1;
                        const { bg, text } = unitTypeColor(ut);
                        return (
                          <button
                            key={ut}
                            role="option"
                            aria-selected={isSelected}
                            type="button"
                            onClick={() => setSelectedUnitType(ut)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              width: "100%",
                              padding: "11px 16px",
                              border: "none",
                              borderBottom: isLast ? "none" : "1px solid var(--neutral-150)",
                              backgroundColor: isSelected ? bg : "var(--neutral-0)",
                              color: isSelected ? text : "var(--neutral-800)",
                              fontSize: 14,
                              fontWeight: isSelected ? 600 : 400,
                              textAlign: "left",
                              cursor: "pointer",
                              transition: "background-color 0.1s",
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) e.currentTarget.style.backgroundColor = "var(--neutral-50)";
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) e.currentTarget.style.backgroundColor = "var(--neutral-0)";
                            }}
                          >
                            {/* Color swatch dot */}
                            <span style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                              <span style={{
                                width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                                backgroundColor: isSelected ? text : bg,
                                border: isSelected ? "none" : `2px solid ${text}`,
                                opacity: isSelected ? 1 : 0.7,
                              }} />
                              {ut}
                            </span>
                            {isSelected && (
                              <Check size={15} style={{ color: text, flexShrink: 0 }} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Step 2: Scope Type (multi-select) ── */}
            {step === "scope" && (
              <>
                {/* Pinned top: description + selected scope chips */}
                <div style={{ flexShrink: 0, padding: "16px 20px 0" }}>
                  <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--neutral-600)" }}>
                    {t("subScopesStep2Desc")}
                  </p>

                  {selectedScopeTypes.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        padding: "10px 12px",
                        marginBottom: 12,
                        backgroundColor: "var(--neutral-50)",
                        border: "1px solid var(--neutral-200)",
                        borderRadius: 10,
                      }}
                    >
                      {selectedScopeTypes.map((sc) => (
                        <button
                          key={sc.id}
                          type="button"
                          onClick={() =>
                            setSelectedScopeTypes((prev) => prev.filter((x) => x.id !== sc.id))
                          }
                          aria-label={`Remove ${sc.name}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "4px 8px 4px 10px",
                            borderRadius: 99,
                            border: "1.5px solid var(--primary-300)",
                            backgroundColor: "var(--primary-50)",
                            color: "var(--primary-700)",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {sc.name}
                          <X size={11} style={{ color: "var(--primary-400)", flexShrink: 0 }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Scrollable list */}
                <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
                  {availableScopes.length === 0 ? (
                    <p style={{ color: "var(--neutral-500)", fontSize: 14 }}>{t("subScopesNoScopes")}</p>
                  ) : (
                    <div
                      role="listbox"
                      aria-multiselectable="true"
                      aria-label={t("subScopesStep2Title")}
                      style={{
                        border: "1px solid var(--neutral-200)",
                        borderRadius: 10,
                        overflow: "hidden",
                      }}
                    >
                      {availableScopes.map((sc, idx) => {
                        const alreadyConfigured = isAlreadyConfigured(sc.id);
                        const isSelected = selectedScopeTypes.some((x) => x.id === sc.id);
                        const isLast = idx === availableScopes.length - 1;
                        return (
                          <button
                            key={sc.id}
                            role="option"
                            aria-selected={isSelected}
                            aria-disabled={alreadyConfigured}
                            type="button"
                            disabled={alreadyConfigured}
                            onClick={() => {
                              if (alreadyConfigured) return;
                              setSelectedScopeTypes((prev) =>
                                isSelected
                                  ? prev.filter((x) => x.id !== sc.id)
                                  : [...prev, sc]
                              );
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              width: "100%",
                              padding: "13px 16px",
                              border: "none",
                              borderBottom: isLast ? "none" : "1px solid var(--neutral-150)",
                              backgroundColor: alreadyConfigured
                                ? "var(--neutral-50)"
                                : isSelected ? "var(--primary-50)" : "var(--neutral-0)",
                              color: alreadyConfigured
                                ? "var(--neutral-400)"
                                : isSelected ? "var(--primary-700)" : "var(--neutral-800)",
                              fontSize: 14,
                              fontWeight: alreadyConfigured ? 400 : isSelected ? 600 : 400,
                              textAlign: "left",
                              cursor: alreadyConfigured ? "default" : "pointer",
                              transition: "background-color 0.1s",
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected && !alreadyConfigured) e.currentTarget.style.backgroundColor = "var(--neutral-50)";
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected && !alreadyConfigured) e.currentTarget.style.backgroundColor = "var(--neutral-0)";
                            }}
                          >
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {sc.name}
                            </span>
                            {alreadyConfigured ? (
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
                                fontSize: 11, fontWeight: 600,
                                color: "var(--success-700, #15803d)",
                                backgroundColor: "var(--success-50, #f0fdf4)",
                                border: "1px solid var(--success-200, #bbf7d0)",
                                borderRadius: 99, padding: "2px 8px",
                              }}>
                                <CheckCircle2 size={11} />
                                Already configured
                              </span>
                            ) : isSelected ? (
                              <Check size={15} style={{ color: "var(--primary-500)", flexShrink: 0 }} />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Step 3: Define sub-scopes (per-scope walk-through) ── */}
            {step === "define" && currentConfig && (
              <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

                {/* Scope X of N sub-header (only when multiple scopes) */}
                {scopeConfigs.length > 1 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 14,
                      padding: "10px 14px",
                      backgroundColor: "var(--primary-50)",
                      borderRadius: 10,
                      border: "1px solid var(--primary-200)",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary-700)" }}>
                      {t("subScopesScopeOf", {
                        current: scopeConfigIndex + 1,
                        total: scopeConfigs.length,
                        name: currentConfig.scopeType.name,
                      })}
                    </span>
                    {/* Mini dot progress */}
                    <div style={{ display: "flex", gap: 5 }}>
                      {scopeConfigs.map((_, i) => (
                        <div
                          key={i}
                          style={{
                            width: 6, height: 6, borderRadius: "50%",
                            backgroundColor: i === scopeConfigIndex
                              ? "var(--primary-500)"
                              : i < scopeConfigIndex
                                ? "var(--primary-300)"
                                : "var(--neutral-300)",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Scope name (single scope only — multi-scope shows name in the header above) */}
                {scopeConfigs.length === 1 && (
                  <p style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 600, color: "var(--neutral-900)" }}>
                    {currentConfig.scopeType.name}
                  </p>
                )}

                {/* ── 1. Sub-scope names ── */}
                <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
                  Sub-scope names
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {currentConfig.subScopes.map((entry, idx) => (
                    <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      {/* Index badge */}
                      <div
                        style={{
                          width: 26, height: 26, borderRadius: 99,
                          backgroundColor: "var(--neutral-100)",
                          color: "var(--neutral-500)",
                          fontSize: 12, fontWeight: 600,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, marginTop: 9,
                        }}
                      >
                        {idx + 1}
                      </div>

                      {/* Name input */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          id={`${nameBaseId}-name-${entry.id}`}
                          type="text"
                          value={entry.name}
                          onChange={(e) => updateSubScopeEntry(entry.id, "name", e.target.value)}
                          placeholder={t("subScopesNamePlaceholder")}
                          aria-label={`${t("subScopesNameLabel")} ${idx + 1}`}
                          style={{
                            width: "100%", height: 44, padding: "0 12px",
                            border: currentConfig.nameErrors[entry.id]
                              ? "1.5px solid var(--error-500)"
                              : "1px solid var(--neutral-300)",
                            borderRadius: 8, fontSize: 14,
                            color: "var(--neutral-900)",
                            backgroundColor: "var(--neutral-0)",
                            outline: "none", boxSizing: "border-box",
                          }}
                          onFocus={(e) => { if (!currentConfig.nameErrors[entry.id]) e.currentTarget.style.borderColor = "var(--primary-400)"; }}
                          onBlur={(e) => { if (!currentConfig.nameErrors[entry.id]) e.currentTarget.style.borderColor = "var(--neutral-300)"; }}
                        />
                        {currentConfig.nameErrors[entry.id] && (
                          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--error-600)" }}>
                            {currentConfig.nameErrors[entry.id]}
                          </p>
                        )}
                      </div>

                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => removeSubScopeEntry(entry.id)}
                        disabled={currentConfig.subScopes.length <= 2}
                        aria-label={t("subScopesRemove")}
                        style={{
                          width: 36, height: 44, flexShrink: 0,
                          border: "none", borderRadius: 8,
                          backgroundColor: "transparent",
                          color: currentConfig.subScopes.length <= 2 ? "var(--neutral-250)" : "var(--neutral-400)",
                          cursor: currentConfig.subScopes.length <= 2 ? "default" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "color 0.12s",
                        }}
                        onMouseEnter={(e) => { if (currentConfig.subScopes.length > 2) e.currentTarget.style.color = "var(--error-500)"; }}
                        onMouseLeave={(e) => { if (currentConfig.subScopes.length > 2) e.currentTarget.style.color = "var(--neutral-400)"; }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add another sub-scope */}
                <button
                  type="button"
                  onClick={addSubScopeEntry}
                  style={{
                    marginTop: 10, marginBottom: 20,
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "8px 14px",
                    border: "1.5px dashed var(--neutral-300)",
                    borderRadius: 8, backgroundColor: "transparent",
                    color: "var(--primary-600)", fontSize: 13, fontWeight: 500, cursor: "pointer",
                  }}
                >
                  <Plus size={14} />
                  {t("subScopesAddAnother")}
                </button>

                {/* ── 2. Quantity split ── */}
                <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
                  {t("subScopesDistributionLabel")}
                </p>

                {/* Qty info row — plain text, not a form field */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 12,
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--neutral-500)", fontWeight: 400 }}>
                    Qty per unit (from project):
                  </span>
                  {currentConfig.scopeType.qtyVaries ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-600)" }}>
                      {t("subScopesQtyVaries")}
                    </span>
                  ) : currentConfig.scopeType.qtyPerUnit !== null ? (
                    <>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-900)" }}>
                        {fmtQty(currentConfig.scopeType.qtyPerUnit)}
                      </span>
                      {currentConfig.scopeType.uom?.code ? (
                        <span style={{ fontSize: 13, color: "var(--neutral-500)" }}>
                          {currentConfig.scopeType.uom.code}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span style={{ fontSize: 13, color: "var(--neutral-400)" }}>Not set</span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  {(["even", "manual"] as DistributionMode[]).map((mode) => {
                    const active = currentConfig.distributionMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateConfig({ distributionMode: mode })}
                        style={{
                          flex: 1, padding: "10px 14px", borderRadius: 10,
                          border: active ? "2px solid var(--primary-500)" : "1.5px solid var(--neutral-250)",
                          backgroundColor: active ? "var(--primary-50)" : "var(--neutral-0)",
                          color: active ? "var(--primary-700)" : "var(--neutral-700)",
                          cursor: "pointer", textAlign: "left", transition: "all 0.12s",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                          {mode === "even" ? t("subScopesDistributionEven") : t("subScopesDistributionManual")}
                        </div>
                        <div style={{ fontSize: 12, color: active ? "var(--primary-600)" : "var(--neutral-500)" }}>
                          {mode === "even" ? t("subScopesDistributionEvenDesc") : t("subScopesDistributionManualDesc")}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Even split preview */}
                {currentConfig.distributionMode === "even" &&
                  !currentConfig.scopeType.qtyVaries &&
                  currentConfig.scopeType.qtyPerUnit !== null && (() => {
                    const { amounts, uneven } = computeEvenSplit(
                      currentConfig.scopeType.qtyPerUnit,
                      currentConfig.subScopes.length
                    );
                    const uomCode = currentConfig.scopeType.uom?.code ?? "";
                    return (
                      <div style={{
                        padding: "10px 14px", borderRadius: 8,
                        backgroundColor: "var(--neutral-50)", border: "1px solid var(--neutral-200)",
                        fontSize: 12, color: "var(--neutral-600)",
                      }}>
                        {uneven
                          ? t("subScopesEvenPreviewUneven", { first: fmtQty(amounts[0]), rest: fmtQty(amounts[1] ?? 0), uom: uomCode })
                          : t("subScopesEvenPreviewExact", { each: fmtQty(amounts[0] ?? 0), uom: uomCode })}
                      </div>
                    );
                  })()}

                {/* Manual allocation — qty inputs appear here, labelled by sub-scope name */}
                {currentConfig.distributionMode === "manual" && (() => {
                  const scopeQty = currentConfig.scopeType.qtyPerUnit;
                  const uomCode = currentConfig.scopeType.uom?.code ?? "";
                  const showTotal = !currentConfig.scopeType.qtyVaries && scopeQty !== null;
                  const assigned = manualAssignedTotal(currentConfig);
                  const diff = showTotal ? assigned - scopeQty! : 0;
                  const isOver = showTotal && diff > 0.001;
                  const isUnder = showTotal && diff < -0.001;
                  const isMatch = showTotal && !isOver && !isUnder;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {currentConfig.subScopes.map((entry, idx) => {
                        const label = entry.name.trim() || `Sub-scope ${idx + 1}`;
                        return (
                          <div
                            key={entry.id}
                            style={{ display: "flex", alignItems: "center", gap: 10 }}
                          >
                            <span style={{
                              flex: 1, fontSize: 13, color: "var(--neutral-700)",
                              fontWeight: entry.name.trim() ? 500 : 400,
                              fontStyle: entry.name.trim() ? "normal" : "italic",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {label}
                            </span>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={entry.qty}
                              onChange={(e) => updateSubScopeEntry(entry.id, "qty", e.target.value)}
                              placeholder="0"
                              aria-label={`${t("subScopesQtyLabel")} for ${label}`}
                              style={{
                                width: 80, height: 40, padding: "0 10px",
                                border: "1px solid var(--neutral-300)", borderRadius: 8,
                                fontSize: 14, color: "var(--neutral-900)",
                                backgroundColor: "var(--neutral-0)",
                                outline: "none", boxSizing: "border-box", flexShrink: 0,
                              }}
                              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary-400)"; }}
                              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--neutral-300)"; }}
                            />
                          </div>
                        );
                      })}

                      {/* Running total status */}
                      {showTotal && (
                        <div style={{
                          marginTop: 4, padding: "8px 12px", borderRadius: 8,
                          backgroundColor: isMatch
                            ? "var(--success-50, #f0fdf4)"
                            : isOver ? "var(--error-50, #fef2f2)" : "var(--warning-50, #fffbeb)",
                          border: `1px solid ${isMatch
                            ? "var(--success-200, #bbf7d0)"
                            : isOver ? "var(--error-200, #fecaca)" : "var(--warning-200, #fde68a)"}`,
                          fontSize: 12, fontWeight: 500,
                          color: isMatch
                            ? "var(--success-700, #15803d)"
                            : isOver ? "var(--error-700, #b91c1c)" : "var(--warning-700, #b45309)",
                        }}>
                          {isOver
                            ? t("subScopesManualOver", { over: fmtQty(diff), uom: uomCode })
                            : isUnder
                              ? t("subScopesManualUnder", { remaining: fmtQty(-diff), uom: uomCode })
                              : t("subScopesManualAssigned", { assigned: fmtQty(assigned), total: fmtQty(scopeQty!), uom: uomCode })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)",
              borderTop: "1px solid var(--neutral-150)",
              flexShrink: 0,
              gap: 10,
            }}
          >
            {/* Back / cancel */}
            {step === "unit-type" ? (
              <button
                type="button"
                onClick={handleClose}
                style={{
                  height: 44, padding: "0 20px", borderRadius: 8,
                  border: "1px solid var(--neutral-300)",
                  backgroundColor: "var(--neutral-0)",
                  color: "var(--neutral-700)", fontSize: 14, fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={goBack}
                style={{
                  height: 44, padding: "0 16px", borderRadius: 8,
                  border: "1px solid var(--neutral-300)",
                  backgroundColor: "var(--neutral-0)",
                  color: "var(--neutral-700)", fontSize: 14, fontWeight: 500,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                <ChevronLeft size={16} />
                {t("subScopesBack")}
              </button>
            )}

            {/* Next / advance / submit */}
            {step === "unit-type" && (
              <button
                type="button"
                onClick={goToScope}
                disabled={!selectedUnitType}
                style={{
                  height: 44, padding: "0 24px", borderRadius: 8,
                  border: "none",
                  backgroundColor: selectedUnitType ? "var(--primary-500)" : "var(--neutral-200)",
                  color: selectedUnitType ? "var(--neutral-0)" : "var(--neutral-400)",
                  fontSize: 14, fontWeight: 600,
                  cursor: selectedUnitType ? "pointer" : "default",
                  transition: "all 0.12s",
                }}
              >
                {t("subScopesNext")}
              </button>
            )}

            {step === "scope" && (
              <button
                type="button"
                onClick={goToDefine}
                disabled={selectedScopeTypes.length === 0}
                style={{
                  height: 44, padding: "0 24px", borderRadius: 8,
                  border: "none",
                  backgroundColor: selectedScopeTypes.length > 0 ? "var(--primary-500)" : "var(--neutral-200)",
                  color: selectedScopeTypes.length > 0 ? "var(--neutral-0)" : "var(--neutral-400)",
                  fontSize: 14, fontWeight: 600,
                  cursor: selectedScopeTypes.length > 0 ? "pointer" : "default",
                  transition: "all 0.12s",
                }}
              >
                {t("subScopesNext")}
              </button>
            )}

            {step === "define" && (
              <button
                type="button"
                onClick={advanceScopeOrSubmit}
                disabled={isSubmitting || !canAdvanceOrSubmit}
                style={{
                  height: 44, padding: "0 24px", borderRadius: 8,
                  border: "none",
                  backgroundColor: isSubmitting || !canAdvanceOrSubmit
                    ? "var(--neutral-200)"
                    : "var(--primary-500)",
                  color: isSubmitting || !canAdvanceOrSubmit ? "var(--neutral-400)" : "var(--neutral-0)",
                  fontSize: 14, fontWeight: 600,
                  cursor: isSubmitting || !canAdvanceOrSubmit ? "default" : "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "all 0.12s",
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
                    {t("subScopesCreating")}
                  </>
                ) : isOnLastScope ? (
                  <>
                    <CheckCircle2 size={15} />
                    {scopeConfigs.length > 1 ? t("subScopesSaveAll") : t("subScopesCreate")}
                  </>
                ) : (
                  t("subScopesNextScope")
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}


"use client";

/**
 * FormSetupModal — the "What are you building?" gate.
 *
 * Shown before the builder opens when the user taps "New form", and
 * reopened from the builder's pinned summary row when they want to
 * change the tags. Collecting these three facts up front (and keeping
 * them out of the builder page itself) means the author answers the
 * taxonomy question once, forgets about it, and spends builder time
 * on questions — not on configuration.
 *
 * Shape:
 *   1) Category (single-select): what kind of inspection is this?
 *   2) Level (single-select): is this form scope-specific or unit-specific?
 *   3) Scope types (multi-select, conditional): which scope types does it
 *      apply to? Only shown when level = "scope".
 *
 * The scope-types list is the real [ScopeType] table served by
 * /api/lookups — NOT the canonical_scope_types admin roll-up. That
 * was the source of the earlier confusion where the builder surfaced
 * codes Hannah didn't recognize.
 *
 * Start build / Save is disabled until the selection is coherent:
 * category + level chosen, and at least one scope type picked if
 * level = scope. Cancelling from create mode throws the selection
 * away; cancelling from edit mode leaves the form untouched.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as FocusScope from "@radix-ui/react-focus-scope";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import type {
  FormLevel,
  FormPurpose,
  InspectionCategory,
} from "./formTypes";
import {
  FORM_PURPOSES,
  INSPECTION_CATEGORIES,
  INSPECTION_CATEGORY_LABELS,
  isUnitLevelInspectionCategory,
  normalizeFormPurpose,
} from "./formTypes";

/** Shape of a canonical scope type row returned by /api/lookups → canonicalScopeTypes. */
interface ScopeTypeOption {
  id: string;
  /** Canonical code (e.g. "CAB") — stored in form.scopeTypeCodes. */
  code: string;
  /** Normalized display name (e.g. "Cabinetry") — shown to the author. */
  displayName: string;
}

export interface FormSetupValues {
  formPurpose: FormPurpose;
  category: InspectionCategory;
  level: FormLevel;
  /** ScopeType codes (e.g. "CAB", "DRYW") — empty when level === "unit". */
  scopeTypeCodes: string[];
}

export interface FormSetupModalProps {
  mode: "create" | "edit";
  /**
   * Pre-filled values when editing. For create mode this is typically
   * undefined, though callers may seed defaults if they want.
   */
  initialValues?: Partial<FormSetupValues>;
  /**
   * Called with the user's selection when they tap Start build / Save.
   * The modal does not close itself — the caller is responsible for
   * closing after it finishes its own work (e.g. routing).
   */
  onSubmit: (values: FormSetupValues) => void;
  onClose: () => void;
}

export function FormSetupModal({
  mode,
  initialValues,
  onSubmit,
  onClose,
}: FormSetupModalProps) {
  const t = useTranslations("forms.setup");
  const tCommon = useTranslations("common");
  const [formPurpose, setFormPurpose] = useState<FormPurpose | null>(
    initialValues?.formPurpose != null
      ? normalizeFormPurpose(initialValues.formPurpose)
      : null,
  );
  const [category, setCategory] = useState<InspectionCategory | null>(
    initialValues?.category ?? null,
  );
  const [level, setLevel] = useState<FormLevel | null>(
    initialValues?.level ?? null,
  );
  const [scopeTypeCodes, setScopeTypeCodes] = useState<string[]>(
    initialValues?.scopeTypeCodes ?? [],
  );

  const [scopeTypes, setScopeTypes] = useState<ScopeTypeOption[]>([]);
  const [scopeTypesLoading, setScopeTypesLoading] = useState(false);
  const [scopeTypesError, setScopeTypesError] = useState<string | null>(null);
  // Tracks whether we've already kicked off the fetch. Using a ref
  // (instead of including loading/length in the effect deps) means the
  // effect doesn't re-run — and its cleanup doesn't cancel the
  // in-flight request — when `setScopeTypesLoading(true)` flips a state
  // value that would otherwise re-trigger the effect. That subtle
  // cleanup-cancels-fetch behavior was silently swallowing the payload
  // and leaving the list empty.
  const fetchStartedRef = useRef(false);

  // Fetch canonical scope types (from canonical_scope_types table, via /api/lookups)
  // only when needed — i.e. when the author has chosen "scope". This ensures
  // the picker shows normalized display names ("Cabinetry") rather than raw
  // aliases ("CABIU", "Cabinetry") that would otherwise appear as duplicates.
  useEffect(() => {
    if (level !== "scope") return;
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    let cancelled = false;
    setScopeTypesLoading(true);
    setScopeTypesError(null);
    (async () => {
      try {
        const res = await fetch("/api/lookups");
        if (!res.ok) throw new Error(`lookups ${res.status}`);
        const data = (await res.json()) as { canonicalScopeTypes?: ScopeTypeOption[] };
        if (!cancelled) {
          // canonicalScopeTypes already sorted by sortOrder + displayName from the API
          setScopeTypes(data.canonicalScopeTypes ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setScopeTypesError(t("scopeTypesLoadError"));
          console.warn("[FormSetupModal] /api/lookups failed", err);
          // Allow a retry on the next level change if the request
          // failed — the user may have come back online.
          fetchStartedRef.current = false;
        }
      } finally {
        if (!cancelled) setScopeTypesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      // Reset the guard so that a remount (React 18 StrictMode
      // double-invokes effects) or a level toggle can trigger a fresh
      // fetch. Without this the ref stays `true` after the cleanup
      // cancels the first in-flight request, meaning the second mount
      // sees the guard as already set and returns early — leaving the
      // list permanently empty.
      fetchStartedRef.current = false;
    };
  }, [level]);

  // Escape + body scroll lock, same pattern as other overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const selectedCodeSet = useMemo(
    () => new Set(scopeTypeCodes),
    [scopeTypeCodes],
  );

  function pickPurpose(next: FormPurpose) {
    setFormPurpose(next);
    if (next === "documentation") {
      setCategory("OTHER");
    }
  }

  function pickCategory(next: InspectionCategory) {
    setCategory(next);
    if (isUnitLevelInspectionCategory(next)) {
      pickLevel("unit");
    }
  }

  function toggleScopeCode(code: string) {
    setScopeTypeCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  // When the author flips level from scope → unit, drop any scope
  // selections. Keeping them would leave the form in an inconsistent
  // state if they flipped back (stale selections resurface).
  function pickLevel(next: FormLevel) {
    if (category && isUnitLevelInspectionCategory(category) && next === "scope") {
      return;
    }
    setLevel(next);
    if (next === "unit" || next === "project") setScopeTypeCodes([]);
  }

  const isDocumentation = formPurpose === "documentation";
  const gypcreteCategory =
    !isDocumentation && category != null && isUnitLevelInspectionCategory(category);

  const canSubmit =
    formPurpose !== null &&
    level !== null &&
    (isDocumentation ||
      (category !== null &&
        (gypcreteCategory ||
          level === "unit" ||
          level === "project" ||
          scopeTypeCodes.length > 0)));

  function handleSubmit() {
    if (!canSubmit || !formPurpose || !level) return;
    const resolvedCategory: InspectionCategory = isDocumentation
      ? "OTHER"
      : category!;
    onSubmit({
      formPurpose,
      category: resolvedCategory,
      level: gypcreteCategory ? "unit" : level,
      scopeTypeCodes:
        gypcreteCategory || level === "unit" || level === "project" ? [] : scopeTypeCodes,
    });
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 280,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <FocusScope.Root loop trapped asChild>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-setup-title"
        style={{
          backgroundColor: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 520,
          maxHeight: "calc(100vh - 32px)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px 12px",
            borderBottom: "1px solid var(--neutral-150)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <h2
            id="form-setup-title"
            style={{
              flex: 1,
              minWidth: 0,
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: "var(--neutral-900)",
              lineHeight: 1.3,
            }}
          >
            {mode === "create" ? t("titleCreate") : t("titleEdit")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon("close")}
            style={{
              width: 32,
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "var(--neutral-500)",
              borderRadius: 7,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — flex: 1 + minHeight: 0 lets it shrink and scroll */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            padding: "14px 16px 16px",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {/* Step 1 — form purpose */}
          <SetupSection step={1} title={t("stepPurposeQuestion")}>
            <div
              role="radiogroup"
              aria-label={t("purposeAriaLabel")}
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid var(--neutral-200)",
                borderRadius: 9,
                overflow: "hidden",
                backgroundColor: "var(--neutral-0)",
              }}
            >
              {FORM_PURPOSES.map((purpose, i) => (
                <RadioRow
                  key={purpose}
                  selected={purpose === formPurpose}
                  label={
                    purpose === "documentation"
                      ? t("purposeDocumentation")
                      : t("purposeInspection")
                  }
                  description={
                    purpose === "documentation"
                      ? t("purposeDocumentationHint")
                      : t("purposeInspectionHint")
                  }
                  onClick={() => pickPurpose(purpose)}
                  isFirst={i === 0}
                />
              ))}
            </div>
          </SetupSection>

          {/* Step 2 — category (inspection only) */}
          {formPurpose === "inspection" && (
          <SetupSection
            step={2}
            title={t("step1Question")}
          >
            <div
              role="radiogroup"
              aria-label={t("categoryAriaLabel")}
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid var(--neutral-200)",
                borderRadius: 9,
                overflow: "hidden",
                backgroundColor: "#fff",
              }}
            >
              {INSPECTION_CATEGORIES.map((c, i) => (
                <RadioRow
                  key={c}
                  selected={c === category}
                  label={INSPECTION_CATEGORY_LABELS[c]}
                  onClick={() => pickCategory(c)}
                  isFirst={i === 0}
                />
              ))}
            </div>
          </SetupSection>
          )}

          {/* Level — step 2 for documentation, step 3 for inspection */}
          {!gypcreteCategory ? (
          <SetupSection
            step={formPurpose === "inspection" ? 3 : 2}
            title={t("step2Question")}
          >
            <div
              role="radiogroup"
              aria-label={t("scopeLevelAriaLabel")}
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid var(--neutral-200)",
                borderRadius: 9,
                overflow: "hidden",
                backgroundColor: "#fff",
              }}
            >
              <RadioRow
                selected={level === "scope"}
                label={t("levelYes")}
                onClick={() => pickLevel("scope")}
                isFirst
              />
              <RadioRow
                selected={level === "unit"}
                label={t("levelNo")}
                onClick={() => pickLevel("unit")}
              />
              <RadioRow
                selected={level === "project"}
                label={t("levelProject")}
                onClick={() => pickLevel("project")}
              />
            </div>
          </SetupSection>
          ) : (
            <SetupSection step={formPurpose === "inspection" ? 3 : 2} title={t("step2Question")}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "var(--neutral-600)",
                  lineHeight: 1.45,
                }}
              >
                {t("gypcreteUnitLevelOnly")}
              </p>
            </SetupSection>
          )}

          {/* Scope types — step 3/4 */}
          {!gypcreteCategory && level === "scope" && (
            <SetupSection
              step={formPurpose === "inspection" ? 4 : 3}
              title={t("step3Question")}
            >
              {scopeTypeCodes.length > 0 && (
                <div
                  aria-label={t("selectedScopeTypesAriaLabel")}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    padding: "2px 0",
                  }}
                >
                  {scopeTypeCodes.map((code) => {
                    // Prefer the human name from the lookup, but fall
                    // back to the code itself while /api/lookups is
                    // loading — the chip is never blank.
                    const name =
                      scopeTypes.find((s) => s.code === code)?.displayName ?? code;
                    return (
                      <SelectedScopeChip
                        key={code}
                        label={name}
                        onRemove={() => toggleScopeCode(code)}
                      />
                    );
                  })}
                </div>
              )}
              {scopeTypesLoading ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "var(--neutral-500)",
                    fontStyle: "italic",
                  }}
                >
                  {t("loadingScopeTypes")}
                </p>
              ) : scopeTypesError ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "var(--error-600)",
                  }}
                >
                  {scopeTypesError}
                </p>
              ) : scopeTypes.length === 0 ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "var(--neutral-500)",
                    fontStyle: "italic",
                  }}
                >
                  {t("noScopeTypesDefined")}
                </p>
              ) : (
                <div
                  style={{
                    border: "1px solid var(--neutral-200)",
                    borderRadius: 9,
                    backgroundColor: "#fff",
                  }}
                >
                  {scopeTypes.map((s, i) => {
                    const selected = selectedCodeSet.has(s.code);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleScopeCode(s.code)}
                        aria-pressed={selected}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          padding: "10px 12px",
                          border: "none",
                          borderTop:
                            i === 0
                              ? "none"
                              : "1px solid var(--neutral-100)",
                          backgroundColor: selected
                            ? "var(--primary-50, #eff6ff)"
                            : "transparent",
                          color: "var(--neutral-800)",
                          fontSize: 13,
                          fontWeight: selected ? 600 : 500,
                          fontFamily: "inherit",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            border: selected
                              ? "1px solid var(--primary-600)"
                              : "1px solid var(--neutral-300)",
                            backgroundColor: selected
                              ? "var(--primary-600)"
                              : "#fff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {selected && (
                            <Check size={12} color="#fff" strokeWidth={3} />
                          )}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>{s.displayName}</span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--neutral-400)",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                            flexShrink: 0,
                          }}
                        >
                          {s.code}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </SetupSection>
          )}
        </div>

        {/* Footer — always visible at the bottom */}
        <div
          style={{
            borderTop: "1px solid var(--neutral-150)",
            padding: "12px 16px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            backgroundColor: "var(--neutral-50)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 14px",
              borderRadius: 8,
              border: "1px solid var(--neutral-250)",
              backgroundColor: "#fff",
              color: "var(--neutral-700)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={
              canSubmit
                ? undefined
                : level === "scope" && scopeTypeCodes.length === 0
                  ? t("pickAtLeastOneScope")
                  : t("answerQuestionsAbove")
            }
            style={{
              padding: "9px 16px",
              borderRadius: "var(--radius-md)",
              border: "none",
              backgroundColor: canSubmit
                ? "var(--color-accent)"
                : "var(--color-surface-sunken)",
              color: canSubmit ? "var(--color-text-inverse)" : "var(--color-text-disabled)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "var(--tracking-ui)",
              cursor: canSubmit ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            {mode === "create" ? t("startBuild") : tCommon("save")}
          </button>
        </div>
      </div>
      </FocusScope.Root>
    </div>,
    document.body,
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SetupSection({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: "50%",
            backgroundColor: "var(--neutral-100)",
            color: "var(--neutral-500)",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {step}
        </span>
        <h3
          style={{
            flex: 1,
            minWidth: 0,
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--neutral-900)",
            lineHeight: 1.35,
          }}
        >
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

/**
 * Single row in a radio list. Rendered as a full-width button so the
 * tap target is comfortable on mobile. The radio dot is purely
 * visual — semantics come from `role="radio"` on the button and
 * `role="radiogroup"` on the container.
 *
 * Rows share a single hairline divider between them (supplied via
 * `borderTop` on all but the first) so the list reads as one unit
 * rather than six floating pills.
 */
function RadioRow({
  selected,
  label,
  description,
  onClick,
  isFirst,
}: {
  selected: boolean;
  label: string;
  description?: string;
  onClick: () => void;
  isFirst?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: "100%",
        padding: "11px 12px",
        border: "none",
        borderTop: isFirst ? "none" : "1px solid var(--neutral-100)",
        backgroundColor: selected ? "var(--primary-50, #eff6ff)" : "#fff",
        color: "var(--neutral-900)",
        fontSize: 13,
        fontWeight: selected ? 600 : 500,
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        lineHeight: 1.35,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          marginTop: 1,
          borderRadius: "50%",
          border: selected
            ? "5px solid var(--primary-600)"
            : "1px solid var(--neutral-300)",
          backgroundColor: "#fff",
          flexShrink: 0,
          boxSizing: "border-box",
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block" }}>{label}</span>
        {description ? (
          <span
            style={{
              display: "block",
              marginTop: 2,
              fontSize: 12,
              fontWeight: 400,
              color: "var(--neutral-500)",
            }}
          >
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * Removable chip shown above the scope-type picker for each selected
 * scope. Primary-tinted so it reads as an active selection, with a
 * comfortable × tap target (minimum 22 px square) so it's easy to
 * dismiss on mobile without accidentally tapping adjacent chips.
 */
function SelectedScopeChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  const t = useTranslations("forms.setup");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        paddingLeft: 10,
        paddingRight: 4,
        paddingTop: 3,
        paddingBottom: 3,
        borderRadius: 99,
        backgroundColor: "var(--primary-50, #eff6ff)",
        border: "1px solid var(--primary-200, #bfdbfe)",
        color: "var(--primary-700, #1d4ed8)",
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.3,
        maxWidth: "100%",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("removeScopeType", { name: label })}
        title={t("removeScopeType", { name: label })}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          padding: 0,
          border: "none",
          borderRadius: "50%",
          backgroundColor: "transparent",
          color: "var(--primary-700, #1d4ed8)",
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
        }}
      >
        <X size={13} strokeWidth={2.5} aria-hidden />
      </button>
    </span>
  );
}

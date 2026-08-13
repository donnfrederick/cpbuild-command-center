"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Link2, Plus, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export interface UnlinkedScopeType {
  id: string;
  rawCode: string;
}

interface CanonicalScope {
  id: string;
  code: string;
  displayName: string;
}

interface ScopeLinkingModalProps {
  /** Scope types from the upload that have no canonical link. */
  unlinkedScopeTypes: UnlinkedScopeType[];
  /** Called after all links are successfully saved. */
  onComplete: () => void;
}

interface NewScopeForm {
  code: string;
  displayName: string;
}

type SelectionValue =
  | { kind: "canonical"; canonicalId: string }
  | { kind: "new" };

/**
 * Blocking modal that prompts the user to link each unrecognized scope type
 * (from a spreadsheet upload) to an official canonical scope — or create a new
 * canonical entry on the spot. The upload rows are already committed; this step
 * resolves the display and BI normalization before the user moves on.
 */
export function ScopeLinkingModal({ unlinkedScopeTypes, onComplete }: ScopeLinkingModalProps) {
  const t = useTranslations("scopeLinking");
  const [canonicalScopes, setCanonicalScopes] = useState<CanonicalScope[]>([]);
  const [loadingCanonical, setLoadingCanonical] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Per-row selections: scopeTypeId → selection
  const [selections, setSelections] = useState<Record<string, SelectionValue>>({});
  // Per-row "create new" form state: scopeTypeId → {code, displayName}
  const [newForms, setNewForms] = useState<Record<string, NewScopeForm>>({});

  const [submitting, setSubmitting] = useState(false);

  // Focus management — move focus into dialog on mount, restore on unmount
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      (previouslyFocusedRef.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  // Escape handler to call onComplete (skip/dismiss)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onComplete();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onComplete]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/canonical-scopes");
        if (!res.ok) throw new Error(t("loadError"));
        const data = await res.json() as { canonicalScopes: CanonicalScope[] };
        setCanonicalScopes(data.canonicalScopes);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : t("loadError"));
      } finally {
        setLoadingCanonical(false);
      }
    })();
  }, [t]);

  const setSelection = useCallback((scopeTypeId: string, value: SelectionValue) => {
    setSelections((prev) => ({ ...prev, [scopeTypeId]: value }));
  }, []);

  const updateNewForm = useCallback((scopeTypeId: string, field: keyof NewScopeForm, value: string) => {
    setNewForms((prev) => ({
      ...prev,
      [scopeTypeId]: { ...(prev[scopeTypeId] ?? { code: "", displayName: "" }), [field]: value },
    }));
  }, []);

  const allResolved = unlinkedScopeTypes.every((st) => {
    const sel = selections[st.id];
    if (!sel) return false;
    if (sel.kind === "canonical") return true;
    const form = newForms[st.id];
    return form?.code.trim().length >= 2 && form?.displayName.trim().length >= 1;
  });

  const handleSubmit = useCallback(async () => {
    if (!allResolved) return;
    setSubmitting(true);
    try {
      for (const st of unlinkedScopeTypes) {
        const sel = selections[st.id]!;

        let canonicalScopeTypeId: string;

        if (sel.kind === "new") {
          const form = newForms[st.id]!;
          const createRes = await fetch("/api/canonical-scopes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: form.code.trim().toUpperCase(), displayName: form.displayName.trim() }),
          });
          if (!createRes.ok) {
            const err = await createRes.json().catch(() => ({})) as { error?: string };
            throw new Error(err.error ?? t("addError"));
          }
          const created = await createRes.json() as { canonicalScope: { id: string; code: string } };
          toast.success(t("addSuccess", { code: created.canonicalScope.code }));
          canonicalScopeTypeId = created.canonicalScope.id;
        } else {
          canonicalScopeTypeId = sel.canonicalId;
        }

        const linkRes = await fetch(`/api/scope-types/${st.id}/link`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canonicalScopeTypeId }),
        });
        if (!linkRes.ok) {
          const err = await linkRes.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error ?? t("confirmError", { raw: st.rawCode }));
        }
      }

      onComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("confirmError", { raw: "" }));
    } finally {
      setSubmitting(false);
    }
  }, [allResolved, unlinkedScopeTypes, selections, newForms, onComplete, t]);

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.5))", zIndex: 60 }}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        tabIndex={-1}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 70,
          width: "min(600px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 64px)",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--neutral-0)",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "var(--shadow-2)",
          overflow: "hidden",
          outline: "none",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--neutral-200)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Link2 style={{ width: 18, height: 18, color: "var(--primary-600)", flexShrink: 0 }} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--neutral-900)" }}>
              {t("title")}
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-500)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--neutral-700)" }}>
              {t("description", { count: unlinkedScopeTypes.length })}
            </strong>
          </p>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {loadingCanonical ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "32px 0", color: "var(--neutral-500)", fontSize: 14 }}>
              <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} />
              {t("selectPlaceholder")}
            </div>
          ) : loadError ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "32px 0", color: "var(--error-600)", fontSize: 14 }}>
              <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
              {loadError}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {unlinkedScopeTypes.map((st) => {
                const sel = selections[st.id];
                const isNew = sel?.kind === "new";
                const form = newForms[st.id] ?? { code: "", displayName: "" };

                return (
                  <div
                    key={st.id}
                    style={{
                      border: "1px solid var(--neutral-200)",
                      borderRadius: "var(--radius-sm, 6px)",
                      padding: "12px 14px",
                      backgroundColor: "var(--neutral-50)",
                    }}
                  >
                    {/* Raw code label */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: "var(--neutral-500)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        From spreadsheet
                      </span>
                      <code style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-800)", backgroundColor: "var(--neutral-100)", padding: "2px 6px", borderRadius: 4 }}>
                        {st.rawCode}
                      </code>
                    </div>

                    {/* Canonical dropdown */}
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--neutral-600)", marginBottom: 5 }}>
                      {t("linkTo", { raw: st.rawCode })}
                    </label>
                    <select
                      value={isNew ? "__new__" : (sel?.kind === "canonical" ? sel.canonicalId : "")}
                      onChange={(e) => {
                        if (e.target.value === "__new__") {
                          setSelection(st.id, { kind: "new" });
                        } else if (e.target.value) {
                          setSelection(st.id, { kind: "canonical", canonicalId: e.target.value });
                        } else {
                          setSelections((prev) => {
                            const next = { ...prev };
                            delete next[st.id];
                            return next;
                          });
                        }
                      }}
                      style={{
                        width: "100%",
                        height: 36,
                        padding: "0 10px",
                        border: "1px solid var(--neutral-300)",
                        borderRadius: "var(--radius-sm, 6px)",
                        backgroundColor: "var(--neutral-0)",
                        color: "var(--neutral-900)",
                        fontSize: 13,
                        outline: "none",
                      }}
                    >
                      <option value="">{t("selectPlaceholder")}</option>
                      {canonicalScopes.map((cs) => (
                        <option key={cs.id} value={cs.id}>
                          {cs.code} — {cs.displayName}
                        </option>
                      ))}
                      <option value="__new__">{t("createNew")}</option>
                    </select>

                    {/* Inline create form */}
                    {isNew && (
                      <div style={{ marginTop: 10, padding: "10px 12px", backgroundColor: "var(--primary-50)", borderRadius: "var(--radius-sm, 6px)", border: "1px solid var(--primary-200)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                          <Plus style={{ width: 13, height: 13, color: "var(--primary-600)" }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--primary-700)" }}>{t("createNewTitle")}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 8 }}>
                          <div>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--neutral-600)", marginBottom: 4 }}>
                              {t("codeLabel")}
                            </label>
                            <input
                              type="text"
                              maxLength={6}
                              placeholder={t("codePlaceholder")}
                              value={form.code}
                              onChange={(e) => updateNewForm(st.id, "code", e.target.value.toUpperCase())}
                              style={{ width: "100%", height: 32, padding: "0 8px", border: "1px solid var(--primary-300)", borderRadius: "var(--radius-sm, 6px)", backgroundColor: "var(--neutral-0)", fontSize: 13, boxSizing: "border-box", outline: "none", fontFamily: "monospace" }}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--neutral-600)", marginBottom: 4 }}>
                              {t("displayNameLabel")}
                            </label>
                            <input
                              type="text"
                              maxLength={100}
                              placeholder={t("displayNamePlaceholder")}
                              value={form.displayName}
                              onChange={(e) => updateNewForm(st.id, "displayName", e.target.value)}
                              style={{ width: "100%", height: 32, padding: "0 8px", border: "1px solid var(--primary-300)", borderRadius: "var(--radius-sm, 6px)", backgroundColor: "var(--neutral-0)", fontSize: 13, boxSizing: "border-box", outline: "none" }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--neutral-200)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
            backgroundColor: "var(--neutral-0)",
          }}
        >
          <button
            onClick={onComplete}
            style={{
              background: "none",
              border: "none",
              fontSize: 12,
              color: "var(--neutral-500)",
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            {t("dismiss")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!allResolved || submitting || loadingCanonical}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 36,
              padding: "0 16px",
              backgroundColor: allResolved && !submitting ? "var(--primary-600)" : "var(--neutral-200)",
              color: allResolved && !submitting ? "var(--neutral-0)" : "var(--neutral-400)",
              border: "none",
              borderRadius: "var(--radius-sm, 6px)",
              fontSize: 13,
              fontWeight: 600,
              cursor: allResolved && !submitting ? "pointer" : "not-allowed",
              transition: "background-color 0.15s",
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                {t("confirming")}
              </>
            ) : (
              <>
                <Link2 style={{ width: 14, height: 14 }} />
                {t("confirmButton")}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

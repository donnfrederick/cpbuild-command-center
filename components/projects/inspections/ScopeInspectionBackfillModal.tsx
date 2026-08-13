"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import type { ScopeRow } from "@/components/projects/UnitCards";
import { InspectionBottomSheet } from "@/components/projects/inspections/inspectionSheetPrimitive";
import {
  backfill,
  clearBackfill,
  type InspectionSubmission,
} from "@/lib/inspections/submissionsApi";

export function BackfillModal({
  scope,
  projectId,
  unitId,
  existingBackfill,
  onSuccess,
  onCleared,
  onStartNewInspection,
  onClose,
}: {
  scope: ScopeRow;
  projectId: string;
  unitId: string;
  existingBackfill: InspectionSubmission | null;
  onSuccess: (outcome: "PASS" | "FAIL") => void;
  onCleared: () => void;
  onStartNewInspection: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("inspections");

  const scopeDisplay =
    scope.scopeType?.canonicalScopeType?.displayName ??
    scope.scopeType?.name ??
    "this scope";

  const initialOutcome: "PASS" | "FAIL" = existingBackfill?.outcome === "FAIL" ? "FAIL" : "PASS";
  const initialNote = typeof existingBackfill?.payload?.note === "string"
    ? existingBackfill.payload.note
    : "";

  const [outcome, setOutcome] = useState<"PASS" | "FAIL">(initialOutcome);
  const [note, setNote] = useState(initialNote);
  const [loading, setLoading] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanged = !existingBackfill ||
    outcome !== initialOutcome ||
    note.trim() !== initialNote.trim();

  const handleSubmit = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await backfill(projectId, scope.id, {
        outcome,
        note: note.trim() || undefined,
        scopeTypeCode:
          scope.scopeType?.canonicalScopeType?.code ??
          scope.scopeType?.code ??
          undefined,
        unitId,
      });
      onSuccess(outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("procoreBackfillSaveError"));
      setLoading(false);
    }
  }, [loading, outcome, note, projectId, scope, unitId, onSuccess, t]);

  const handleClear = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await clearBackfill(projectId, scope.id, unitId);
      onCleared();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("procoreBackfillSaveError"));
      setLoading(false);
      setClearConfirm(false);
    }
  }, [loading, projectId, scope.id, unitId, onCleared, t]);

  const title = existingBackfill
    ? t("procoreBackfillTitleEdit")
    : t("procoreBackfillTitleSet");
  const subtitle = existingBackfill
    ? t("procoreBackfillSubtitleEdit", { scope: scopeDisplay })
    : t("procoreBackfillSubtitleSet", { scope: scopeDisplay });

  return (
    <InspectionBottomSheet title={title} subtitle={subtitle} onClose={onClose}>
      <div style={{ padding: "20px 20px 8px" }}>
        <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
          {t("procoreBackfillResultLabel")}
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["PASS", "FAIL"] as const).map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={outcome === o}
              onClick={() => setOutcome(o)}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 8,
                border: `2px solid ${outcome === o
                  ? (o === "PASS" ? "var(--success-500)" : "var(--error-500)")
                  : "var(--neutral-200)"}`,
                backgroundColor: outcome === o
                  ? (o === "PASS" ? "var(--success-50)" : "var(--error-50)")
                  : "var(--neutral-0)",
                color: outcome === o
                  ? (o === "PASS" ? "var(--success-700)" : "var(--error-700)")
                  : "var(--neutral-400)",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.06em",
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "all 0.14s ease",
              }}
            >
              {o}
            </button>
          ))}
        </div>

        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
          {t("procoreBackfillNoteLabel")}{" "}
          <span style={{ fontWeight: 400, color: "var(--neutral-400)" }}>
            {t("procoreBackfillNoteOptional")}
          </span>
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("procoreBackfillNotePlaceholder")}
          aria-label={t("procoreBackfillNoteLabel")}
          rows={3}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--neutral-200)",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "inherit",
            color: "var(--neutral-900)",
            resize: "vertical",
            boxSizing: "border-box",
            outline: "none",
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        />

        {error && (
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--error-600)" }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !hasChanged}
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 8,
            border: "none",
            backgroundColor: "var(--neutral-900)",
            color: "var(--neutral-0)",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: (loading || !hasChanged) ? "not-allowed" : "pointer",
            opacity: (loading || !hasChanged) ? 0.35 : 1,
            marginBottom: 8,
            transition: "opacity 0.15s ease",
          }}
        >
          {loading && !clearConfirm
            ? t("procoreBackfillSaving")
            : existingBackfill
              ? t("procoreBackfillUpdate")
              : t("procoreBackfillSave")}
        </button>

        {existingBackfill && (
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--neutral-400)", textAlign: "center" }}>
            {t("procoreBackfillPreviouslySaved", {
              outcome: existingBackfill.outcome === "PASS" ? "PASS" : "FAIL",
            })}
          </p>
        )}

        {existingBackfill && (
          <div style={{ marginTop: 14 }}>
            {!clearConfirm ? (
              <button
                type="button"
                onClick={() => setClearConfirm(true)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  borderRadius: 8,
                  border: "1.5px solid var(--neutral-250, var(--neutral-200))",
                  backgroundColor: "var(--neutral-0)",
                  color: "var(--neutral-600)",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {t("procoreBackfillClear")}
              </button>
            ) : (
              <div
                style={{
                  padding: "12px",
                  borderRadius: 8,
                  border: "1px solid var(--neutral-200)",
                  backgroundColor: "var(--neutral-50)",
                }}
              >
                <p
                  style={{
                    margin: "0 0 10px",
                    fontSize: 12,
                    color: "var(--neutral-600)",
                    lineHeight: 1.45,
                    textAlign: "center",
                  }}
                >
                  {t("procoreBackfillClearConfirm")}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setClearConfirm(false)}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: 8,
                      border: "1px solid var(--neutral-200)",
                      backgroundColor: "var(--neutral-0)",
                      color: "var(--neutral-700)",
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    {t("procoreBackfillClearCancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: 8,
                      border: "none",
                      backgroundColor: "var(--error-600)",
                      color: "var(--neutral-0)",
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading ? 0.7 : 1,
                    }}
                  >
                    {loading ? t("procoreBackfillClearing") : t("procoreBackfillClearConfirmAction")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ margin: "20px 0 16px", borderTop: "1px solid var(--neutral-200)" }} />

        <button
          type="button"
          onClick={onStartNewInspection}
          disabled={loading}
          style={{
            width: "100%",
            padding: "11px 0",
            borderRadius: 8,
            border: "1.5px solid var(--primary-300)",
            backgroundColor: "var(--primary-50)",
            color: "var(--primary-700)",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}
        >
          {t("procoreBackfillOverride")}
        </button>
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--neutral-400)", textAlign: "center", lineHeight: 1.5 }}>
          {t("procoreBackfillOverrideHelp")}
        </p>
      </div>
    </InspectionBottomSheet>
  );
}

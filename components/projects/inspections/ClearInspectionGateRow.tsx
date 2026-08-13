"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FormTemplate } from "@/components/forms/formTypes";
import type { StoredForm } from "@/lib/forms/formsApi";
import type { ScopeRow } from "@/components/projects/UnitCards";
import { SubcontractorPicker } from "@/components/projects/SubcontractorPicker";

/**
 * Clear inspection prep card — install-complete + subcontractor assignment
 * before opening the form. Subcontractor picker stays visible after assignment
 * so the user can change it until they start the inspection.
 */
export function ClearInspectionGateRow({
  template,
  stored,
  scope,
  isInstallComplete,
  patchScopeRow,
  resumeDraftForm,
  onStartInspection,
}: {
  template: FormTemplate;
  stored: StoredForm;
  scope: ScopeRow;
  isInstallComplete: boolean;
  patchScopeRow?: (updates: Partial<ScopeRow>) => Promise<boolean>;
  resumeDraftForm?: StoredForm | null;
  onStartInspection: (form: StoredForm) => void;
}) {
  const t = useTranslations("inspections");
  const tUnits = useTranslations("units");
  const [busy, setBusy] = useState(false);
  const [subcontractorBusy, setSubcontractorBusy] = useState(false);
  const [subcontractorError, setSubcontractorError] = useState<string | null>(null);
  const [selectedSubcontractorId, setSelectedSubcontractorId] = useState<string | null>(
    scope.unifierSubId ?? null,
  );
  /** Sub id successfully PATCHed via the picker this session — skip redundant CTA sub PATCH. */
  const pickerAssignedSubIdRef = useRef<string | null>(null);

  useEffect(() => {
    setSelectedSubcontractorId(scope.unifierSubId ?? null);
    if (scope.unifierSubId && scope.unifierSubId === pickerAssignedSubIdRef.current) {
      pickerAssignedSubIdRef.current = null;
    }
  }, [scope.unifierSubId]);

  async function handleSubcontractorChange(id: string | null, displayName?: string | null) {
    if (!patchScopeRow || subcontractorBusy || id === selectedSubcontractorId) return;
    const previous = selectedSubcontractorId;
    setSubcontractorError(null);
    setSubcontractorBusy(true);
    try {
      const ok = await patchScopeRow({ unifierSubId: id });
      if (!ok) throw new Error("Failed to assign subcontractor.");
      setSelectedSubcontractorId(id);
      if (id !== null) {
        pickerAssignedSubIdRef.current = id;
      } else {
        pickerAssignedSubIdRef.current = null;
      }
      if (id === null) {
        toast.success(tUnits("subcontractorClearedToast"));
      } else {
        toast.success(
          tUnits("subcontractorSavedToast", {
            name: displayName?.trim() || tUnits("subcontractorLabel"),
          }),
        );
      }
    } catch {
      setSelectedSubcontractorId(previous);
      setSubcontractorError(t("clearInspectionSubcontractorSaveFailed"));
    } finally {
      setSubcontractorBusy(false);
    }
  }

  async function handleMarkInstallCompleteAndStart() {
    if (!patchScopeRow || busy || !selectedSubcontractorId) return;
    setBusy(true);
    try {
      const scopeMissingSelectedSub =
        !scope.unifierSubId || scope.unifierSubId !== selectedSubcontractorId;
      const subAlreadySavedViaPicker =
        pickerAssignedSubIdRef.current === selectedSubcontractorId;
      if (scopeMissingSelectedSub && !subAlreadySavedViaPicker) {
        const subOk = await patchScopeRow({ unifierSubId: selectedSubcontractorId });
        if (!subOk) return;
      }

      if (!isInstallComplete) {
        const ok = await patchScopeRow({
          scopeStage: "INSTALL",
          scopeStatus: "COMPLETE",
        });
        if (!ok) return;
      }

      const { flushMutationQueue } = await import("@/lib/offline/mutation-queue");
      await flushMutationQueue();

      onStartInspection(stored);
    } finally {
      setBusy(false);
    }
  }

  const showCta = Boolean(patchScopeRow);
  const needsSubcontractor = !selectedSubcontractorId;
  const requirementText = [
    !isInstallComplete ? t("clearInspectionGateRequiresInstallComplete") : null,
    needsSubcontractor ? t("clearInspectionGateRequiresSubcontractor") : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      style={{
        position: "relative",
        padding: "12px",
        borderRadius: 8,
        border: "1px solid var(--neutral-150)",
        backgroundColor: "var(--neutral-50)",
      }}
    >
      {(busy || subcontractorBusy) && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.35))",
            zIndex: 2,
          }}
        >
          <Loader2 size={22} className="animate-spin" style={{ color: "var(--neutral-0)" }} />
        </div>
      )}
      {resumeDraftForm && (
        <button
          type="button"
          onClick={() => onStartInspection(resumeDraftForm)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "10px 12px",
            marginBottom: 10,
            borderRadius: 8,
            border: "1px solid var(--primary-300)",
            backgroundColor: "var(--primary-50)",
            color: "var(--primary-800)",
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {t("resumeDraftCta")}
        </button>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: patchScopeRow ? 10 : showCta ? 10 : 0,
          opacity: 0.85,
        }}
      >
        <Lock
          size={14}
          aria-hidden
          style={{ color: "var(--neutral-400)", flexShrink: 0, marginTop: 2 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.3,
              color: "var(--neutral-500)",
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {template.name.trim() || t("untitledForm")}
          </span>
          {requirementText && (
            <span
              style={{
                fontSize: 11,
                color: "var(--neutral-400)",
                display: "block",
                marginTop: 4,
                lineHeight: 1.35,
              }}
            >
              {requirementText}
            </span>
          )}
        </div>
      </div>
      {patchScopeRow && (
        <div style={{ marginBottom: showCta ? 10 : 0 }}>
          <div
            style={{
              marginBottom: 6,
              fontSize: 11,
              fontWeight: 700,
              color: needsSubcontractor ? "var(--error-600)" : "var(--neutral-500)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {needsSubcontractor
              ? t("clearInspectionSubcontractorRequired")
              : tUnits("subcontractorLabel")}
          </div>
          <SubcontractorPicker
            value={selectedSubcontractorId}
            readOnly={false}
            disabled={busy || subcontractorBusy}
            saving={subcontractorBusy}
            fullWidth
            onChange={(id, displayName) => void handleSubcontractorChange(id, displayName)}
          />
          {subcontractorError && (
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--error-600)" }}>
              {subcontractorError}
            </p>
          )}
        </div>
      )}
      {showCta && (
        <button
          type="button"
          disabled={busy || subcontractorBusy || needsSubcontractor}
          onClick={() => void handleMarkInstallCompleteAndStart()}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "none",
            backgroundColor: needsSubcontractor ? "var(--neutral-300)" : "var(--primary-600)",
            color: "var(--neutral-0)",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor:
              busy || subcontractorBusy
                ? "wait"
                : needsSubcontractor
                  ? "not-allowed"
                  : "pointer",
            opacity: busy ? 0.85 : 1,
          }}
        >
          {busy
            ? t("clearInspectionMarkInstallBusy")
            : isInstallComplete
              ? t("clearInspectionStartCta")
              : t("clearInspectionMarkInstallCta")}
        </button>
      )}
    </div>
  );
}

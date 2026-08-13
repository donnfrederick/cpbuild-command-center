"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, Layers } from "lucide-react";
import type { ScopeRow } from "@/components/projects/UnitCards";
import { BackfillModal } from "@/components/projects/inspections/ScopeInspectionBackfillModal";
import { scopeShowProcoreBackfillMenu } from "@/lib/inspections/scope-inspection-display";
import {
  listByProject,
  type InspectionSubmission,
} from "@/lib/inspections/submissionsApi";
import { INSPECTION_SHEET_CSS } from "./inspectionSheetPrimitive";
import { createPortal } from "react-dom";

interface ScopeProcoreState {
  scope: ScopeRow;
  submissions: InspectionSubmission[];
}

export function ProcoreBackfillScopeSheet({
  scopes,
  projectId,
  unitId,
  onClose,
  onUpdated,
}: {
  scopes: ScopeRow[];
  projectId: string;
  unitId: string;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const t = useTranslations("inspections");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState<ScopeProcoreState[]>([]);
  const [activeScope, setActiveScope] = useState<ScopeProcoreState | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const scopeIds = new Set(scopes.map((scope) => scope.id));
      try {
        const projectSubmissions = await listByProject(projectId);
        if (cancelled || !mountedRef.current) return;
        const byScopeId = new Map<string, InspectionSubmission[]>();
        for (const sub of projectSubmissions) {
          if (!sub.scopeRowId || !scopeIds.has(sub.scopeRowId)) continue;
          const list = byScopeId.get(sub.scopeRowId) ?? [];
          list.push(sub);
          byScopeId.set(sub.scopeRowId, list);
        }
        const results = scopes.map((scope) => ({
          scope,
          submissions: byScopeId.get(scope.id) ?? [],
        }));
        const filtered = results.filter(({ submissions }) =>
          scopeShowProcoreBackfillMenu(submissions, true),
        );
        setEligible(filtered);
        if (filtered.length === 1) {
          setActiveScope(filtered[0]);
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          setEligible([]);
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopes, projectId]);

  if (typeof document === "undefined") return null;

  if (activeScope) {
    const existingBackfill =
      activeScope.submissions.find((s) => s.source === "BACKFILL") ?? null;
    return (
      <BackfillModal
        scope={activeScope.scope}
        projectId={projectId}
        unitId={unitId}
        existingBackfill={existingBackfill}
        onSuccess={() => {
          setActiveScope(null);
          onUpdated?.();
          finishClose();
        }}
        onCleared={() => {
          setActiveScope(null);
          onUpdated?.();
          finishClose();
        }}
        onStartNewInspection={() => {
          setActiveScope(null);
          finishClose();
        }}
        onClose={() => setActiveScope(null)}
      />
    );
  }

  return createPortal(
    <>
      <style>{INSPECTION_SHEET_CSS}</style>
      <div
        role="presentation"
        className="ibs-backdrop"
        style={{ backgroundColor: visible ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)" }}
        onClick={(e) => {
          if (e.target === e.currentTarget) finishClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("procoreScopePickerTitle")}
          className={`ibs-sheet${visible ? " ibs-visible" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ibs-handle" aria-hidden />
          <div
            style={{
              padding: "12px 16px 12px",
              borderBottom: "1px solid var(--neutral-150, #ebebeb)",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--neutral-900)" }}>
              {t("procoreScopePickerTitle")}
            </div>
            <div style={{ fontSize: 13, color: "var(--neutral-500)", marginTop: 2 }}>
              {t("procoreScopePickerSubtitle")}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))",
            }}
          >
            {loading ? (
              <p style={{ margin: "16px", fontSize: 13, color: "var(--neutral-500)" }}>
                {t("procoreScopePickerLoading")}
              </p>
            ) : eligible.length === 0 ? (
              <p
                style={{
                  margin: "16px",
                  fontSize: 13,
                  color: "var(--neutral-500)",
                  fontStyle: "italic",
                  lineHeight: 1.45,
                }}
              >
                {t("procoreNoEligibleScopes")}
              </p>
            ) : (
              <div style={{ padding: "8px 0" }}>
                {eligible.map(({ scope, submissions }) => {
                  const typeName =
                    scope.scopeType?.canonicalScopeType?.displayName ??
                    scope.scopeType?.name ??
                    scope.description ??
                    t("unknownScope");
                  const hasBackfill = submissions.some((s) => s.source === "BACKFILL");
                  return (
                    <button
                      key={scope.id}
                      type="button"
                      onClick={() => setActiveScope({ scope, submissions })}
                      style={{
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
                      }}
                    >
                      <Layers
                        size={18}
                        aria-hidden
                        style={{ color: "var(--neutral-400)", flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
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
                        {hasBackfill && (
                          <div style={{ fontSize: 11, color: "var(--neutral-500)", marginTop: 1 }}>
                            {t("procoreEditInspectionButton")}
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
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

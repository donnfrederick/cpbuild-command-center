"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Split, Settings2, Plus, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SubScopeGroup } from "@/lib/sub-scopes";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SubScopeEntrySheetProps {
  projectId: string;
  onManage: () => void;
  onCreate: () => void;
  onClose: () => void;
}

// ── Sheet animation CSS (mobile: slide from bottom; desktop ≥768px: slide from right) ──

const SHEET_CSS = `
  .sse-backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: flex-end; justify-content: center; background: rgba(0,0,0,0); transition: background-color 0.26s ease; }
  .sse-backdrop.sse-visible { background: rgba(0,0,0,0.45); }
  .sse-sheet { width: 100%; max-width: 520px; background: var(--neutral-0); border-radius: 16px 16px 0 0; box-shadow: 0 -4px 32px rgba(0,0,0,0.16); overflow: hidden; transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); }
  .sse-sheet.sse-visible { transform: translateY(0); }
  .sse-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 0; }
  @media (min-width: 768px) {
    .sse-backdrop { align-items: stretch; justify-content: flex-end; }
    .sse-sheet { width: min(420px, 100vw); max-width: none; height: 100%; border-radius: 0; transform: translateX(105%); box-shadow: -4px 0 32px rgba(0,0,0,0.16); }
    .sse-sheet.sse-visible { transform: translateX(0); }
    .sse-handle { display: none; }
    .sse-spacer { display: none; }
  }
`;

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * A small bottom-sheet "menu" that appears when the Split toolbar button is tapped.
 * Fetches the existing sub-scope group count so it can label the Manage option.
 * Two choices:
 *   - Manage configured sub-scopes (disabled + muted if none exist)
 *   - Create new configuration (always active → opens SubScopesModal)
 */
export function SubScopeEntrySheet({
  projectId,
  onManage,
  onCreate,
  onClose,
}: SubScopeEntrySheetProps) {
  const t = useTranslations("units");
  const [groups, setGroups] = useState<SubScopeGroup[] | null>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(raf);
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/sub-scopes`)
      .then((r) => r.json())
      .then((d: { subScopes?: SubScopeGroup[] }) => setGroups(d.subScopes ?? []))
      .catch(() => setGroups([]));
  }, [projectId]);

  function handleClose() {
    setVisible(false);
    closeTimerRef.current = setTimeout(onClose, 320);
  }

  const hasGroups = (groups?.length ?? 0) > 0;

  if (!mounted) return null;

  const sheet = (
    <>
      <style>{SHEET_CSS}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("subScopesEntrySheetTitle")}
        className={`sse-backdrop${visible ? " sse-visible" : ""}`}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        onKeyDown={(e) => { if (e.key === "Escape") handleClose(); }}
      >
        {/* Drag handle — mobile only */}
        <div className="sse-handle" aria-hidden="true" />

        <div
          className={`sse-sheet${visible ? " sse-visible" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "18px 20px 14px",
              borderBottom: "1px solid var(--neutral-150)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  backgroundColor: "var(--primary-50)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Split size={15} style={{ color: "var(--primary-600)" }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--neutral-900)" }}>
                {t("subScopesEntrySheetTitle")}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label={t("subScopesEntrySheetClose")}
              style={{
                width: 32,
                height: 32,
                border: "none",
                borderRadius: 8,
                backgroundColor: "transparent",
                color: "var(--neutral-500)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Options */}
          <div style={{ padding: "8px 0 16px" }}>
            {/* Add new sub-scope (top option) */}
            <button
              type="button"
              onClick={onCreate}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "18px 20px",
                border: "none",
                backgroundColor: "transparent",
                color: "var(--neutral-900)",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--neutral-50)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: "var(--success-50)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Plus size={18} style={{ color: "var(--success-600)" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>
                  {t("subScopesEntryCreate")}
                </div>
                <div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 2 }}>
                  {t("subScopesEntryCreateDesc")}
                </div>
              </div>
              <ChevronRight size={18} style={{ color: "var(--neutral-400)", flexShrink: 0 }} />
            </button>

            {/* Divider */}
            <div style={{ height: 1, margin: "0 20px", backgroundColor: "var(--neutral-100)" }} />

            {/* Manage existing (bottom option) */}
            <button
              type="button"
              onClick={hasGroups ? onManage : undefined}
              disabled={!hasGroups}
              aria-disabled={!hasGroups}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "18px 20px",
                border: "none",
                backgroundColor: "transparent",
                color: hasGroups ? "var(--neutral-900)" : "var(--neutral-350)",
                cursor: hasGroups ? "pointer" : "default",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                if (hasGroups) e.currentTarget.style.backgroundColor = "var(--neutral-50)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: hasGroups ? "var(--primary-50)" : "var(--neutral-100)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Settings2
                  size={18}
                  style={{ color: hasGroups ? "var(--primary-600)" : "var(--neutral-350)" }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>
                  {t("subScopesEntryManage")}
                </div>
                <div style={{ fontSize: 12, color: hasGroups ? "var(--neutral-500)" : "var(--neutral-350)", marginTop: 2 }}>
                  {groups === null
                    ? t("subScopesEntryLoading")
                    : hasGroups
                    ? t("subScopesEntryGroupCount", { count: groups.length })
                    : t("subScopesEntryNoneYet")}
                </div>
              </div>
              {hasGroups && (
                <ChevronRight size={18} style={{ color: "var(--neutral-400)", flexShrink: 0 }} />
              )}
            </button>
          </div>

          {/* Safe-area spacer — mobile only (full-height panel on desktop doesn't need it) */}
          <div style={{ height: "max(env(safe-area-inset-bottom, 0px), 48px)" }} className="sse-spacer" />
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}

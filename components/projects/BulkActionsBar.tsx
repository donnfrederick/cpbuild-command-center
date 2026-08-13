"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

interface BulkActionsBarProps {
  selectedCount: number;
  totalFilteredCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onCancel: () => void;
  /** Called when the Actions menu button is tapped — opens the BulkActionsSheet. */
  onActionsOpen: () => void;
  /** True = fixed bottom bar via portal (mobile). False = inline in toolbar (desktop). */
  mobile: boolean;
}

/** Visual checkbox + label used for the "Select all / Deselect all" toggle. */
function SelectAllCheckbox({
  allSelected,
  totalFilteredCount,
  onSelectAll,
  onDeselectAll,
  dark,
}: {
  allSelected: boolean;
  totalFilteredCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  dark?: boolean;
}) {
  const t = useTranslations("units");

  const checkboxSize = 20;
  const primaryBlue = "var(--color-accent)";
  const borderColor = dark ? "rgba(255,255,255,0.4)" : "var(--neutral-400)";
  const checkedBg = primaryBlue;
  const labelColor = dark ? "var(--neutral-0)" : "var(--neutral-700)";

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={allSelected}
      onClick={allSelected ? onDeselectAll : onSelectAll}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      {/* Visual checkbox */}
      <span
        aria-hidden
        style={{
          width: checkboxSize,
          height: checkboxSize,
          borderRadius: 5,
          border: allSelected ? "none" : `1.5px solid ${borderColor}`,
          backgroundColor: allSelected ? checkedBg : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "background-color 0.12s, border-color 0.12s",
        }}
      >
        {allSelected && (
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
            <polyline
              points="1.5,5.5 4.5,8.5 9.5,2.5"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {/* Label */}
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: labelColor,
          whiteSpace: "nowrap",
        }}
      >
        {t("selectAll", { count: totalFilteredCount })}
      </span>
    </button>
  );
}

function BulkActionsBarInner({
  selectedCount,
  totalFilteredCount,
  onSelectAll,
  onDeselectAll,
  onCancel,
  onActionsOpen,
  mobile,
}: BulkActionsBarProps) {
  const t = useTranslations("units");
  const allSelected = totalFilteredCount > 0 && selectedCount >= totalFilteredCount;

  if (mobile) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 400,
          backgroundColor: "var(--unit-detail-header-bg)",
          color: "var(--neutral-0)",
          boxShadow: "0 -2px 20px rgba(0,0,0,0.35)",
        }}
      >
        {/* Top row: select-all checkbox | count | X */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px var(--page-padding-x) 10px",
          }}
        >
          <SelectAllCheckbox
            allSelected={allSelected}
            totalFilteredCount={totalFilteredCount}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
            dark
          />

          <span
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--neutral-0)",
              whiteSpace: "nowrap",
            }}
          >
            {t("selectedCount", { count: selectedCount })}
          </span>

          <button
            type="button"
            onClick={onCancel}
            aria-label={t("exitSelectMode")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "var(--radius-sm)",
              border: "none",
              backgroundColor: "transparent",
              color: "var(--neutral-300)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {/* Actions row */}
        <div
          style={{
            padding: "12px var(--page-padding-x) calc(env(safe-area-inset-bottom) + 72px)",
            borderTop: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={onActionsOpen}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              width: "100%",
              minHeight: 56,
              borderRadius: "var(--radius-lg)",
              border: "none",
              backgroundColor: selectedCount === 0 ? "rgba(255,255,255,0.10)" : "var(--color-accent)",
              color: selectedCount === 0 ? "rgba(255,255,255,0.36)" : "var(--color-text-inverse)",
              fontSize: "var(--text-subheading)",
              fontWeight: "var(--font-weight-black)",
              cursor: selectedCount === 0 ? "not-allowed" : "pointer",
              transition: "background-color 0.15s, border-color 0.15s, color 0.15s",
            }}
          >
            {t("bulkActionsPlaceholder")}
            <ChevronDown size={14} aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  // Desktop: inline inside the toolbar row
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        aria-label={t("exitSelectMode")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "0 12px",
          height: 36,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--neutral-300)",
          backgroundColor: "var(--neutral-0)",
          color: "var(--neutral-700)",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <X size={14} aria-hidden />
        {t("exitSelectMode")}
      </button>

      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--neutral-900)",
          whiteSpace: "nowrap",
          marginLeft: 4,
        }}
      >
        {t("selectedCount", { count: selectedCount })}
      </span>

      <SelectAllCheckbox
        allSelected={allSelected}
        totalFilteredCount={totalFilteredCount}
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
      />

      <div style={{ flex: 1 }} />

      <button
        type="button"
        disabled={selectedCount === 0}
        onClick={onActionsOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "0 14px",
          height: 44,
          borderRadius: "var(--radius-md)",
          border: "none",
          backgroundColor: selectedCount === 0 ? "var(--control-bg)" : "var(--color-accent)",
          color: selectedCount === 0 ? "var(--color-text-disabled)" : "var(--color-text-inverse)",
          fontSize: "var(--text-body)",
          fontWeight: "var(--font-weight-black)",
          cursor: selectedCount === 0 ? "not-allowed" : "pointer",
          flexShrink: 0,
          transition: "background-color 0.15s, border-color 0.15s, color 0.15s",
        }}
      >
        {t("bulkActionsPlaceholder")}
        <ChevronDown size={14} aria-hidden />
      </button>
    </>
  );
}

export function BulkActionsBar(props: BulkActionsBarProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  if (props.mobile) {
    if (!mounted) return null;
    return createPortal(<BulkActionsBarInner {...props} />, document.body);
  }

  return <BulkActionsBarInner {...props} />;
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckSquare, FileDown, X } from "lucide-react";
import { useTranslations } from "next-intl";

export interface FieldLogExportSelectionBarProps {
  selectedCount: number;
  totalVisible: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onExport: () => void;
  onCancel: () => void;
  exporting: boolean;
  mobile: boolean;
  exportButtonLabel: string;
  exportAriaLabel: string;
  /** Optional row above export actions (e.g. failed-items-only toggle). */
  exportOption?: ReactNode;
}

function FieldLogExportSelectionBarInner({
  selectedCount,
  totalVisible,
  onSelectAll,
  onDeselectAll,
  onExport,
  onCancel,
  exporting,
  mobile,
  exportButtonLabel,
  exportAriaLabel,
  exportOption,
}: FieldLogExportSelectionBarProps) {
  const t = useTranslations("units");
  const allSelected = totalVisible > 0 && selectedCount >= totalVisible;

  return (
    <div
      style={
        mobile
          ? {
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 400,
              backgroundColor: "var(--unit-detail-header-bg)",
              color: "var(--neutral-0)",
              boxShadow: "var(--shadow-2)",
              padding: "12px var(--page-padding-x) calc(env(safe-area-inset-bottom, 0px) + 12px)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }
          : {
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              padding: "8px var(--page-padding-x) 10px",
              borderBottom: "1px solid var(--neutral-100)",
              backgroundColor: "var(--primary-50)",
              flexShrink: 0,
            }
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flex: mobile ? undefined : 1,
          minWidth: 0,
          width: mobile ? "100%" : undefined,
        }}
      >
        <CheckSquare
          size={14}
          style={{ flexShrink: 0, color: mobile ? "var(--neutral-0)" : "var(--primary-600)" }}
          aria-hidden
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: mobile ? "var(--neutral-0)" : "var(--primary-800)",
            whiteSpace: "nowrap",
          }}
        >
          {t("selectedCount", { count: selectedCount })}
        </span>
        {totalVisible > 0 && (
          <button
            type="button"
            onClick={allSelected ? onDeselectAll : onSelectAll}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: mobile ? "var(--neutral-200)" : "var(--primary-700)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            {t("selectAll", { count: totalVisible })}
          </button>
        )}
        {mobile && (
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("exitSelectMode")}
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
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
        )}
      </div>

      {exportOption ? (
        <div style={{ width: mobile ? "100%" : undefined, flexShrink: 0 }}>{exportOption}</div>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: mobile ? "100%" : undefined,
          marginLeft: mobile ? undefined : "auto",
        }}
      >
        {!mobile && (
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("exitSelectMode")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--neutral-300)",
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-600)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X size={14} aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={onExport}
          disabled={selectedCount === 0 || exporting}
          aria-label={exportAriaLabel}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            flex: mobile ? 1 : undefined,
            minHeight: mobile ? 44 : 34,
            padding: mobile ? "0 14px" : "0 12px",
            borderRadius: mobile ? "var(--radius-lg)" : 14,
            border: "none",
            backgroundColor:
              selectedCount === 0 || exporting
                ? mobile
                  ? "color-mix(in srgb, var(--neutral-0) 10%, transparent)"
                  : "var(--neutral-200)"
                : "var(--color-accent)",
            color:
              selectedCount === 0 || exporting
                ? mobile
                  ? "color-mix(in srgb, var(--neutral-0) 36%, transparent)"
                  : "var(--neutral-500)"
                : "var(--color-text-inverse)",
            fontSize: 12,
            fontWeight: 700,
            cursor: selectedCount === 0 || exporting ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <FileDown size={14} aria-hidden />
          {exportButtonLabel}
        </button>
      </div>
    </div>
  );
}

export function FieldLogExportSelectionBar(props: FieldLogExportSelectionBarProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  if (props.mobile) {
    if (!mounted) return null;
    return createPortal(<FieldLogExportSelectionBarInner {...props} />, document.body);
  }

  return <FieldLogExportSelectionBarInner {...props} />;
}

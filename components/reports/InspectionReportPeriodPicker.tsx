"use client";

import { useMemo, useState } from "react";
import { formatReportDate } from "@/lib/format-report-date";
import { filterPillStyle } from "@/components/reports/compare-period-picker-styles";
import {
  isInspectionReportCustomRangeInvalid,
  inspectionReportPeriodWithPreset,
  resolveInspectionReportPeriodRange,
  type InspectionReportPeriodPreset,
  type InspectionReportPeriodState,
} from "@/lib/reports/inspection-report-period";

const dateInputStyle = {
  height: 32,
  padding: "0 8px",
  borderRadius: "var(--radius-sm, 6px)",
  border: "1px solid var(--neutral-300)",
  fontSize: 12,
  backgroundColor: "var(--neutral-0)",
  color: "var(--neutral-900)",
  width: 132,
  boxSizing: "border-box" as const,
};

export function InspectionReportPeriodPicker({
  idPrefix,
  ariaLabel,
  period,
  onPeriodChange,
  periodPresets,
  locale,
  customFromLabel,
  customToLabel,
  customRangeError,
  clearCustomLabel,
}: {
  idPrefix: string;
  ariaLabel: string;
  period: InspectionReportPeriodState;
  onPeriodChange: (next: InspectionReportPeriodState) => void;
  periodPresets: { id: InspectionReportPeriodPreset; label: string }[];
  locale: string;
  customFromLabel: string;
  customToLabel: string;
  customRangeError: string;
  clearCustomLabel: string;
}) {
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const periodRange = useMemo(() => resolveInspectionReportPeriodRange(period), [period]);
  const customRangeInvalid = isInspectionReportCustomRangeInvalid(period);

  const openCustomEditor = () => {
    onPeriodChange(inspectionReportPeriodWithPreset(period, "custom"));
    setCustomEditorOpen(true);
  };

  const clearCustomEditor = () => {
    setCustomEditorOpen(false);
    onPeriodChange({ preset: "all", customFrom: "", customTo: "" });
  };

  const handlePresetClick = (presetId: InspectionReportPeriodPreset) => {
    if (presetId === "custom") {
      if (period.preset === "custom" && customEditorOpen) return;
      openCustomEditor();
      return;
    }
    setCustomEditorOpen(false);
    onPeriodChange(inspectionReportPeriodWithPreset(period, presetId));
  };

  const showCollapsedCustomRange =
    !customEditorOpen &&
    period.preset === "custom" &&
    !customRangeInvalid &&
    periodRange;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          minHeight: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {customEditorOpen ? (
          <div
            role="group"
            aria-label={ariaLabel}
            style={{
              display: "flex",
              flexWrap: "nowrap",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 6,
            }}
          >
            <label
              htmlFor={`${idPrefix}-from`}
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, flexShrink: 0 }}
            >
              <span style={{ color: "var(--neutral-600)", fontWeight: 500 }}>{customFromLabel}</span>
              <input
                id={`${idPrefix}-from`}
                type="date"
                value={period.customFrom}
                onChange={(event) =>
                  onPeriodChange({ ...period, customFrom: event.target.value, preset: "custom" })
                }
                style={dateInputStyle}
              />
            </label>

            <span
              aria-hidden
              style={{ fontSize: 12, color: "var(--neutral-400)", flexShrink: 0 }}
            >
              →
            </span>

            <label
              htmlFor={`${idPrefix}-to`}
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, flexShrink: 0 }}
            >
              <span style={{ color: "var(--neutral-600)", fontWeight: 500 }}>{customToLabel}</span>
              <input
                id={`${idPrefix}-to`}
                type="date"
                value={period.customTo}
                onChange={(event) =>
                  onPeriodChange({ ...period, customTo: event.target.value, preset: "custom" })
                }
                style={dateInputStyle}
              />
            </label>

            <button
              type="button"
              onClick={clearCustomEditor}
              style={{
                fontSize: 12,
                fontWeight: 500,
                padding: "4px 10px",
                borderRadius: 8,
                border: "1px solid var(--neutral-300)",
                background: "var(--neutral-0)",
                color: "var(--neutral-700)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {clearCustomLabel}
            </button>
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label={ariaLabel}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 6,
            }}
          >
            {periodPresets.map((preset) => {
              const active = period.preset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => handlePresetClick(preset.id)}
                  style={{
                    ...filterPillStyle(active),
                    fontSize: 12,
                    padding: "4px 10px",
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
            {(period.preset === "1w" || period.preset === "30d") &&
              !customRangeInvalid &&
              periodRange && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--neutral-500)",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {formatReportDate(periodRange.from, locale)}–
                  {formatReportDate(periodRange.to, locale)}
                </span>
              )}
            {showCollapsedCustomRange && periodRange && (
              <button
                type="button"
                onClick={openCustomEditor}
                style={{
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  fontSize: 11,
                  color: "var(--neutral-500)",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
              >
                {formatReportDate(periodRange.from, locale)}–{formatReportDate(periodRange.to, locale)}
              </button>
            )}
          </div>
        )}
      </div>

      {customEditorOpen && customRangeInvalid && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--error-600)", textAlign: "right" }}>
          {customRangeError}
        </p>
      )}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { formatReportDate } from "@/lib/format-report-date";
import {
  isCustomRangeInvalid,
  resolveComparePeriodRange,
  type ComparePeriodPreset,
  type ComparePeriodState,
} from "@/lib/reports/portfolio-progress-period";
import { filterPillStyle } from "@/components/reports/compare-period-picker-styles";

const dateInputStyle = {
  height: 32,
  padding: "0 8px",
  borderRadius: "var(--radius-sm, 6px)",
  border: "1px solid var(--neutral-300)",
  fontSize: 12,
  backgroundColor: "var(--neutral-0)",
  color: "var(--neutral-900)",
} as const;

export function ComparePeriodPicker({
  idPrefix,
  ariaLabel,
  comparePeriod,
  onComparePeriodChange,
  periodPresets,
  locale,
  customFromLabel,
  customToLabel,
  customRangeError,
  periodRangeSummary,
  disabled = false,
  hideResolvedRange = false,
}: {
  idPrefix: string;
  ariaLabel: string;
  comparePeriod: ComparePeriodState;
  onComparePeriodChange: (next: ComparePeriodState) => void;
  periodPresets: { id: ComparePeriodPreset; label: string }[];
  locale: string;
  customFromLabel: string;
  customToLabel: string;
  customRangeError: string;
  periodRangeSummary: (from: string, to: string) => string;
  disabled?: boolean;
  /** When true, omit the compact resolved date range (parent renders it prominently). */
  hideResolvedRange?: boolean;
}) {
  const periodRange = useMemo(() => resolveComparePeriodRange(comparePeriod), [comparePeriod]);
  const customRangeInvalid = isCustomRangeInvalid(comparePeriod);
  const showCustomInline = comparePeriod.preset === "custom";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        opacity: disabled ? 0.55 : 1,
      }}
      aria-disabled={disabled || undefined}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "4px 6px",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: disabled ? "var(--neutral-400)" : "var(--neutral-600)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          {ariaLabel}
        </span>
        <div
          role="radiogroup"
          aria-label={ariaLabel}
          aria-disabled={disabled || undefined}
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "4px 6px",
            flex: "1 1 auto",
          }}
        >
          {periodPresets.map((p) => {
            const active = comparePeriod.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onComparePeriodChange(
                    (() => {
                      const next: ComparePeriodState = { ...comparePeriod, preset: p.id };
                      if (p.id === "custom") return next;
                      const range = resolveComparePeriodRange(next);
                      return { ...next, customFrom: range.from, customTo: range.to };
                    })(),
                  );
                }}
                style={filterPillStyle(active, disabled)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {!hideResolvedRange &&
          !customRangeInvalid &&
          comparePeriod.preset !== "custom" &&
          comparePeriod.preset !== "all" && (
          <span
            title={periodRangeSummary(periodRange.from, periodRange.to)}
            style={{
              fontSize: 10,
              color: disabled ? "var(--neutral-400)" : "var(--neutral-500)",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {formatReportDate(periodRange.from, locale)}–{formatReportDate(periodRange.to, locale)}
          </span>
        )}
      </div>

      {showCustomInline && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "4px 8px",
            paddingLeft: 2,
          }}
        >
          <label
            htmlFor={`${idPrefix}-from`}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
          >
            <span style={{ color: "var(--neutral-600)", fontWeight: 500 }}>
              {customFromLabel}
            </span>
            <input
              id={`${idPrefix}-from`}
              type="date"
              disabled={disabled}
              value={comparePeriod.customFrom}
              onChange={(e) =>
                onComparePeriodChange({ ...comparePeriod, customFrom: e.target.value })
              }
              style={dateInputStyle}
            />
          </label>
          <label
            htmlFor={`${idPrefix}-to`}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
          >
            <span style={{ color: "var(--neutral-600)", fontWeight: 500 }}>
              {customToLabel}
            </span>
            <input
              id={`${idPrefix}-to`}
              type="date"
              disabled={disabled}
              value={comparePeriod.customTo}
              onChange={(e) =>
                onComparePeriodChange({ ...comparePeriod, customTo: e.target.value })
              }
              style={dateInputStyle}
            />
          </label>
          {!hideResolvedRange && !customRangeInvalid && (
            <span
              title={periodRangeSummary(periodRange.from, periodRange.to)}
              style={{
                fontSize: 10,
                color: "var(--neutral-500)",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {formatReportDate(periodRange.from, locale)}–
              {formatReportDate(periodRange.to, locale)}
            </span>
          )}
        </div>
      )}

      {customRangeInvalid && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--error-600)" }}>{customRangeError}</p>
      )}
    </div>
  );
}

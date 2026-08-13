"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatReportDate } from "@/lib/format-report-date";
import {
  isCustomRangeInvalid,
  resolveComparePeriodRange,
  type ComparePeriodPreset,
  type ComparePeriodState,
} from "@/lib/reports/portfolio-progress-period";

const dateInputStyle = {
  height: 32,
  padding: "0 8px",
  borderRadius: "var(--radius-sm, 6px)",
  border: "1px solid var(--neutral-300)",
  fontSize: 12,
  backgroundColor: "var(--neutral-0)",
  color: "var(--neutral-900)",
} as const;

export function ComparePeriodDropdown({
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
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const periodRange = useMemo(() => resolveComparePeriodRange(comparePeriod), [comparePeriod]);
  const customRangeInvalid = isCustomRangeInvalid(comparePeriod);

  const selectedLabel =
    periodPresets.find((preset) => preset.id === comparePeriod.preset)?.label ??
    periodPresets[0]?.label ??
    "";

  const showResolvedRange =
    comparePeriod.preset !== "all" && !customRangeInvalid;
  const resolvedRangeLabel = showResolvedRange
    ? `${formatReportDate(periodRange.from, locale)}–${formatReportDate(periodRange.to, locale)}`
    : null;
  const triggerAriaLabel = resolvedRangeLabel
    ? `${ariaLabel}, ${selectedLabel}, ${resolvedRangeLabel}`
    : `${ariaLabel}, ${selectedLabel}`;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectPreset = (presetId: ComparePeriodPreset) => {
    const next: ComparePeriodState = { ...comparePeriod, preset: presetId };
    if (presetId !== "custom") {
      const range = resolveComparePeriodRange(next);
      onComparePeriodChange({ ...next, customFrom: range.from, customTo: range.to });
      setOpen(false);
      return;
    }
    onComparePeriodChange(next);
  };

  return (
    <div ref={rootRef} className="portfolio-progress-period-dropdown">
      <button
        type="button"
        className={`portfolio-progress-period-dropdown-trigger${
          open ? " portfolio-progress-period-dropdown-trigger--open" : ""
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerAriaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
      >
        <span className="portfolio-progress-period-dropdown-trigger-text">
          <span className="portfolio-progress-period-dropdown-trigger-label">{selectedLabel}</span>
          {resolvedRangeLabel ? (
            <span className="portfolio-progress-period-dropdown-trigger-range">
              {resolvedRangeLabel}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`portfolio-progress-period-dropdown-chevron${
            open ? " portfolio-progress-period-dropdown-chevron--open" : ""
          }`}
        />
      </button>

      {open && !disabled && (
        <div
          role="menu"
          aria-label={ariaLabel}
          className="portfolio-progress-period-dropdown-menu"
        >
          {periodPresets.map((preset) => {
            const active = comparePeriod.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`portfolio-progress-period-dropdown-option${
                  active ? " portfolio-progress-period-dropdown-option--active" : ""
                }`}
                onClick={() => selectPreset(preset.id)}
              >
                {preset.label}
              </button>
            );
          })}

          {comparePeriod.preset === "custom" && (
            <div className="portfolio-progress-period-dropdown-custom">
              <label htmlFor={`${idPrefix}-from`} className="portfolio-progress-period-dropdown-date-label">
                <span>{customFromLabel}</span>
                <input
                  id={`${idPrefix}-from`}
                  type="date"
                  value={comparePeriod.customFrom}
                  onChange={(e) =>
                    onComparePeriodChange({ ...comparePeriod, customFrom: e.target.value })
                  }
                  style={dateInputStyle}
                />
              </label>
              <label htmlFor={`${idPrefix}-to`} className="portfolio-progress-period-dropdown-date-label">
                <span>{customToLabel}</span>
                <input
                  id={`${idPrefix}-to`}
                  type="date"
                  value={comparePeriod.customTo}
                  onChange={(e) =>
                    onComparePeriodChange({ ...comparePeriod, customTo: e.target.value })
                  }
                  style={dateInputStyle}
                />
              </label>
              {!customRangeInvalid && (
                <p
                  className="portfolio-progress-period-dropdown-range-summary"
                  title={periodRangeSummary(periodRange.from, periodRange.to)}
                >
                  {formatReportDate(periodRange.from, locale)}–
                  {formatReportDate(periodRange.to, locale)}
                </p>
              )}
              {customRangeInvalid && (
                <p className="portfolio-progress-period-dropdown-range-error">{customRangeError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

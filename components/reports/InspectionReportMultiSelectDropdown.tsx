"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { isUnsetOrAllSelected } from "@/lib/inspections/inspection-report-filters";

export interface InspectionReportMultiSelectOption {
  code: string;
  label: string;
}

export function InspectionReportMultiSelectDropdown({
  options,
  selectedCodes,
  onChange,
  allLabel,
  countLabel,
  menuAriaLabel,
  clearLabel,
  variant = "primary",
}: {
  options: readonly InspectionReportMultiSelectOption[];
  selectedCodes: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  allLabel: string;
  countLabel: (count: number) => string;
  menuAriaLabel: string;
  clearLabel: string;
  variant?: "primary" | "neutral";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const allCodes = options.map((option) => option.code);
  const isNarrowed =
    selectedCodes.size > 0 && !isUnsetOrAllSelected(selectedCodes, allCodes);

  const triggerLabel = useMemo(() => {
    if (!isNarrowed) return allLabel;
    const names = allCodes
      .filter((code) => selectedCodes.has(code))
      .map((code) => options.find((option) => option.code === code)?.label ?? code);
    if (names.length === 1) return names[0] ?? allLabel;
    return countLabel(names.length);
  }, [allCodes, allLabel, countLabel, isNarrowed, options, selectedCodes]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const isPrimary = variant === "primary";

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={menuAriaLabel}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minWidth: 120,
          maxWidth: 220,
          padding: "7px 12px",
          borderRadius: 8,
          border: isPrimary
            ? "1px solid var(--primary-500)"
            : isNarrowed
              ? "1px solid var(--primary-500)"
              : "1px solid var(--neutral-300)",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: isPrimary ? "var(--neutral-0)" : isNarrowed ? "var(--primary-600)" : "var(--neutral-700)",
          background: isPrimary ? "var(--primary-500)" : isNarrowed ? "var(--primary-50)" : "var(--neutral-0)",
          boxShadow: isPrimary ? "var(--shadow-1)" : undefined,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            textAlign: "left",
          }}
        >
          {triggerLabel}
        </span>
        <ChevronDown size={14} aria-hidden style={{ flexShrink: 0, opacity: 0.85 }} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={menuAriaLabel}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 40,
            minWidth: 220,
            maxWidth: 280,
            maxHeight: 260,
            overflowY: "auto",
            padding: 8,
            borderRadius: 8,
            border: "1px solid var(--neutral-200)",
            background: "var(--neutral-0)",
            boxShadow: "var(--shadow-2)",
          }}
        >
          {isNarrowed && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              style={{
                display: "block",
                width: "100%",
                marginBottom: 6,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid var(--neutral-200)",
                background: "var(--neutral-0)",
                color: "var(--neutral-700)",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {clearLabel}
            </button>
          )}
          {options.map((option) => {
            const checked = selectedCodes.has(option.code);
            return (
              <label
                key={option.code}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  background: checked ? "var(--primary-50)" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(selectedCodes);
                    if (next.has(option.code)) next.delete(option.code);
                    else next.add(option.code);
                    onChange(next);
                  }}
                />
                <span style={{ minWidth: 0 }}>{option.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

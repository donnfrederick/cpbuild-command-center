"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  projectHubDatePresetRange,
  type ProjectHubFormDatePreset,
} from "@/lib/inspections/project-hub-form-list-filters";

const PANEL_CSS = `
  .phfp-backdrop {
    position: fixed; inset: 0; z-index: 300;
    display: flex; align-items: flex-end;
    transition: background-color 0.26s ease;
  }
  .phfp-sheet {
    width: 100%; max-height: 90vh;
    border-radius: 16px 16px 0 0;
    background: var(--neutral-0);
    transform: translateY(100%);
    transition: transform 0.3s cubic-bezier(0.32,0.72,0,1);
    display: flex; flex-direction: column;
    box-shadow: 0 -4px 32px rgba(0,0,0,0.14);
  }
  .phfp-sheet.phfp-visible { transform: translateY(0); }
  .phfp-handle {
    display: block; width: 36px; height: 4px;
    background: var(--neutral-300); border-radius: 99px;
    margin: 10px auto 0; flex-shrink: 0;
  }
  @media (min-width: 640px) {
    .phfp-backdrop { align-items: stretch; justify-content: flex-end; pointer-events: none; }
    .phfp-sheet {
      width: min(420px, 100vw); height: 100%; max-height: 100%;
      border-radius: 0;
      transform: translateX(100%);
      box-shadow: -4px 0 32px rgba(0,0,0,0.12);
      pointer-events: all;
    }
    .phfp-sheet.phfp-visible { transform: translateX(0); }
    .phfp-handle { display: none; }
  }
`;

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p
        style={{
          margin: "0 0 10px",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--neutral-500)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {title}
      </p>
      {children}
    </section>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        border: active ? "1.5px solid var(--primary-500)" : "1px solid var(--neutral-300)",
        backgroundColor: active ? "var(--primary-50)" : "var(--neutral-0)",
        color: active ? "var(--primary-700)" : "var(--neutral-700)",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const DATE_INPUT: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "8px 10px",
  fontSize: 13,
  borderRadius: 8,
  border: "1px solid var(--neutral-200)",
  backgroundColor: "var(--neutral-0)",
  color: "var(--neutral-800)",
};

export function ProjectHubFormsFilterPanel({
  onClose,
  onClearFilters,
  activeFilterCount,
  formNameOptions,
  selectedFormNames,
  onChangeFormNames,
  fromDate,
  toDate,
  onChangeFromDate,
  onChangeToDate,
  datePreset,
  onChangeDatePreset,
}: {
  onClose: () => void;
  onClearFilters: () => void;
  activeFilterCount: number;
  formNameOptions: string[];
  selectedFormNames: Set<string>;
  onChangeFormNames: (next: Set<string>) => void;
  fromDate: string;
  toDate: string;
  onChangeFromDate: (value: string) => void;
  onChangeToDate: (value: string) => void;
  datePreset: ProjectHubFormDatePreset;
  onChangeDatePreset: (preset: ProjectHubFormDatePreset) => void;
}) {
  const t = useTranslations("inspections");
  const [visible, setVisible] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    closeTimerRef.current = setTimeout(onClose, 260);
  }, [onClose]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    };
  }, [close]);

  const applyPreset = (preset: ProjectHubFormDatePreset) => {
    onChangeDatePreset(preset);
    if (preset === "all") {
      onChangeFromDate("");
      onChangeToDate("");
      return;
    }
    if (preset === "custom") return;
    const range = projectHubDatePresetRange(preset);
    onChangeFromDate(range.fromDate);
    onChangeToDate(range.toDate);
  };

  const toggleFormName = (name: string) => {
    onChangeFormNames(
      new Set(
        selectedFormNames.has(name)
          ? [...selectedFormNames].filter((n) => n !== name)
          : [...selectedFormNames, name],
      ),
    );
  };

  const allFormsSelected =
    formNameOptions.length === 0 ||
    formNameOptions.every((name) => selectedFormNames.has(name));

  return createPortal(
    <>
      <style>{PANEL_CSS}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("hubProjectFormsFilterTitle")}
        className="phfp-backdrop"
        style={{ backgroundColor: visible ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)" }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div
          role="document"
          className={`phfp-sheet${visible ? " phfp-visible" : ""}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="phfp-handle" aria-hidden="true" />

          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--neutral-200)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--neutral-900)" }}>
                  {t("hubProjectFormsFilterTitle")}
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--neutral-500)" }}>
                  {t("hubProjectFormsFilterSubtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t("hubProjectFormsFilterCloseAria")}
                style={{
                  padding: 4,
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  color: "var(--neutral-500)",
                }}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <FilterSection title={t("hubProjectFormsFilterDate")}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  <FilterChip
                    label={t("hubProjectFormsDateAll")}
                    active={datePreset === "all"}
                    onClick={() => applyPreset("all")}
                  />
                  <FilterChip
                    label={t("hubProjectFormsDateLast7")}
                    active={datePreset === "last7"}
                    onClick={() => applyPreset("last7")}
                  />
                  <FilterChip
                    label={t("hubProjectFormsDateLast30")}
                    active={datePreset === "last30"}
                    onClick={() => applyPreset("last30")}
                  />
                  <FilterChip
                    label={t("hubProjectFormsDateLast90")}
                    active={datePreset === "last90"}
                    onClick={() => applyPreset("last90")}
                  />
                  <FilterChip
                    label={t("hubProjectFormsDateCustom")}
                    active={datePreset === "custom"}
                    onClick={() => {
                      onChangeDatePreset("custom");
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      onChangeDatePreset("custom");
                      onChangeFromDate(e.target.value);
                    }}
                    aria-label={t("reportFilterDateFromAria")}
                    style={DATE_INPUT}
                  />
                  <span style={{ fontSize: 12, color: "var(--neutral-400)" }}>→</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      onChangeDatePreset("custom");
                      onChangeToDate(e.target.value);
                    }}
                    aria-label={t("reportFilterDateToAria")}
                    style={DATE_INPUT}
                  />
                </div>
              </FilterSection>

              {formNameOptions.length > 0 && (
                <FilterSection title={t("hubProjectFormsFilterForm")}>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeFormNames(new Set(formNameOptions));
                    }}
                    style={{
                      marginBottom: 8,
                      padding: "4px 0",
                      border: "none",
                      background: "none",
                      fontSize: 12,
                      fontWeight: 600,
                      color: allFormsSelected ? "var(--primary-700)" : "var(--neutral-600)",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    {t("hubProjectFormsFilterAllForms")}
                  </button>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      maxHeight: 220,
                      overflowY: "auto",
                    }}
                  >
                    {formNameOptions.map((name) => {
                      const checked = selectedFormNames.has(name);
                      return (
                        <label
                          key={name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 10px",
                            borderRadius: 8,
                            backgroundColor: checked ? "var(--primary-50)" : "transparent",
                            cursor: "pointer",
                            fontSize: 13,
                            color: "var(--neutral-800)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFormName(name)}
                            style={{ width: 16, height: 16, flexShrink: 0 }}
                          />
                          <span style={{ minWidth: 0 }}>{name}</span>
                        </label>
                      );
                    })}
                  </div>
                </FilterSection>
              )}
            </div>
          </div>

          <div
            style={{
              padding: "12px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)",
              borderTop: "1px solid var(--neutral-200)",
              display: "flex",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={onClearFilters}
              disabled={activeFilterCount === 0}
              style={{
                flex: 1,
                height: 40,
                borderRadius: "var(--radius-sm, 8px)",
                border: "1px solid var(--neutral-300)",
                backgroundColor: "var(--neutral-0)",
                color: activeFilterCount === 0 ? "var(--neutral-400)" : "var(--neutral-700)",
                fontSize: 14,
                fontWeight: 500,
                cursor: activeFilterCount === 0 ? "default" : "pointer",
              }}
            >
              {t("reportFilterClearAll")}
            </button>
            <button
              type="button"
              onClick={close}
              style={{
                flex: 2,
                height: 40,
                borderRadius: "var(--radius-sm, 8px)",
                border: "none",
                backgroundColor: "var(--primary-700)",
                color: "var(--neutral-0)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("reportFilterShowResults")}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

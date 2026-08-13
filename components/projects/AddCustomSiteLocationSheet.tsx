"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, X } from "lucide-react";
import type { CustomSitePlacement } from "@/lib/custom-site-locations";
import { normalizeCustomSiteLocationFields } from "@/lib/custom-site-locations";

interface AddCustomSiteLocationSheetProps {
  buildingOptions: string[];
  levelOptions: string[];
  /** When set, building is fixed and standalone placement is hidden. */
  lockedBuilding?: string;
  /** When set with lockedBuilding, level is fixed and only name is editable. */
  lockedLevel?: string;
  initialName?: string;
  initialPlacement?: CustomSitePlacement;
  initialBuilding?: string;
  initialLevel?: string;
  /** Override the dialog title. Defaults to the "Add" title from i18n. */
  title?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    placement: CustomSitePlacement;
    building: string;
    level: string;
  }) => Promise<void>;
}

interface PickerOption {
  value: string;
  label: string;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "block",
        fontSize: 11,
        fontWeight: 700,
        color: "var(--neutral-500)",
        marginBottom: 8,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </span>
  );
}

function InlineDropdown({
  label,
  value,
  placeholder,
  options,
  open,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: PickerOption[];
  open: boolean;
  onToggle: () => void;
  onSelect: (next: string) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !rootRef.current) return;
    rootRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <FieldLabel>{label}</FieldLabel>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
        style={{
          width: "100%",
          minHeight: 44,
          padding: "10px 12px",
          borderRadius: open ? "var(--radius-md) var(--radius-md) 0 0" : "var(--radius-md)",
          border: `1px solid ${open ? "var(--primary-400)" : "var(--neutral-300)"}`,
          background: "var(--neutral-0)",
          fontFamily: "inherit",
          fontSize: 15,
          color: value ? "var(--neutral-900)" : "var(--neutral-500)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          textAlign: "left",
        }}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || placeholder}
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          style={{
            flexShrink: 0,
            color: "var(--neutral-500)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            maxHeight: 280,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            border: "1px solid var(--primary-400)",
            borderTop: "1px solid var(--neutral-200)",
            borderRadius: "0 0 var(--radius-md) var(--radius-md)",
            backgroundColor: "var(--neutral-0)",
            boxShadow: "var(--shadow-1)",
          }}
        >
          {options.map((opt) => {
            const selected = value === opt.value;
            return (
              <li key={opt.value || "__empty__"} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelect(opt.value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    width: "100%",
                    minHeight: 44,
                    padding: "10px 12px",
                    border: "none",
                    borderBottom: "1px solid var(--neutral-100)",
                    backgroundColor: selected ? "var(--primary-50)" : "transparent",
                    color: selected ? "var(--primary-700)" : "var(--neutral-800)",
                    fontSize: 15,
                    fontWeight: selected ? 700 : 500,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ minWidth: 0, wordBreak: "break-word" }}>{opt.label}</span>
                  {selected ? <Check size={16} aria-hidden style={{ flexShrink: 0 }} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AddCustomSiteLocationSheet({
  buildingOptions,
  levelOptions,
  lockedBuilding,
  lockedLevel,
  initialName = "",
  initialPlacement,
  initialBuilding = "",
  initialLevel = "",
  title,
  submitLabel,
  onClose,
  onSubmit,
}: AddCustomSiteLocationSheetProps) {
  const t = useTranslations("units.customSite");
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState(initialName);
  const [placement, setPlacement] = useState<CustomSitePlacement>(
    initialPlacement ?? (lockedLevel ? "building_level" : lockedBuilding ? "building" : "standalone"),
  );
  const [building, setBuilding] = useState(lockedBuilding ?? initialBuilding);
  const [level, setLevel] = useState(lockedLevel ?? initialLevel);
  const [submitting, setSubmitting] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"building" | "level" | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const closeWithAnimation = () => {
    setOpenDropdown(null);
    setVisible(false);
    window.setTimeout(onClose, 200);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const effectiveBuilding = lockedBuilding ?? building;
      const effectiveLevel = lockedLevel ?? level;
      const normalized = normalizeCustomSiteLocationFields(
        placement,
        effectiveBuilding,
        effectiveLevel,
      );
      await onSubmit({
        name: name.trim(),
        placement,
        building: normalized.building,
        level: normalized.level,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const effectiveBuilding = lockedBuilding ?? building;

  const levelsForBuilding = effectiveBuilding
    ? levelOptions
        .filter((l) => l.startsWith(`${effectiveBuilding}|`))
        .sort((a, b) => {
          const levelA = a.slice(effectiveBuilding.length + 1);
          const levelB = b.slice(effectiveBuilding.length + 1);
          return levelA.localeCompare(levelB, undefined, { numeric: true });
        })
    : [];

  const levelPickerOptions: PickerOption[] = levelsForBuilding.map((l) => {
    const label = l.includes("|") ? l.split("|").slice(1).join(" · ") : l;
    return { value: label, label };
  });

  const buildingPickerOptions: PickerOption[] = buildingOptions.map((b) => ({
    value: b,
    label: b,
  }));

  const placementOptions: CustomSitePlacement[] = lockedLevel
    ? []
    : lockedBuilding
      ? ["building", "building_level"]
      : ["standalone", "building", "building_level"];

  const placementLabelKey = (value: CustomSitePlacement): string => {
    if (lockedBuilding && !lockedLevel) {
      if (value === "building") return "placementOption_building_scoped";
      if (value === "building_level") return "placementOption_building_level_scoped";
    }
    return `placementOption_${value}`;
  };

  const showPlacementFieldset = placementOptions.length > 0;
  const showLevelPicker = placement === "building_level" && !lockedLevel;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-custom-site-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeWithAnimation();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 16px",
        paddingBottom: "max(20px, env(safe-area-inset-bottom, 0px))",
        backgroundColor: visible ? "var(--overlay-bg, rgba(0,0,0,0.5))" : "transparent",
        transition: "background-color 0.22s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          maxHeight: "min(88dvh, 640px)",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "var(--color-surface)",
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.97)",
          transition: "opacity 0.2s ease, transform 0.2s ease",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-2)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 12px",
            borderBottom: "1px solid var(--neutral-200)",
            flexShrink: 0,
          }}
        >
          <h2 id="add-custom-site-title" style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            {title ?? t("addTitle")}
          </h2>
          <button
            type="button"
            onClick={closeWithAnimation}
            aria-label={t("close")}
            style={{
              width: 36,
              height: 36,
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "var(--neutral-100)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div
          style={{
            padding: "16px",
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            WebkitOverflowScrolling: "touch",
          }}
        >
          <label style={{ display: "block" }}>
            <FieldLabel>{t("nameLabel")}</FieldLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              style={{
                width: "100%",
                minHeight: 44,
                padding: "10px 12px",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-md)",
                background: "var(--neutral-0)",
                fontFamily: "inherit",
                fontSize: 15,
              }}
            />
          </label>

          {showPlacementFieldset && (
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend style={{ padding: 0 }}>
              <FieldLabel>{t("placementLabel")}</FieldLabel>
            </legend>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {placementOptions.map((value) => (
                <label
                  key={value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 44,
                    padding: "8px 0",
                    fontSize: 14,
                    lineHeight: 1.35,
                    color: "var(--neutral-800)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="custom-site-placement"
                    checked={placement === value}
                    onChange={() => {
                      setOpenDropdown(null);
                      setPlacement(value);
                      if (value === "standalone") {
                        setBuilding("");
                        setLevel("");
                      } else if (value === "building") {
                        setLevel("");
                        if (lockedBuilding) setBuilding(lockedBuilding);
                      } else if (lockedBuilding) {
                        setBuilding(lockedBuilding);
                      }
                    }}
                    style={{ width: 18, height: 18, flexShrink: 0 }}
                  />
                  {t(placementLabelKey(value))}
                </label>
              ))}
            </div>
          </fieldset>
          )}

          {lockedBuilding ? (
            <div>
              <FieldLabel>{t("buildingLabel")}</FieldLabel>
              <div
                aria-readonly
                style={{
                  width: "100%",
                  minHeight: 44,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--neutral-200)",
                  background: "var(--neutral-50)",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--neutral-800)",
                  boxSizing: "border-box",
                }}
              >
                {lockedBuilding}
              </div>
            </div>
          ) : (
            placement !== "standalone" && (
              <InlineDropdown
                label={t("buildingLabel")}
                value={building}
                placeholder={t("selectBuilding")}
                options={buildingPickerOptions}
                open={openDropdown === "building"}
                onToggle={() =>
                  setOpenDropdown((current) => (current === "building" ? null : "building"))
                }
                onSelect={(next) => {
                  setBuilding(next);
                  setLevel("");
                  setOpenDropdown(null);
                }}
              />
            )
          )}

          {lockedLevel ? (
            <div>
              <FieldLabel>{t("levelLabel")}</FieldLabel>
              <div
                aria-readonly
                style={{
                  width: "100%",
                  minHeight: 44,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--neutral-200)",
                  background: "var(--neutral-50)",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--neutral-800)",
                  boxSizing: "border-box",
                }}
              >
                {lockedLevel}
              </div>
            </div>
          ) : (
            showLevelPicker && (
            <InlineDropdown
              label={t("levelLabel")}
              value={level}
              placeholder={t("selectLevel")}
              options={levelPickerOptions}
              open={openDropdown === "level"}
              onToggle={() => setOpenDropdown((current) => (current === "level" ? null : "level"))}
              onSelect={(next) => {
                setLevel(next);
                setOpenDropdown(null);
              }}
            />
            )
          )}
        </div>

        <div
          style={{
            padding: "12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px)",
            borderTop: "1px solid var(--neutral-200)",
            flexShrink: 0,
            backgroundColor: "var(--color-surface)",
          }}
        >
          <button
            type="button"
            disabled={submitting || !name.trim()}
            onClick={() => void handleSubmit()}
            style={{
              width: "100%",
              minHeight: 44,
              border: "none",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-accent)",
              color: "var(--color-text-inverse)",
              fontSize: 14,
              fontWeight: 700,
              cursor: submitting ? "default" : "pointer",
              opacity: submitting || !name.trim() ? 0.6 : 1,
              fontFamily: "inherit",
            }}
          >
            {submitting ? t("saving") : (submitLabel ?? t("save"))}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

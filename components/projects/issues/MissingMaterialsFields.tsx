"use client";

import { useTranslations } from "next-intl";
import type { IssueScopeUom } from "@/lib/issues/missing-materials";

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--neutral-500)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

export interface MissingMaterialsFieldsProps {
  materialDescription: string;
  onMaterialDescriptionChange: (value: string) => void;
  materialQuantity: string;
  onMaterialQuantityChange: (value: string) => void;
  uom: IssueScopeUom | null;
  disabled?: boolean;
  onFieldFocus?: (el: HTMLElement) => void;
}

export function MissingMaterialsFields({
  materialDescription,
  onMaterialDescriptionChange,
  materialQuantity,
  onMaterialQuantityChange,
  uom,
  disabled = false,
  onFieldFocus,
}: MissingMaterialsFieldsProps) {
  const t = useTranslations("units");

  return (
    <div
      style={{
        marginTop: 12,
        padding: "12px",
        borderRadius: 12,
        border: "1.5px solid var(--warning-200)",
        backgroundColor: "var(--warning-50)",
      }}
    >
      <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--warning-800)" }}>
        {t("missingMaterialsPrompt")}
      </p>

      <div>
        <label style={LABEL_STYLE} htmlFor="missing-material-description">
          {t("missingMaterialDescriptionLabel")} <span style={{ color: "var(--error-500)" }}>*</span>
        </label>
        <input
          id="missing-material-description"
          type="text"
          value={materialDescription}
          disabled={disabled}
          onChange={(e) => onMaterialDescriptionChange(e.target.value.slice(0, 500))}
          onFocus={(e) => onFieldFocus?.(e.currentTarget)}
          placeholder={t("missingMaterialDescriptionPlaceholder")}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1.5px solid var(--neutral-250)",
            fontSize: 14,
            lineHeight: 1.5,
            backgroundColor: "var(--neutral-0)",
            color: "var(--neutral-900)",
            boxSizing: "border-box",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={LABEL_STYLE} htmlFor="missing-material-quantity">
          {t("missingMaterialQuantityLabel")} <span style={{ color: "var(--error-500)" }}>*</span>
        </label>
        <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
          <input
            id="missing-material-quantity"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={materialQuantity}
            disabled={disabled}
            onChange={(e) => onMaterialQuantityChange(e.target.value)}
            onFocus={(e) => onFieldFocus?.(e.currentTarget)}
            placeholder={t("missingMaterialQuantityPlaceholder")}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1.5px solid var(--neutral-250)",
              fontSize: 14,
              lineHeight: 1.5,
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-900)",
              boxSizing: "border-box",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <div
            aria-label={t("missingMaterialUomLabel")}
            title={uom?.name ?? t("missingMaterialUomUnknown")}
            style={{
              flexShrink: 0,
              minWidth: 52,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1.5px solid var(--neutral-200)",
              backgroundColor: "var(--neutral-0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: uom?.code ? "var(--neutral-700)" : "var(--neutral-400)",
            }}
          >
            {uom?.code ?? "—"}
          </div>
        </div>
        {!uom?.code && (
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--neutral-500)", lineHeight: 1.4 }}>
            {t("missingMaterialSelectScopeForUom")}
          </p>
        )}
      </div>
    </div>
  );
}

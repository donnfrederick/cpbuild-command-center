"use client";

import { useTranslations } from "next-intl";

export function ShareOnlyFailedItemsToggle({
  checked,
  onChange,
  id = "share-only-failed-items",
  variant = "default",
  compact = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  /** Light label on dark selection bars (mobile export footer). */
  variant?: "default" | "onDark";
  compact?: boolean;
}) {
  const t = useTranslations("inspections");
  const onDark = variant === "onDark";

  return (
    <label
      htmlFor={id}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: compact ? "4px 0" : "8px 10px",
        margin: 0,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        color: onDark ? "var(--neutral-100)" : "var(--neutral-700)",
        lineHeight: 1.35,
        width: compact ? "100%" : undefined,
      }}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 16,
          height: 16,
          marginTop: 1,
          flexShrink: 0,
          accentColor: "var(--primary-600)",
        }}
      />
      <span>{t("shareOnlyFailedItems")}</span>
    </label>
  );
}

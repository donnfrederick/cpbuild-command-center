"use client";

import { useTranslations } from "next-intl";

export function ObservationConfigPlaceholder() {
  const t = useTranslations("projectSettings");

  return (
    <div
      style={{
        maxWidth: 480,
        padding: "16px 0",
      }}
    >
      <h2
        style={{
          margin: "0 0 6px",
          fontSize: 16,
          fontWeight: 700,
          color: "var(--color-text-primary)",
        }}
      >
        {t("observationConfigTitle")}
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--color-text-tertiary)",
        }}
      >
        {t("observationConfigComingSoon")}
      </p>
    </div>
  );
}

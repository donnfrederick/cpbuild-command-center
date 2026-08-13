"use client";

import { useTranslations } from "next-intl";

export function FieldDailyReportMetaLines({
  generatedAt,
  activityThrough,
  trigger,
}: {
  generatedAt: string;
  activityThrough: string;
  trigger: "MANUAL" | "SCHEDULED";
}) {
  const t = useTranslations("fieldDailyReport");
  const updated = new Date(generatedAt).toLocaleString();
  const through = new Date(activityThrough).toLocaleString();

  return (
    <div style={{ fontSize: 12, color: "var(--neutral-500)", lineHeight: 1.4 }}>
      <p style={{ margin: 0 }}>
        {trigger === "SCHEDULED" ? t("generatedScheduled") : t("generatedManual")}
        {" · "}
        {t("reportLastUpdated", { time: updated })}
      </p>
      <p style={{ margin: "4px 0 0" }}>{t("reportActivityThrough", { time: through })}</p>
    </div>
  );
}

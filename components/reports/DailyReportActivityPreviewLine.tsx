"use client";

import { useTranslations } from "next-intl";
import type { HubActivityPreviewCounts } from "@/lib/field-daily-report/hub-activity-preview";

/** Activity count summary line (status changes, inspections, issues, other). */
export function DailyReportActivityPreviewLine({ counts }: { counts: HubActivityPreviewCounts }) {
  const t = useTranslations("fieldDailyReport");

  const parts = [
    t("hubPreviewStatusChanges", { count: counts.statusChanges }),
    t("hubPreviewInspections", { count: counts.inspections }),
  ];

  if (counts.issuesReported > 0) {
    parts.push(t("hubPreviewIssuesReported", { count: counts.issuesReported }));
  }
  if (counts.otherActivity > 0) {
    parts.push(t("hubPreviewOtherActivity", { count: counts.otherActivity }));
  }

  return (
    <p style={{ margin: 0, fontSize: "var(--text-caption)", color: "var(--neutral-500)", lineHeight: 1.45 }}>
      {parts.join(" · ")}
    </p>
  );
}

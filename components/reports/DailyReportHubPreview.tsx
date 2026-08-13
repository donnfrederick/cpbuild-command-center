"use client";

import { buildHubActivityPreviewCounts } from "@/lib/field-daily-report/hub-activity-preview";
import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";
import { DailyReportActivityPreviewLine } from "@/components/reports/DailyReportActivityPreviewLine";

/** Scannable activity summary for the project hub daily report preview. */
export function DailyReportHubPreview({ snapshot }: { snapshot: FieldDailyReportProjectSnapshot }) {
  return <DailyReportActivityPreviewLine counts={buildHubActivityPreviewCounts(snapshot)} />;
}

import { buildHubActivityPreviewCounts } from "@/lib/field-daily-report/hub-activity-preview";
import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

export type FieldDailyShareLabels = {
  statusChanges: string;
  inspections: string;
  issuesReported: string;
  otherActivity: string;
  updated: string;
};

export function buildFieldDailyReportSharePayload(options: {
  projectName: string;
  reportDate: string;
  updatedTimeLabel?: string;
  snapshot: FieldDailyReportProjectSnapshot;
  labels: FieldDailyShareLabels;
  pageUrl?: string;
}): { title: string; text: string; url?: string } {
  const counts = buildHubActivityPreviewCounts(options.snapshot);
  const lines = [
    options.projectName,
    options.reportDate,
    options.updatedTimeLabel ? `${options.labels.updated} ${options.updatedTimeLabel}` : null,
    "",
    options.labels.statusChanges,
    options.labels.inspections,
  ];
  if (counts.issuesReported > 0) lines.push(options.labels.issuesReported);
  if (counts.otherActivity > 0) lines.push(options.labels.otherActivity);

  return {
    title: `${options.projectName} — ${options.reportDate}`,
    text: lines.filter((line): line is string => line != null).join("\n"),
    url: options.pageUrl,
  };
}

export async function shareFieldDailyReportPayload(payload: {
  title: string;
  text: string;
  url?: string;
}): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const shareData: ShareData = {
        title: payload.title,
        text: payload.text,
        ...(payload.url ? { url: payload.url } : {}),
      };
      await navigator.share(shareData);
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    const clip = [payload.text, payload.url].filter(Boolean).join("\n\n");
    await navigator.clipboard.writeText(clip);
    return "copied";
  }

  throw new Error("share_unavailable");
}

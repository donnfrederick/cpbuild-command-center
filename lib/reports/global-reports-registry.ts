import { Activity, BarChart3, ClipboardCheck, NotebookPen, type LucideIcon } from "lucide-react";

export type GlobalReportId = "activity" | "progress" | "inspections" | "field-daily";

export interface GlobalReportDefinition {
  id: GlobalReportId;
  href: `/reports/${GlobalReportId}`;
  labelKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}

/** Single source of truth for dashboard-level reports (sidebar, hub, switcher). */
export const GLOBAL_REPORTS: readonly GlobalReportDefinition[] = [
  {
    id: "activity",
    href: "/reports/activity",
    labelKey: "activity",
    descriptionKey: "activityDesc",
    icon: Activity,
  },
  {
    id: "progress",
    href: "/reports/progress",
    labelKey: "progress",
    descriptionKey: "progressDesc",
    icon: BarChart3,
  },
  {
    id: "inspections",
    href: "/reports/inspections",
    labelKey: "inspections",
    descriptionKey: "inspectionsDesc",
    icon: ClipboardCheck,
  },
  {
    id: "field-daily",
    href: "/reports/field-daily",
    labelKey: "fieldDaily",
    descriptionKey: "fieldDailyDesc",
    icon: NotebookPen,
  },
] as const;

export function isGlobalReportSubRoute(pathname: string): boolean {
  return GLOBAL_REPORTS.some((report) => pathname === report.href || pathname.startsWith(`${report.href}/`));
}

export function getGlobalReportByPath(pathname: string): GlobalReportDefinition | undefined {
  return GLOBAL_REPORTS.find(
    (report) => pathname === report.href || pathname.startsWith(`${report.href}/`),
  );
}

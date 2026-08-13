/** Safe attachment filename for a single-project field daily report PDF. */
export function fieldDailyReportPdfFilename(projectName: string, reportDate: string): string {
  const slug =
    projectName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project";
  return `field-daily-report-${slug}-${reportDate}.pdf`;
}

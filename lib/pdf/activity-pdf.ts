import { launchPdfPuppeteerBrowser } from "@/lib/pdf/puppeteer-launch";
import {
  ACTIVITY_EVENT_META,
  buildActivityExportSummary,
  getActivityExportLocation,
  type ActivityEventForPdf,
} from "@/lib/export/activity-export-format";

export type { ActivityEventForPdf } from "@/lib/export/activity-export-format";
export {
  buildActivityExportSummary,
  getActivityEventTypeLabel,
  getActivityExportLocation,
} from "@/lib/export/activity-export-format";

export interface BuildActivityPdfOptions {
  events: ActivityEventForPdf[];
  /**
   * Display label for the scope of this export. For a single-project export
   * this is the project name ("Harbor Plaza"). For a multi-project dashboard
   * export, pass a summary like "All Projects" or "3 Projects".
   */
  projectName: string;
  filterSummary: string;
  exportedAt: Date;
  /** When set, the cover reads "Unit Activity — <unitLabel>" instead of "Activity Log" */
  unitLabel?: string;
  /**
   * Enables multi-project rendering. When present, the PDF adds a "Project"
   * column to each row, resolving each event.projectId through this map. The
   * cover title becomes "Activity Log — {projectName}" (i.e. the scope label).
   */
  projectLabelById?: Map<string, string>;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildHtml(opts: BuildActivityPdfOptions): string {
  const { events, projectName, filterSummary, exportedAt, unitLabel, projectLabelById } = opts;
  const isMultiProject = !!projectLabelById;

  // Group by calendar day (local date string)
  const dayMap = new Map<string, ActivityEventForPdf[]>();
  for (const e of events) {
    const key = new Date(e.createdAt).toLocaleDateString("en-US");
    if (!dayMap.has(key)) dayMap.set(key, []);
    dayMap.get(key)!.push(e);
  }

  const dayBlocks = Array.from(dayMap.entries())
    .map(([, dayEvents]) => {
      const rows = dayEvents.map((e) => {
        const meta = ACTIVITY_EVENT_META[e.eventType] ?? { label: e.eventType, dotColor: "#6b7280", bg: "#f9fafb" };
        const summary = esc(buildActivityExportSummary(e));
        const location = esc(getActivityExportLocation(e));
        const user = esc(e.userName ?? "—");
        const time = fmtTime(new Date(e.createdAt));
        const project = isMultiProject
          ? esc(projectLabelById.get(e.projectId ?? "") ?? e.projectId ?? "—")
          : null;

        return `
          <tr>
            <td class="td-time">${time}</td>
            <td class="td-type">
              <span class="type-badge" style="background:${meta.bg};color:${meta.dotColor};">
                <span class="type-dot" style="background:${meta.dotColor};"></span>
                ${esc(meta.label)}
              </span>
            </td>
            <td class="td-summary">
              <span class="summary">${summary}</span>
              ${location ? `<span class="location">${location}</span>` : ""}
            </td>
            ${isMultiProject ? `<td class="td-project">${project}</td>` : ""}
            <td class="td-user">${user}</td>
          </tr>`;
      }).join("\n");

      const dayLabel = fmtDay(new Date(dayEvents[0].createdAt));
      return `
        <div class="day-block">
          <div class="day-header">${esc(dayLabel)}</div>
          <table>
            <colgroup>
              <col style="width:72px">
              <col style="width:160px">
              <col>
              ${isMultiProject ? `<col style="width:140px">` : ""}
              <col style="width:100px">
            </colgroup>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Summary</th>
                ${isMultiProject ? `<th>Project</th>` : ""}
                <th>User</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11px; color: #111827; background: #fff; padding: 28px 32px; }

  /* Cover */
  .cover { border-bottom: 2px solid #1b3a5c; padding-bottom: 16px; margin-bottom: 24px; }
  .cover-title { font-size: 18px; font-weight: 700; color: #1b3a5c; }
  .cover-project { font-size: 12px; color: #1b3a5c; font-weight: 600; margin-top: 2px; opacity: 0.7; }
  .cover-sub { font-size: 12px; color: #4b5563; margin-top: 2px; }
  .cover-meta { display: flex; gap: 20px; margin-top: 10px; flex-wrap: wrap; }
  .cover-chip { background: #f3f4f6; border-radius: 6px; padding: 3px 10px; font-size: 11px; color: #374151; }
  .cover-chip strong { color: #111827; }

  /* Day blocks — allow the block and its table to flow across page breaks so
     a long day doesn't push the whole block to the next page and leave a
     blank gap at the bottom of the previous page. Instead:
       - keep the day header with its following row (no orphaned headers)
       - keep each event row intact (no mid-row splits)
       - keep the thead repeating at the top of each page as the day continues */
  .day-block { margin-bottom: 24px; }
  .day-header { font-size: 12px; font-weight: 700; color: #1b3a5c; text-transform: uppercase; letter-spacing: 0.06em; border-left: 3px solid #1b3a5c; padding-left: 8px; margin-bottom: 6px; break-after: avoid-page; }

  /* Table */
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  thead tr { background: #f9fafb; }
  tr { break-inside: avoid-page; }
  th { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; padding: 5px 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
  td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }

  .td-time { color: #6b7280; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .type-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 600; white-space: nowrap; }
  .type-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .td-summary .summary { display: block; color: #111827; }
  .td-summary .location { display: block; font-size: 10px; color: #6b7280; margin-top: 2px; }
  .td-project { color: #374151; white-space: nowrap; font-weight: 500; }
  .td-user { color: #374151; white-space: nowrap; }

  /* Footer */
  .footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="cover">
    <div class="cover-title">${unitLabel ? `Unit Activity — ${esc(unitLabel)}` : `Activity Log — ${esc(projectName)}`}</div>
    ${unitLabel ? `<div class="cover-project">${esc(projectName)}</div>` : ""}
    <div class="cover-sub">Exported ${esc(exportedAt.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }))}</div>
    <div class="cover-meta">
      <span class="cover-chip"><strong>${events.length}</strong> event${events.length !== 1 ? "s" : ""}</span>
      ${filterSummary ? `<span class="cover-chip">${esc(filterSummary)}</span>` : ""}
    </div>
  </div>

  ${dayBlocks}

  <div class="footer">
    <span>CP Build Field Tracker — ${unitLabel ? "Unit Activity" : "Activity Log"}</span>
    <span>${unitLabel ? `${esc(projectName)} · ${esc(unitLabel)}` : esc(projectName)}</span>
  </div>
</body>
</html>`;
}

// ── Puppeteer runner ──────────────────────────────────────────────────────────

export async function buildActivityPdf(opts: BuildActivityPdfOptions): Promise<Buffer> {
  const browser = await launchPdfPuppeteerBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(buildHtml(opts), { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({
      format: "Letter",
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

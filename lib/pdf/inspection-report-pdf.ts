import type { FormTemplate } from "@/components/forms/formTypes";
import { INSPECTION_CATEGORY_LABELS } from "@/components/forms/formTypes";
import { isDocumentationForm } from "@/lib/forms/form-purpose-rules";
import type { PdfImageFetchContext } from "@/lib/pdf/fetch-image-for-pdf";
import {
  buildInspectionRecordBodyInner,
  formatInspectionPdfCoverMeta,
  INSPECTION_RECORD_PDF_STYLES,
  prefetchInspectionPayloadImages,
} from "@/lib/pdf/inspection-submission-pdf";
import { isEmptyFailedOnlyExportBody } from "@/lib/inspections/inspection-failed-items-export";
import { launchPdfPuppeteerBrowser } from "@/lib/pdf/puppeteer-launch";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InspectionReportRecordForPdf {
  submissionId: string;
  seqNumber: number;
  scopeTypeName: string;
  unit: string;
  building: string;
  level: string;
  area: string;
  phase: string;
  imName: string | null;
  installTeamName: string | null;
  attemptLabel: string;
  totalDeficiencies: number;
  formName: string;
  categoryLabel: string;
  outcome: string;
  submittedAt: Date;
  submittedBy: string;
  template: FormTemplate;
  payload: Record<string, unknown>;
}

export type InspectionReportKind = "inspections" | "project_forms";

export interface BuildInspectionReportPdfOptions {
  records: InspectionReportRecordForPdf[];
  projectName: string;
  filterSummary: string;
  exportedAt: Date;
  pdfImageFetch?: PdfImageFetchContext;
  /** Defaults to "Inspections Report" or "Project Level Form Submissions" when reportKind is project_forms. */
  reportTitle?: string;
  reportKind?: InspectionReportKind;
  /** When true, each record body includes only pass/fail questions answered Fail. */
  shareOnlyFailedItems?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDateTime(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function locationLine(record: InspectionReportRecordForPdf): string {
  const parts = [
    record.building,
    record.phase,
    record.area,
    record.level,
    record.unit,
  ].filter(
    (x) =>
      x.trim().length > 0 &&
      x.trim() !== "0" &&
      x.trim() !== "—" &&
      x.trim() !== "-",
  );
  return parts.join(" · ");
}

function categoryLabelFromTemplate(template: FormTemplate): string {
  const categoryKey = template.category;
  if (categoryKey && categoryKey in INSPECTION_CATEGORY_LABELS) {
    return INSPECTION_CATEGORY_LABELS[categoryKey as keyof typeof INSPECTION_CATEGORY_LABELS];
  }
  return categoryKey ?? "—";
}

function recordHeaderHtml(
  record: InspectionReportRecordForPdf,
  reportKind: InspectionReportKind,
): string {
  const loc = locationLine(record);
  const isProjectForm = reportKind === "project_forms";
  const isDocumentation = isDocumentationForm(record.template);
  const { dateTimeLine, showCategory, categoryLabel } = formatInspectionPdfCoverMeta(
    record.template,
    record.submittedAt,
  );
  const primaryMetaLine =
    showCategory && categoryLabel ? `${categoryLabel} · ${dateTimeLine}` : dateTimeLine;

  const im = record.imName?.trim() || "—";
  const sub = record.installTeamName?.replace(/^\[SEED\]\s*/i, "").trim() || "—";
  const defLabel =
    record.totalDeficiencies === 0
      ? "No deficiencies"
      : `${record.totalDeficiencies} ${record.totalDeficiencies === 1 ? "deficiency" : "deficiencies"}`;

  const submitterLine = isProjectForm
    ? `<p class="record-meta">Submitted by: ${escHtml(record.submittedBy)}</p>`
    : `<p class="record-meta">Submitted by: ${escHtml(record.submittedBy)} · IM: ${escHtml(im)} · Sub: ${escHtml(sub)}</p>`;

  return `
    <div class="record-header">
      <div class="record-header-top">
        <span class="record-seq">#${record.seqNumber}</span>
        <span class="record-scope">${escHtml(record.scopeTypeName)}</span>
        <span class="record-attempt">${escHtml(record.attemptLabel)}</span>
        <span class="record-outcome ${record.outcome === "FAIL" ? "fail" : ""}">${escHtml(record.outcome)}</span>
      </div>
      <p class="record-title">${escHtml(record.formName)}</p>
      <p class="record-meta">${escHtml(primaryMetaLine)}</p>
      ${submitterLine}
      ${loc ? `<p class="record-meta">Location: ${escHtml(loc)}</p>` : ""}
      ${isProjectForm && isDocumentation ? "" : `<p class="record-def-count">${escHtml(defLabel)}</p>`}
    </div>`;
}

const REPORT_EXTRA_STYLES = `
  .report-cover {
    border-bottom: 2px solid #1e3a5f;
    padding-bottom: 14px;
    margin-bottom: 16px;
  }
  .report-cover-title {
    font-size: 18pt;
    font-weight: 800;
    color: #1e3a5f;
    margin: 0 0 6px;
  }
  .report-cover-sub {
    font-size: 10pt;
    color: #6b7280;
    margin: 0 0 4px;
  }
  .report-cover-filters {
    font-size: 9pt;
    color: #444;
    margin-top: 8px;
    line-height: 1.5;
  }
  .report-cover-count {
    display: inline-block;
    margin-top: 10px;
    font-size: 9pt;
    font-weight: 700;
    background: #f0f4ff;
    color: #1e3a5f;
    padding: 4px 12px;
    border-radius: 6px;
  }
  .inspection-record {
    margin-bottom: 10px;
  }
  /* Flow continuously — separate instances with a rule + header card, not a blank page */
  .inspection-record + .inspection-record {
    margin-top: 6px;
    padding-top: 12px;
    border-top: 2px solid #1e3a5f;
  }
  .inspection-record .q {
    padding: 8px 8px 10px;
    margin-bottom: 4px;
  }
  .inspection-record .sec-head {
    padding: 8px 0 4px;
  }
  .inspection-record .def {
    margin-bottom: 6px;
  }
  .inspection-record .photo-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
    margin-top: 6px;
    margin-bottom: 2px;
  }
  .inspection-record .photo-cell img {
    max-height: 2.5in;
  }
  .inspection-record .record-header {
    padding: 10px 12px;
    margin-bottom: 8px;
    border: 1px solid #93c5fd;
    border-left: 4px solid #1e3a5f;
    border-radius: 8px;
    background: #f8faff;
    break-inside: avoid;
  }
  .record-header-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .record-seq {
    font-size: 11pt;
    font-weight: 800;
    color: #1e3a5f;
  }
  .record-scope {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #374151;
    background: #eef2ff;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .record-attempt {
    font-size: 9pt;
    font-weight: 600;
    color: #6b7280;
  }
  .record-outcome {
    margin-left: auto;
    font-size: 9pt;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 999px;
    background: #ecfdf5;
    color: #166534;
  }
  .record-outcome.fail {
    background: #fef2f2;
    color: #991b1b;
  }
  .record-title {
    font-size: 14pt;
    font-weight: 800;
    margin: 0 0 4px;
    color: #111827;
  }
  .record-meta {
    font-size: 9pt;
    color: #4b5563;
    margin: 0 0 3px;
  }
  .record-def-count {
    margin: 8px 0 0;
    font-size: 9pt;
    font-weight: 700;
    color: #92400e;
  }
  .report-footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
    font-size: 8pt;
    color: #9ca3af;
    text-align: center;
  }
`;

/** Build full HTML document for bulk inspections report (testable without Puppeteer). */
export async function buildInspectionReportHtml(
  opts: BuildInspectionReportPdfOptions,
): Promise<string> {
  const {
    records,
    projectName,
    filterSummary,
    exportedAt,
    pdfImageFetch,
    reportKind = "inspections",
    shareOnlyFailedItems,
  } = opts;
  const reportTitle =
    opts.reportTitle?.trim() ||
    (reportKind === "project_forms" ? "Project Level Form Submissions" : "Inspections Report");

  const recordsHtmlParts: string[] = [];
  for (const record of records) {
    const imageCache = await prefetchInspectionPayloadImages(record.payload, pdfImageFetch);
    const bodyInner = buildInspectionRecordBodyInner(record.template, record.payload, imageCache, {
      shareOnlyFailedItems,
    });
    if (shareOnlyFailedItems && isEmptyFailedOnlyExportBody(bodyInner)) continue;

    recordsHtmlParts.push(`
      <section class="inspection-record">
        ${recordHeaderHtml(record, reportKind)}
        ${bodyInner}
      </section>`);
  }

  const exportedCount = recordsHtmlParts.length;
  const countLabel =
    reportKind === "project_forms"
      ? `${exportedCount} submission${exportedCount === 1 ? "" : "s"}`
      : `${exportedCount} inspection${exportedCount === 1 ? "" : "s"}`;

  const footerLabel =
    reportKind === "project_forms"
      ? "CP Build Command Center · Project form export"
      : "CP Build Command Center · Inspections export";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escHtml(projectName)} — ${escHtml(reportTitle)}</title>
<style>
${INSPECTION_RECORD_PDF_STYLES}
${REPORT_EXTRA_STYLES}
</style>
</head>
<body>
  <div class="report-cover">
    <p class="report-cover-sub">${escHtml(projectName)}</p>
    <h1 class="report-cover-title">${escHtml(reportTitle)}</h1>
    <p class="report-cover-sub">Exported ${escHtml(fmtDateTime(exportedAt))}</p>
    ${filterSummary.trim() ? `<p class="report-cover-filters"><strong>Filters:</strong> ${escHtml(filterSummary)}</p>` : ""}
    <span class="report-cover-count">${countLabel}</span>
  </div>
  ${recordsHtmlParts.join("")}
  <p class="report-footer">${escHtml(footerLabel)}</p>
</body>
</html>`;
}

export async function buildInspectionReportPdf(
  opts: BuildInspectionReportPdfOptions,
): Promise<Buffer> {
  const html = await buildInspectionReportHtml(opts);
  const browser = await launchPdfPuppeteerBrowser();

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(120_000);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 600));
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export { categoryLabelFromTemplate };

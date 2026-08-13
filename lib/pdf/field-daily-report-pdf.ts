import { launchPdfPuppeteerBrowser } from "@/lib/pdf/puppeteer-launch";
import { prefetchPdfImageCache, type PdfImageFetchContext } from "@/lib/pdf/fetch-image-for-pdf";
import {
  fetchPdfImageRef,
  mediaCacheKey,
  toMediaRef,
} from "@/lib/pdf/field-media-pdf-helpers";
import type {
  FieldDailyReportPdfGroupLine,
  FieldDailyReportPdfGroup,
  FieldDailyReportPdfListItem,
  FieldDailyReportPdfMediaRef,
  FieldDailyReportPdfPayload,
  FieldDailyReportPdfProjectEntry,
  FieldDailyReportPdfSection,
} from "@/lib/field-daily-report/pdf-export";

function photoGridColumnsForImageCount(imageCount: number): number {
  if (imageCount <= 1) return 1;
  return Math.min(3, imageCount);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function collectPayloadMediaRefs(payload: FieldDailyReportPdfPayload): FieldDailyReportPdfMediaRef[] {
  const refs: FieldDailyReportPdfMediaRef[] = [];
  const add = (images?: FieldDailyReportPdfMediaRef[]) => {
    if (!images?.length) return;
    refs.push(...images);
  };

  for (const project of payload.projects) {
    for (const section of project.sections) {
      for (const group of section.groups) {
        for (const line of group.lines) {
          add(line.images);
          for (const block of line.detailBlocks ?? []) {
            add(block.images);
          }
        }
      }
      for (const item of section.items) {
        add(item.images);
      }
    }
  }
  return refs;
}

export async function prefetchFieldDailyReportImages(
  payload: FieldDailyReportPdfPayload,
  pdfImageFetch?: PdfImageFetchContext,
): Promise<Map<string, string | null>> {
  const refs = collectPayloadMediaRefs(payload);
  const byKey = new Map(refs.map((ref) => [mediaCacheKey(toMediaRef(ref)), ref]));
  return prefetchPdfImageCache(Array.from(byKey.keys()), (key) =>
    fetchPdfImageRef(byKey.get(key)!, pdfImageFetch),
  );
}

function imgTag(
  ref: FieldDailyReportPdfMediaRef,
  imageCache: Map<string, string | null>,
  alt = "",
): string {
  const src = imageCache.get(mediaCacheKey(toMediaRef(ref)));
  if (!src) return "";
  return `<img src="${src}" alt="${esc(alt)}" />`;
}

function renderPhotoGrid(
  images: FieldDailyReportPdfMediaRef[] | undefined,
  imageCache: Map<string, string | null>,
  options?: { skipCaptionsMatching?: string; columns?: number; compact?: boolean },
): string {
  if (!images?.length) return "";
  const skipCaption = options?.skipCaptionsMatching?.trim().toLowerCase();
  const columns = Math.min(3, Math.max(1, options?.columns ?? 3));
  const compactClass = options?.compact ? " photo-grid--compact" : "";
  const cells = images
    .map((ref) => {
      const img = imgTag(ref, imageCache);
      if (!img) return "";
      const captionText = ref.caption?.trim();
      const showCaption =
        captionText &&
        (!skipCaption || captionText.toLowerCase() !== skipCaption);
      const caption = showCaption ? `<p class="photo-caption">${esc(captionText)}</p>` : "";
      return `<div class="photo-cell">${img}${caption}</div>`;
    })
    .filter(Boolean)
    .join("");
  if (!cells) return "";
  return `<div class="photo-grid photo-grid--${columns}${compactClass}">${cells}</div>`;
}

function renderGroupLine(line: FieldDailyReportPdfGroupLine, imageCache: Map<string, string | null>): string {
  const blockDetails = (line.detailBlocks ?? [])
    .map((block) => {
      const lines = block.lines
        .map((detail) => `<div class="line-detail">${esc(detail)}</div>`)
        .join("");
      const photos = renderPhotoGrid(block.images, imageCache, {
        skipCaptionsMatching: block.heading,
        columns: 1,
        compact: true,
      });
      return `<div class="line-detail-block">
        <div class="line-detail-text">
          <div class="line-detail-heading">${esc(block.heading)}</div>
          ${lines}
        </div>
        ${photos}
      </div>`;
    })
    .join("");

  const photos = blockDetails
    ? ""
    : renderPhotoGrid(line.images, imageCache, {
        columns: photoGridColumnsForImageCount(line.images?.length ?? 0),
      });
  const details = blockDetails
    ? blockDetails
    : (line.detailLines ?? [])
        .map((detail) => `<div class="line-detail">${esc(detail)}</div>`)
        .join("");
  return `<li>${esc(line.text)}${details}${photos}</li>`;
}

function renderBadgeStyleAttr(style?: { backgroundColor: string; color: string }): string {
  if (!style) return "";
  return ` style="background-color: ${esc(style.backgroundColor)}; color: ${esc(style.color)};"`;
}

function renderGroup(
  group: FieldDailyReportPdfGroup,
  imageCache: Map<string, string | null>,
): string {
  const lines = group.lines.map((line) => renderGroupLine(line, imageCache)).join("");
  const headingClass = group.headingStyle ? "group-heading group-heading--badge" : "group-heading";
  return `<div class="group">
    <div class="${headingClass}"${renderBadgeStyleAttr(group.headingStyle)}>${esc(group.heading)}</div>
    ${lines ? `<ul class="group-lines">${lines}</ul>` : ""}
  </div>`;
}

function renderListItem(item: FieldDailyReportPdfListItem, imageCache: Map<string, string | null>): string {
  const meta = [item.location, item.subline]
    .filter((s): s is string => Boolean(s))
    .map(esc)
    .join(" · ");
  const details = (item.detailLines ?? [])
    .map((detail) => `<div class="item-detail">${esc(detail)}</div>`)
    .join("");
  const photos = renderPhotoGrid(item.images, imageCache);
  return `<li class="list-item">
    <span class="item-headline">${esc(item.headline)}</span>
    ${meta ? `<span class="item-meta">${meta}</span>` : ""}
    ${details}
    ${photos}
  </li>`;
}

function renderSection(
  section: FieldDailyReportPdfSection,
  notesLabel: string,
  imageCache: Map<string, string | null>,
): string {
  const groupsHtml = section.groups
    .map((group) => renderGroup(group, imageCache))
    .join("");

  const itemsHtml = section.items.map((item) => renderListItem(item, imageCache)).join("");

  const noteHtml = section.note
    ? `<div class="section-note"><span class="note-label">${esc(notesLabel)}</span> ${esc(section.note)}</div>`
    : "";

  const progressHtml = section.progressDetail
    ? `<div class="progress-detail">${[
        section.progressDetail.delta
          ? `<span class="progress-delta">${esc(section.progressDetail.delta)}</span>`
          : "",
        section.progressDetail.pct
          ? `<span class="progress-pct">${esc(section.progressDetail.pct)}</span>`
          : "",
      ]
        .filter(Boolean)
        .join('<span class="progress-sep"> · </span>')}</div>`
    : "";

  const detailHtml = (section.detailLines ?? [])
    .map((line) => `<div class="section-detail">${esc(line)}</div>`)
    .join("");

  return `<section class="report-section">
    <h4 class="section-title">${esc(section.title)}</h4>
    ${progressHtml}
    ${detailHtml}
    ${groupsHtml}
    ${itemsHtml ? `<ul class="item-list">${itemsHtml}</ul>` : ""}
    ${noteHtml}
  </section>`;
}

function renderProject(
  project: FieldDailyReportPdfProjectEntry,
  notesLabel: string,
  noFieldActivity: string,
  imageCache: Map<string, string | null>,
): string {
  const sectionsHtml = project.sections
    .map((section) => renderSection(section, notesLabel, imageCache))
    .join("");
  const idleHtml = !project.hasFieldActivity
    ? `<p class="idle-line">${esc(noFieldActivity)}</p>`
    : "";
  const missingAlertsHtml = (project.missingDataAlerts ?? [])
    .map((alert) => `<div class="missing-data-alert" role="alert">${esc(alert)}</div>`)
    .join("");
  const workforceHeaderClass = project.workforceManpowerHeaderIsMissing
    ? "workforce-manpower-header workforce-manpower-header--missing"
    : "workforce-manpower-header";
  const workforceHeaderHtml = project.workforceManpowerHeaderLabel
    ? `<p class="${workforceHeaderClass}">${esc(project.workforceManpowerHeaderLabel)}</p>`
    : "";
  const otherNoteHtml = project.otherNote
    ? `<div class="section-note"><span class="note-label">${esc(notesLabel)}</span> ${esc(project.otherNote)}</div>`
    : "";

  return `<article class="project-block">
    <header class="project-header">
      <div class="project-header-row">
        <h2 class="project-name">${esc(project.projectName)}</h2>
        ${project.reportDateDisplay ? `<span class="project-date">${esc(project.reportDateDisplay)}</span>` : ""}
      </div>
      ${workforceHeaderHtml}
      <p class="activity-summary">${esc(project.activitySummary)}</p>
      ${project.exportedAtLabel ? `<p class="project-meta">${esc(project.exportedAtLabel)}</p>` : ""}
      ${project.generatedAtLabel ? `<p class="generated-at">${esc(project.generatedAtLabel)}</p>` : ""}
      ${idleHtml}
      ${missingAlertsHtml}
      ${otherNoteHtml}
    </header>
    ${sectionsHtml}
  </article>`;
}

export function buildFieldDailyReportExportHtml(
  payload: FieldDailyReportPdfPayload,
  imageCache: Map<string, string | null> = new Map(),
): string {
  const { labels, projects } = payload;

  const projectBlocks = projects
    .map((project) => renderProject(project, labels.notesLabel, labels.noFieldActivity, imageCache))
    .join("");

  return `<!DOCTYPE html>
<html lang="${esc(payload.locale)}">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11px; color: #111827; background: #fff; padding: 28px 32px; }

  .cover { border-bottom: 2px solid #1b3a5c; padding-bottom: 16px; margin-bottom: 24px; }
  .cover-title { font-size: 20px; font-weight: 700; color: #1b3a5c; }

  .project-block { margin-bottom: 28px; }
  .project-header { border-left: 4px solid #1b3a5c; padding-left: 12px; margin-bottom: 12px; }
  .project-header-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
  .project-name { font-size: 15px; font-weight: 700; color: #1b3a5c; margin-bottom: 0; flex: 1; min-width: 0; }
  .project-date { font-size: 12px; font-weight: 600; color: #4b5563; white-space: nowrap; flex-shrink: 0; }
  .activity-summary { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
  .workforce-manpower-header { font-size: 11px; font-weight: 600; color: #374151; margin-bottom: 4px; }
  .workforce-manpower-header--missing { color: #991b1b; font-weight: 700; }
  .project-meta { font-size: 11px; color: #4b5563; margin-bottom: 2px; }
  .generated-at { font-size: 10px; color: #9ca3af; margin-bottom: 4px; }
  .idle-line { font-size: 11px; color: #6b7280; font-style: italic; margin-top: 4px; }
  .missing-data-alert { margin-top: 8px; padding: 8px 10px; background: #fef2f2; border-left: 3px solid #dc2626; font-size: 10px; font-weight: 600; color: #991b1b; line-height: 1.45; }

  .report-section { margin-bottom: 14px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #1b3a5c; background: #f3f4f6; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; }
  .progress-detail { font-size: 13px; font-weight: 700; margin: 0 0 8px 2px; }
  .progress-delta { color: #111827; }
  .progress-pct { color: #15803D; }
  .progress-sep { color: #6b7280; font-weight: 600; }
  .section-detail { font-size: 13px; font-weight: 700; color: #111827; margin: 0 0 8px 2px; }
  .group { margin-bottom: 8px; }
  .group-heading { font-size: 11px; font-weight: 600; color: #374151; margin-bottom: 3px; }
  .group-heading--badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: 700; margin-bottom: 6px; }
  .group-lines, .item-list { margin: 0; padding-left: 18px; }
  .group-lines li, .item-list li { margin-bottom: 8px; color: #111827; break-inside: auto; page-break-inside: auto; }
  .group-lines li .photo-grid { margin-top: 4px; margin-bottom: 0; }
  .group-lines li .photo-grid--1 { max-width: 33%; }
  .line-detail { font-size: 10px; color: #374151; margin-top: 2px; line-height: 1.45; }
  .line-detail-block { margin-top: 6px; padding-left: 10px; border-left: 2px solid #e5e7eb; break-inside: auto; page-break-inside: auto; }
  .line-detail-text { break-inside: avoid; page-break-inside: avoid; }
  .line-detail-heading { font-size: 10px; font-weight: 700; color: #111827; margin-bottom: 2px; }
  .line-detail-block .photo-grid { margin-top: 4px; margin-bottom: 0; padding-left: 0; }
  .photo-grid--compact { max-width: 33%; grid-template-columns: 1fr; }
  .photo-grid--compact .photo-cell img { max-height: 1.35in; width: 100%; height: auto; object-fit: contain; }
  .list-item { margin-bottom: 8px; }
  .item-headline { display: block; font-weight: 600; }
  .item-meta { display: block; font-size: 10px; color: #6b7280; margin-top: 1px; }
  .item-detail { font-size: 10px; color: #374151; margin-top: 2px; line-height: 1.45; white-space: pre-wrap; }
  .section-note { margin-top: 8px; padding: 8px 10px; background: #fffbeb; border-left: 3px solid #f59e0b; font-size: 10px; color: #374151; line-height: 1.45; }
  .note-label { font-weight: 700; color: #92400e; }

  .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 6px; margin-bottom: 4px; }
  .photo-grid--1 { grid-template-columns: repeat(1, 1fr); }
  .photo-grid--2 { grid-template-columns: repeat(2, 1fr); }
  .photo-grid--3 { grid-template-columns: repeat(3, 1fr); }
  .photo-cell img { width: 100%; height: auto; border-radius: 4px; display: block; }
  .photo-caption { font-size: 9px; color: #6b7280; margin-top: 3px; line-height: 1.35; }

  .footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="cover">
    <div class="cover-title">${esc(labels.documentTitle)}</div>
  </div>

  ${projectBlocks}

  <div class="footer">
    <span>CP Build Command Center — ${esc(labels.documentTitle)}</span>
    <span>${esc(labels.confidentialFooter)}</span>
  </div>
</body>
</html>`;
}

export async function buildFieldDailyReportExportPdf(
  payload: FieldDailyReportPdfPayload,
  options?: { pdfImageFetch?: PdfImageFetchContext },
): Promise<Buffer> {
  const imageCache = await prefetchFieldDailyReportImages(payload, options?.pdfImageFetch);
  const browser = await launchPdfPuppeteerBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(buildFieldDailyReportExportHtml(payload, imageCache), {
      waitUntil: "load",
    });
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

import { resolveObservationTypePdfMeta } from "@/lib/observations/observationDisplay";
import { prefetchPdfImageCache, type PdfImageFetchContext } from "@/lib/pdf/fetch-image-for-pdf";
import type { FieldMediaReference } from "@/lib/field-media-resolve";
import {
  fetchPdfImageRef,
  mediaCacheKey,
  toMediaRef,
} from "@/lib/pdf/field-media-pdf-helpers";
import { launchPdfPuppeteerBrowser } from "@/lib/pdf/puppeteer-launch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ObsAttachment {
  id: string;
  mimeType: string;
  storageUrl: string;
  storageKey?: string | null;
  caption?: string | null;
}

interface ObsComment {
  id: string;
  body: string;
  createdAt: Date;
  author: { name: string | null; email: string };
  attachments: { id: string; mimeType: string; storageUrl: string; storageKey?: string | null }[];
}

interface ObsScopeTag {
  row: {
    building: string | null;
    level: string | null;
    unit: string | null;
    scopeType: { name: string } | null;
  };
}

export interface ObsForPdf {
  id: string;
  observationType: string;
  title: string;
  description: string;
  createdAt: Date;
  unitRef: string | null;
  author: { name: string | null; email: string };
  attachments: ObsAttachment[];
  scopeTags: ObsScopeTag[];
  comments: ObsComment[];
}

export interface BuildObsPdfOptions {
  observations: ObsForPdf[];
  projectName: string;
  /** Project site address shown in the document header (Procore-style). */
  projectAddress?: string;
  filterSummary: string;
  exportedAt: Date;
  /** When set, replaces the default "Observations Log" cover title (e.g. single-observation export). */
  coverTitle?: string;
  /** When false, omits the cover block (batched export continuation parts). Default true. */
  includeCover?: boolean;
  /** Cover count line; defaults to observations.length (use total export count on batch 1 of N). */
  coverObservationCount?: number;
  /** When true, render observations in array order (log export) instead of regrouping by location. */
  preserveObservationOrder?: boolean;
  /** Forward session cookies for same-origin field-media URLs (local dev). */
  pdfImageFetch?: PdfImageFetchContext;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseLocation(unitRef: string | null | undefined): string {
  if (!unitRef || unitRef === "||") return "Project";
  const [building, floor, unit] = unitRef.split("|");
  if (!building) return "Project";
  if (!floor)  return building;
  if (!unit)   return `${building} › Level ${floor}`;
  return `${building} › Level ${floor} › ${unit}`;
}

function fmtDateLong(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function fmtPrintedOn(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function displayOrDash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? escHtml(trimmed) : "—";
}

function authorDisplay(author: ObsForPdf["author"]): string {
  const name = author.name?.trim() || author.email.split("@")[0];
  return name;
}

function tradeLabel(obs: ObsForPdf): string {
  const names = obs.scopeTags
    .map((t) => t.row.scopeType?.name)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i) as string[];
  return names.join(", ");
}

/** Decode a storage URL basename; malformed `%` sequences must not abort PDF generation. */
export function decodeAttachmentBasename(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function attachmentFilename(a: ObsAttachment): string {
  if (a.caption?.trim()) return a.caption.trim();
  const key = a.storageKey ?? a.storageUrl;
  const base = key.split("/").pop() ?? "attachment";
  return decodeAttachmentBasename(base.split("?")[0] ?? base);
}

function metaRow(label: string, value: string | null | undefined): string {
  return `
    <div class="meta-row">
      <span class="meta-label">${escHtml(label)}</span>
      <span class="meta-value">${displayOrDash(value ?? undefined)}</span>
    </div>
  `;
}

// Group by location (project → building → level → unit), matching the log view
function groupObs(obs: ObsForPdf[]): Map<string, ObsForPdf[]> {
  const groups = new Map<string, ObsForPdf[]>();
  for (const o of obs) {
    const label = parseLocation(o.unitRef);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(o);
  }
  return groups;
}

// ── HTML template ─────────────────────────────────────────────────────────────

async function buildHtml(opts: BuildObsPdfOptions): Promise<string> {
  const {
    observations,
    projectName,
    projectAddress = "",
    filterSummary,
    exportedAt,
    coverTitle = "Observations Log",
    includeCover = true,
    coverObservationCount,
    preserveObservationOrder = false,
    pdfImageFetch,
  } = opts;
  const coverCount = coverObservationCount ?? observations.length;
  const groups = preserveObservationOrder ? null : groupObs(observations);

  // Pre-fetch observation + comment images via storageKey (falls back to signed URLs).
  const allImageRefs = observations.flatMap((o) => [
    ...o.attachments.filter((a) => a.mimeType.startsWith("image/")).map(toMediaRef),
    ...o.comments.flatMap((c) =>
      c.attachments.filter((a) => a.mimeType.startsWith("image/")).map(toMediaRef),
    ),
  ]);
  const refByKey = new Map(allImageRefs.map((ref) => [mediaCacheKey(ref), ref]));
  const imageCache = await prefetchPdfImageCache(Array.from(refByKey.keys()), (key) =>
    fetchPdfImageRef(refByKey.get(key)!, pdfImageFetch),
  );

  function imgTag(ref: FieldMediaReference): string {
    const src = imageCache.get(mediaCacheKey(ref));
    if (!src) {
      return `<div style="background:#f3f4f6;border-radius:4px;display:flex;align-items:center;justify-content:center;min-height:60px;font-size:10px;color:#9ca3af;padding:8px;text-align:center;">Image unavailable</div>`;
    }
    return `<img src="${src}" style="width:100%;height:auto;border-radius:4px;display:block;" />`;
  }

  function renderCommentMedia(attachments: ObsComment["attachments"]): string {
    const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
    const videos = attachments.filter((a) => a.mimeType.startsWith("video/"));
    const audios = attachments.filter((a) => a.mimeType.startsWith("audio/"));
    const parts: string[] = [];
    if (videos.length > 0) parts.push(`🎥 ${videos.length} video${videos.length > 1 ? "s" : ""}`);
    if (audios.length > 0) parts.push(`🎧 ${audios.length} audio${audios.length > 1 ? "s" : ""}`);
    const badgeHtml =
      parts.length > 0 ? `<span class="media-badge">${parts.join(" · ")}</span>` : "";
    const imgHtml =
      images.length > 0
        ? `<div class="photo-grid" style="margin-top:6px;">${images
            .map((a) => `<div class="photo-cell">${imgTag(toMediaRef(a))}</div>`)
            .join("")}</div>`
        : "";
    return imgHtml + badgeHtml;
  }

  function renderObs(obs: ObsForPdf, sequence: number): string {
    const typeMeta = resolveObservationTypePdfMeta(obs.observationType);
    const images   = obs.attachments.filter((a) => a.mimeType.startsWith("image/"));
    const location = parseLocation(obs.unitRef);
    const displayTitle = obs.title || obs.description || "Observation";
    const description =
      obs.title && obs.description && obs.description !== obs.title ? obs.description : obs.description || "";
    const createdBy = authorDisplay(obs.author);
    const trade = tradeLabel(obs);

    const photoHtml = images.length > 0
      ? `<div class="attachments-section">
          <h2 class="section-heading">Attachments</h2>
          <div class="photo-grid">
            ${images.map((a) => `
              <div class="photo-cell">
                ${imgTag(toMediaRef(a))}
                <p class="attachment-name">${escHtml(attachmentFilename(a))}</p>
              </div>
            `).join("")}
          </div>
        </div>`
      : "";

    const commentsHtml = obs.comments.length > 0
      ? `<div class="comments-section">
          <h2 class="section-heading">Comments (${obs.comments.length})</h2>
          ${obs.comments.map((c) => `
            <div class="comment-row">
              <span class="comment-meta">${escHtml(authorDisplay(c.author))} · ${fmtDateTime(new Date(c.createdAt))}</span>
              <span class="comment-body">${escHtml(c.body)}</span>
              ${renderCommentMedia(c.attachments)}
            </div>
          `).join("")}
        </div>`
      : "";

    return `
      <div class="obs-page">
        <div class="doc-header">
          <div class="brand-block">
            <p class="brand-title">CP BUILD</p>
            <p class="brand-sub">ENTERPRISES</p>
          </div>
          <div class="project-block">
            <p><span class="project-label">Project:</span> ${escHtml(projectName)}</p>
            <p><span class="project-label">Address:</span> ${displayOrDash(projectAddress)}</p>
          </div>
        </div>

        <h1 class="obs-main-title">${escHtml(`${typeMeta.label} Observation #${sequence}: ${displayTitle}`)}</h1>

        <div class="meta-grid">
          <div class="meta-col">
            ${metaRow("Origin", "Command Center")}
            ${metaRow("Created By", createdBy)}
            ${metaRow("Assignee", "")}
            ${metaRow("Notification Date", "")}
            ${metaRow("Location", location === "Project" ? "" : location)}
            ${metaRow("Due Date", "")}
            ${metaRow("Contributing Condition", "")}
            ${metaRow("Hazard", obs.observationType === "SAFETY" ? typeMeta.label : "")}
            ${metaRow("Spec Section", "")}
            ${metaRow("Description", description)}
            ${metaRow("Linked Drawings", "")}
          </div>
          <div class="meta-col">
            ${metaRow("Status", "Open")}
            ${metaRow("Date Created", fmtDateLong(new Date(obs.createdAt)))}
            ${metaRow("Distribution", "")}
            ${metaRow("Priority", "")}
            ${metaRow("Trade", trade)}
            ${metaRow("Private", "No")}
            ${metaRow("Contributing Behavior", "")}
          </div>
        </div>

        ${photoHtml}
        ${commentsHtml}
      </div>
    `;
  }

  // Log exports preserve on-screen order; filter-only exports group by location.
  let groupsHtml = "";
  let sequence = 0;
  if (preserveObservationOrder) {
    groupsHtml = observations
      .map((obs) => {
        sequence += 1;
        return renderObs(obs, sequence);
      })
      .join("");
  } else {
    for (const [label, items] of groups!) {
      groupsHtml += `
      <div class="group-section">
        <div class="group-heading">${escHtml(label)}</div>
        ${items.map((obs) => {
          sequence += 1;
          return renderObs(obs, sequence);
        }).join("")}
      </div>
    `;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 9pt;
    color: #222;
    background: #fff;
    padding: 20px 24px;
    line-height: 1.4;
  }

  /* ── Cover block ── */
  .cover {
    padding: 14px 16px 12px;
    margin-bottom: 16px;
    border-bottom: 2px solid #1e3a5f;
  }
  .cover-project {
    font-size: 8pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #888;
    margin-bottom: 3px;
  }
  .cover-title {
    font-size: 18pt;
    font-weight: 700;
    color: #1e3a5f;
  }
  .cover-sub {
    font-size: 9pt;
    color: #666;
    margin-top: 4px;
  }
  .cover-filters {
    margin-top: 8px;
    font-size: 9pt;
    color: #444;
  }
  .cover-count {
    display: inline-block;
    margin-top: 8px;
    font-size: 9pt;
    font-weight: 600;
    background: #f0f4ff;
    color: #1e3a5f;
    padding: 3px 10px;
    border-radius: 4px;
  }

  /* ── Group headings ── */
  .group-section { margin-bottom: 16px; }
  .group-heading {
    font-size: 10pt;
    font-weight: 700;
    color: #1e3a5f;
    background: #f4f6fb;
    padding: 5px 10px;
    border-radius: 4px;
    margin-bottom: 10px;
    border-left: 3px solid #1e3a5f;
  }

  /* ── Procore-style observation page ── */
  .obs-page {
    border: 1px solid #d8dde6;
    border-radius: 4px;
    padding: 16px 18px 20px;
    margin-bottom: 14px;
    background: #fff;
    break-inside: avoid-page;
    page-break-inside: avoid;
  }

  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid #d8dde6;
  }
  .brand-block { flex-shrink: 0; }
  .brand-title {
    font-size: 14pt;
    font-weight: 800;
    letter-spacing: 0.04em;
    color: #1e3a5f;
    line-height: 1.05;
  }
  .brand-sub {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #1e3a5f;
    margin-top: 2px;
  }
  .project-block {
    text-align: right;
    font-size: 8.5pt;
    color: #333;
    line-height: 1.45;
  }
  .project-label { font-weight: 700; }

  .obs-main-title {
    font-size: 13pt;
    font-weight: 700;
    color: #111;
    margin: 0 0 12px;
    line-height: 1.35;
    padding-bottom: 10px;
    border-bottom: 1px solid #e2e6ed;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 24px;
    margin-bottom: 14px;
  }
  .meta-col { display: flex; flex-direction: column; gap: 0; }
  .meta-row {
    display: grid;
    grid-template-columns: 130px 1fr;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid #eef1f5;
    font-size: 8.5pt;
    line-height: 1.4;
    break-inside: avoid;
  }
  .meta-label {
    font-weight: 700;
    color: #333;
  }
  .meta-value {
    color: #222;
    white-space: pre-wrap;
  }

  .section-heading {
    font-size: 10pt;
    font-weight: 700;
    color: #111;
    margin: 12px 0 8px;
    padding-top: 4px;
    border-top: 1px solid #e2e6ed;
  }

  .attachments-section { margin-top: 4px; }

  /* ── Comments ── */
  .comments-section {
    margin-top: 8px;
    margin-bottom: 4px;
    background: #f8faff;
    border: 1px solid #dde3f0;
    border-left: 3px solid #4a6fa5;
    border-radius: 4px;
    padding: 8px 10px;
  }
  .comment-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 5px 0;
    border-bottom: 1px solid #e8ecf5;
  }
  .comment-row:last-child { border-bottom: none; padding-bottom: 0; }
  .comment-meta {
    font-size: 7.5pt;
    font-weight: 600;
    color: #6b7a9a;
  }
  .comment-body {
    font-size: 8.5pt;
    color: #333;
    line-height: 1.45;
    white-space: pre-wrap;
  }
  .media-badge {
    font-size: 7.5pt;
    color: #666;
    background: #f5f5f5;
    padding: 1px 6px;
    border-radius: 3px;
    margin-top: 2px;
    display: inline-block;
  }

  /* ── Photo grid: 2 columns so images are large enough to read watermarks ── */
  .photo-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: 10px;
    margin-bottom: 8px;
  }
  .photo-cell img {
    width: 100%;
    height: auto;
    border-radius: 4px;
    display: block;
  }
  .attachment-name {
    font-size: 7pt;
    color: #2563eb;
    margin-top: 4px;
    text-align: center;
    word-break: break-all;
  }
  .caption {
    font-size: 7pt;
    color: #777;
    margin-top: 2px;
    text-align: center;
  }

  @media print {
    body { padding: 12px 16px; }
    .obs-page { break-inside: avoid-page; }
  }
</style>
</head>
<body>

  ${includeCover ? `<!-- Cover block -->
  <div class="cover">
    <p class="cover-project">${escHtml(projectName)}</p>
    <p class="cover-title">${escHtml(coverTitle)}</p>
    <p class="cover-sub">Exported ${fmtDateTime(exportedAt)}</p>
    ${filterSummary ? `<p class="cover-filters">Filters: ${escHtml(filterSummary)}</p>` : ""}
    <span class="cover-count">${coverCount} observation${coverCount !== 1 ? "s" : ""}</span>
  </div>` : ""}

  ${groupsHtml}

</body>
</html>`;
}

// ── Puppeteer runner ──────────────────────────────────────────────────────────

export async function buildObsPdf(opts: BuildObsPdfOptions): Promise<Buffer> {
  const html = await buildHtml(opts);
  const printedOn = fmtPrintedOn(opts.exportedAt);
  console.log(`[buildObsPdf] HTML built, ${opts.observations.length} observations, ${html.length} chars`);

  console.log("[buildObsPdf] launching browser…");
  const browser = await launchPdfPuppeteerBrowser();
  console.log("[buildObsPdf] browser launched");

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(50_000);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 500));
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `
        <div style="width:100%;font-size:8px;padding:0 0.45in;font-family:Arial,sans-serif;color:#666;display:flex;justify-content:space-between;align-items:center;">
          <span></span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          <span style="text-align:right;">Printed On: ${escHtml(printedOn)}</span>
        </div>`,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.75in", left: "0.5in" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

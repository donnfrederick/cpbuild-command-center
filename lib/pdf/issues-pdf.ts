import { prefetchPdfImageCache, type PdfImageFetchContext } from "@/lib/pdf/fetch-image-for-pdf";
import type { FieldMediaReference } from "@/lib/field-media-resolve";
import {
  fetchPdfImageRef,
  mediaCacheKey,
  toMediaRef,
} from "@/lib/pdf/field-media-pdf-helpers";
import { launchPdfPuppeteerBrowser } from "@/lib/pdf/puppeteer-launch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommentAttachment {
  id: string;
  mimeType: string;
  storageUrl: string;
  storageKey?: string | null;
}

interface IssueComment {
  id: string;
  body: string;
  createdAt: Date;
  author: { name: string | null; email: string };
  attachments: CommentAttachment[];
}

interface IssueAttachment {
  id: string;
  mimeType: string;
  storageUrl: string;
  storageKey?: string | null;
  caption?: string | null;
}

interface ScopeTag {
  row: {
    building: string | null;
    level: string | null;
    unit: string | null;
    scopeType: { name: string } | null;
  };
}

interface SubScopeTag {
  subScopeInstance: {
    subScope: { name: string };
    row: { scopeType: { name: string } | null };
  };
}

export interface IssueForPdf {
  id: string;
  issueType: string;
  shortDescription: string;
  notes: string | null;
  isBlockingWork: boolean;
  status: string;
  responsibleParty: string;
  responsibleParties?: string[];
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  unitRef: string | null;
  createdBy: { name: string | null; email: string };
  resolvedBy: { name: string | null; email: string } | null;
  attachments: IssueAttachment[];
  scopeTags: ScopeTag[];
  subScopeTags: SubScopeTag[];
  comments: IssueComment[];
}

export interface BuildIssuesPdfOptions {
  issues: IssueForPdf[];
  projectName: string;
  filterSummary: string;
  exportedAt: Date;
  /**
   * When set, replaces the default `${projectName} — Issues Log` cover title line
   * (e.g. single-issue / blocking-issue detail export).
   */
  coverTitleLine?: string;
  /** Forward session cookies for same-origin field-media URLs (local dev). */
  pdfImageFetch?: PdfImageFetchContext;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ISSUE_TYPE_LABELS: Record<string, string> = {
  SUBSTRATE_CONDITION: "Substrate Condition",
  DAMAGED_MATERIALS: "Damaged Materials",
  MISSING_MATERIALS: "Missing Materials",
  TRADE_DAMAGE_REPAIR: "Trade Damage Repair",
  OTHER: "Other",
};

function fmtParty(p: string): string {
  return p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function ageLabel(issue: IssueForPdf): string {
  if (issue.status === "RESOLVED" && issue.resolvedAt) {
    return `Resolved ${fmtDate(issue.resolvedAt)}`;
  }
  const d = daysSince(issue.createdAt);
  return d === 0 ? "Today" : d === 1 ? "1 day open" : `${d} days open`;
}

function buildScopePills(issue: IssueForPdf): string[] {
  const subsByScope: Record<string, string[]> = {};
  for (const st of issue.subScopeTags) {
    const scopeName = st.subScopeInstance.row.scopeType?.name ?? "?";
    (subsByScope[scopeName] ??= []).push(st.subScopeInstance.subScope.name);
  }
  const pills: string[] = [];
  for (const st of issue.scopeTags) {
    const scopeName = st.row.scopeType?.name;
    if (!scopeName) continue;
    const subs = subsByScope[scopeName];
    if (subs && subs.length > 0) {
      for (const sub of subs) pills.push(`${scopeName}: ${sub}`);
    } else {
      pills.push(scopeName);
    }
  }
  return pills;
}

function groupIssues(issues: IssueForPdf[]) {
  const groups: Map<string, { label: string; issues: IssueForPdf[] }> = new Map();

  for (const issue of issues) {
    const parts = issue.unitRef?.split("|") ?? [];
    const building = issue.scopeTags[0]?.row.building ?? parts[0] ?? "";
    const level = issue.scopeTags[0]?.row.level ?? parts[1] ?? "";
    const unit = issue.scopeTags[0]?.row.unit ?? parts[2] ?? issue.unitRef ?? "";

    let label: string;
    if (building && level && unit) {
      label = `${building} › ${level} › ${unit}`;
    } else if (building && level) {
      label = `${building} › ${level}`;
    } else if (building) {
      label = building;
    } else {
      label = "Project-wide";
    }

    const key = label;
    if (!groups.has(key)) groups.set(key, { label, issues: [] });
    groups.get(key)!.issues.push(issue);
  }

  return Array.from(groups.values());
}

// ── HTML template ─────────────────────────────────────────────────────────────

async function buildHtml(opts: BuildIssuesPdfOptions): Promise<string> {
  const { issues, projectName, filterSummary, exportedAt, coverTitleLine, pdfImageFetch } = opts;
  const coverMainTitle = coverTitleLine ?? `${projectName} — Issues Log`;
  const groups = groupIssues(issues);

  // Pre-fetch issue + comment images via storageKey (falls back to signed URLs).
  const allImageRefs = issues.flatMap((i) => [
    ...i.attachments.filter((a) => a.mimeType.startsWith("image/")).map(toMediaRef),
    ...i.comments.flatMap((c) =>
      c.attachments.filter((a) => a.mimeType.startsWith("image/")).map(toMediaRef),
    ),
  ]);
  const refByKey = new Map(allImageRefs.map((ref) => [mediaCacheKey(ref), ref]));
  const imageCache = await prefetchPdfImageCache(Array.from(refByKey.keys()), (key) =>
    fetchPdfImageRef(refByKey.get(key)!, pdfImageFetch),
  );

  function imgTag(ref: FieldMediaReference, style = ""): string {
    const src = imageCache.get(mediaCacheKey(ref));
    // If base64 fetch failed, render a placeholder rather than an external URL.
    // External URLs inside Puppeteer can cause page.setContent to hang.
    if (!src) {
      return `<div style="${style}background:var(--neutral-100,#f3f4f6);border-radius:4px;display:flex;align-items:center;justify-content:center;min-height:60px;font-size:11px;color:#9ca3af;">Image unavailable</div>`;
    }
    return `<img src="${src}" style="${style}" />`;
  }

  function renderCommentMedia(attachments: CommentAttachment[]): string {
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
            .map((a) =>
              `<div class="photo-cell">${imgTag(toMediaRef(a), "width:100%;height:auto;border-radius:4px;")}</div>`,
            )
            .join("")}</div>`
        : "";
    return imgHtml + badgeHtml;
  }

  function renderIssue(issue: IssueForPdf): string {
    const isResolved = issue.status === "RESOLVED";
    const images = issue.attachments.filter((a) => a.mimeType.startsWith("image/"));
    const typeMeta = ISSUE_TYPE_LABELS[issue.issueType] ?? issue.issueType;
    const pills = buildScopePills(issue);
    const authorName = issue.createdBy.name ?? issue.createdBy.email.split("@")[0];
    const resolverName = issue.resolvedBy
      ? (issue.resolvedBy.name ?? issue.resolvedBy.email.split("@")[0])
      : null;

    // Photo grid: 2 per row (~3.5in each on A4) — large enough to read watermarks
    const photoHtml = images.length > 0
      ? `<div class="photo-grid">
          ${images.map((a) => `
            <div class="photo-cell">
              ${imgTag(toMediaRef(a), "width:100%;height:auto;border-radius:4px;")}
              ${a.caption ? `<p class="caption">${escHtml(a.caption)}</p>` : ""}
            </div>
          `).join("")}
        </div>`
      : "";

    const commentsHtml = issue.comments.length > 0
      ? `<div class="comments-section">
          <p class="comments-heading">💬 Comments (${issue.comments.length})</p>
          ${issue.comments.map((c) => `
            <div class="comment-row">
              <span class="comment-meta">${escHtml(c.author.name ?? c.author.email.split("@")[0])} · ${fmtDateTime(new Date(c.createdAt))}</span>
              <span class="comment-body">${escHtml(c.body)}</span>
              ${renderCommentMedia(c.attachments)}
            </div>
          `).join("")}
        </div>`
      : "";

    const notesHtml = issue.notes
      ? `<p class="issue-notes"><strong>Notes:</strong> ${escHtml(issue.notes)}</p>`
      : "";

    const resolutionHtml = isResolved
      ? `<div class="resolution-block">
          <span class="resolved-badge">✓ Resolved</span>
          ${resolverName ? `<span class="resolution-meta">by ${escHtml(resolverName)}${issue.resolvedAt ? ` · ${fmtDate(new Date(issue.resolvedAt))}` : ""}</span>` : ""}
          ${issue.resolutionNote ? `<p class="resolution-note">${escHtml(issue.resolutionNote)}</p>` : ""}
        </div>`
      : "";

    return `
      <div class="issue-card${isResolved ? " resolved" : ""}">
        <div class="issue-header">
          <span class="type-label">${escHtml(typeMeta)}</span>
          ${issue.isBlockingWork && !isResolved ? `<span class="blocking-badge">⚠ Blocking</span>` : ""}
          <span class="age-label">${escHtml(ageLabel(issue))}</span>
        </div>

        <p class="issue-title">${escHtml(issue.shortDescription)}</p>

        <div class="issue-meta">
          <span>👤 ${escHtml(authorName)} · ${fmtDate(new Date(issue.createdAt))}</span>
          <span>Responsible: <strong>${escHtml(
            (issue.responsibleParties && issue.responsibleParties.length > 0
              ? issue.responsibleParties
              : [issue.responsibleParty]
            ).map(fmtParty).join(", "),
          )}</strong></span>
        </div>

        ${pills.length > 0 ? `<div class="scope-pills">${pills.map((p) => `<span class="scope-pill">${escHtml(p)}</span>`).join("")}</div>` : ""}
        ${notesHtml}
        ${resolutionHtml}
        ${commentsHtml}
        ${photoHtml}
      </div>
    `;
  }

  const groupsHtml = groups.map((group) => `
    <div class="group-section">
      <h3 class="group-heading">${escHtml(group.label)}</h3>
      ${group.issues.map(renderIssue).join("")}
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 10pt;
    color: #1a1a1a;
    background: #fff;
    padding: 24px 28px;
  }

  /* ── Cover block ── */
  .cover {
    border-bottom: 2px solid #1e3a5f;
    padding-bottom: 14px;
    margin-bottom: 22px;
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
  .group-section { margin-bottom: 10px; }
  .group-heading {
    font-size: 10pt;
    font-weight: 700;
    color: #1e3a5f;
    background: #f4f6fb;
    padding: 5px 10px;
    border-radius: 4px;
    margin-bottom: 6px;
    border-left: 3px solid #1e3a5f;
  }

  /* ── Issue card ── */
  /* No break-inside: avoid — with large images it causes huge blank gaps.
     Cards are allowed to split across pages; only the header is protected. */
  .issue-card {
    border: 1px solid #e2e6ed;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
    background: #fff;
  }
  .issue-card.resolved {
    border-color: #d1fae5;
    background: #f9fffe;
  }

  .issue-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 5px;
    flex-wrap: wrap;
    break-inside: avoid;
  }
  .type-label {
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #888;
  }
  .blocking-badge {
    font-size: 8pt;
    font-weight: 700;
    background: #dc2626;
    color: #fff;
    padding: 2px 7px;
    border-radius: 3px;
  }
  .age-label {
    font-size: 8pt;
    color: #999;
    margin-left: auto;
  }

  .issue-title {
    font-size: 12pt;
    font-weight: 700;
    color: #111;
    margin-bottom: 5px;
    line-height: 1.3;
  }
  .issue-card.resolved .issue-title { color: #666; }

  .issue-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 8.5pt;
    color: #555;
    margin-bottom: 6px;
  }

  /* ── Scope pills ── */
  .scope-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 6px;
  }
  .scope-pill {
    font-size: 7.5pt;
    padding: 2px 7px;
    border-radius: 99px;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #e2e8f0;
  }

  /* ── Notes ── */
  .issue-notes {
    font-size: 8.5pt;
    color: #444;
    margin-bottom: 6px;
    line-height: 1.4;
  }

  /* ── Resolution block ── */
  .resolution-block {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .resolved-badge {
    font-size: 8pt;
    font-weight: 700;
    background: #dcfce7;
    color: #166534;
    padding: 2px 8px;
    border-radius: 3px;
  }
  .resolution-meta {
    font-size: 8pt;
    color: #555;
  }
  .resolution-note {
    font-size: 8.5pt;
    color: #444;
    font-style: italic;
    margin-top: 4px;
    padding: 4px 8px;
    background: #f0fdf4;
    border-left: 3px solid #86efac;
    border-radius: 2px;
  }

  /* ── Photo grid ── */
  /* 2 columns so each image is ~3.5in wide on A4 — large enough for watermarks */
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
  .caption {
    font-size: 7pt;
    color: #777;
    margin-top: 2px;
    text-align: center;
  }

  /* ── Comments ── */
  .comments-section {
    margin-top: 12px;
    margin-bottom: 4px;
    background: #f8faff;
    border: 1px solid #dde3f0;
    border-left: 3px solid #4a6fa5;
    border-radius: 4px;
    padding: 8px 10px;
  }
  .comments-heading {
    font-size: 7.5pt;
    font-weight: 700;
    color: #4a6fa5;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 7px;
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

  @media print {
    body { padding: 12px 16px; }
    /* Cards are allowed to break across pages — avoids blank-page gaps with large images */
    .issue-header { break-inside: avoid; }
  }
</style>
</head>
<body>

  <!-- Cover block -->
  <div class="cover">
    <div class="cover-title">${escHtml(coverMainTitle)}</div>
    <div class="cover-sub">Exported ${fmtDateTime(exportedAt)}</div>
    ${filterSummary ? `<div class="cover-filters">Filters: ${escHtml(filterSummary)}</div>` : ""}
    <div class="cover-count">${issues.length} issue${issues.length !== 1 ? "s" : ""}</div>
  </div>

  <!-- Issue groups -->
  ${groupsHtml}

</body>
</html>`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Puppeteer runner ──────────────────────────────────────────────────────────

export async function buildIssuesPdf(opts: BuildIssuesPdfOptions): Promise<Buffer> {
  const html = await buildHtml(opts);
  console.log(`[buildIssuesPdf] HTML built, ${opts.issues.length} issues, ${html.length} chars`);

  console.log("[buildIssuesPdf] launching browser…");
  const browser = await launchPdfPuppeteerBrowser();
  console.log("[buildIssuesPdf] browser launched");

  try {
    const page = await browser.newPage();
    // All images are embedded as base64 data URIs, so there are no external
    // network requests to wait for. "domcontentloaded" avoids hanging when a
    // fallback <img src="..."> tries to load an external URL that's slow or blocked.
    page.setDefaultTimeout(50_000);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    // Brief pause to let any synchronous rendering finish (fonts, CSS)
    await new Promise((r) => setTimeout(r, 500));
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

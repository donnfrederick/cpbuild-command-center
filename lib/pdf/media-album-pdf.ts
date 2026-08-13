import { prefetchPdfImageCache, type PdfImageFetchContext } from "@/lib/pdf/fetch-image-for-pdf";
import {
  fetchPdfImageRef,
  mediaCacheKey,
  toMediaRef,
} from "@/lib/pdf/field-media-pdf-helpers";
import { launchPdfPuppeteerBrowser } from "@/lib/pdf/puppeteer-launch";
import type { AlbumItem, AlbumSourceType } from "@/lib/media/album-types";
import type { MediaExportLocationEntry } from "@/lib/media/media-export-types";

export interface MediaAlbumLocationBlock {
  location: MediaExportLocationEntry;
  items: AlbumItem[];
}

export interface BuildMediaAlbumPdfOptions {
  projectName: string;
  filterSummary: string;
  exportedAt: Date;
  coverTitle?: string;
  locations: MediaAlbumLocationBlock[];
  sourceLabels: Record<AlbumSourceType, string>;
  standaloneSectionTitle?: string;
  customLocationBadge?: string;
  pdfImageFetch?: PdfImageFetchContext;
  onRenderProgress?: (update: {
    subphase: "images" | "pdf";
    imagesLoaded?: number;
    imagesTotal?: number;
  }) => void;
  signal?: AbortSignal;
}

const SOURCE_BADGE_COLORS: Record<AlbumSourceType, string> = {
  observation: "#2E5C8A",
  observation_comment: "#4A7BA7",
  issue: "#DC2626",
  issue_comment: "#EF4444",
  inspection: "#15803D",
  general: "#6B7280",
  status_update: "#16A34A",
};

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

function fmtItemDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface BuildingGroup {
  buildingKey: string;
  buildingLabel: string;
  buildingCustom: MediaAlbumLocationBlock[];
  levels: LevelGroup[];
}

interface LevelGroup {
  levelKey: string;
  levelLabel: string;
  locations: MediaAlbumLocationBlock[];
}

function groupLocationsForPdf(blocks: MediaAlbumLocationBlock[]): {
  standalone: MediaAlbumLocationBlock[];
  buildings: BuildingGroup[];
} {
  const standalone = blocks.filter((b) => b.location.kind === "standalone_custom");
  const byBuilding = new Map<string, BuildingGroup>();

  for (const block of blocks) {
    if (block.location.kind === "standalone_custom") continue;
    const bKey = block.location.buildingKey ?? "—";
    const bLabel = block.location.buildingLabel ?? bKey;
    if (!byBuilding.has(bKey)) {
      byBuilding.set(bKey, {
        buildingKey: bKey,
        buildingLabel: bLabel,
        buildingCustom: [],
        levels: [],
      });
    }
    const group = byBuilding.get(bKey)!;

    if (block.location.kind === "building_custom" && !block.location.levelKey) {
      group.buildingCustom.push(block);
      continue;
    }

    const lKey = block.location.levelKey ?? "—";
    const lLabel = block.location.levelLabel ?? lKey;
    let level = group.levels.find((lvl) => lvl.levelKey === lKey);
    if (!level) {
      level = { levelKey: lKey, levelLabel: lLabel, locations: [] };
      group.levels.push(level);
    }
    level.locations.push(block);
  }

  return {
    standalone,
    buildings: Array.from(byBuilding.values()),
  };
}

async function buildHtml(opts: BuildMediaAlbumPdfOptions): Promise<string> {
  const {
    projectName,
    filterSummary,
    exportedAt,
    coverTitle = "Media Export",
    locations,
    sourceLabels,
    standaloneSectionTitle = "Project-wide custom locations",
    customLocationBadge = "Custom",
    pdfImageFetch,
    onRenderProgress,
    signal,
  } = opts;

  function throwIfAborted(): void {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  }

  const totalItems = locations.reduce((sum, block) => sum + block.items.length, 0);
  const { standalone, buildings } = groupLocationsForPdf(locations);

  const imageItems = locations.flatMap((block) =>
    block.items.filter((item) => item.mimeType.startsWith("image/")),
  );
  const refByKey = new Map(
    imageItems.map((item) => [mediaCacheKey(toMediaRef(item)), toMediaRef(item)]),
  );
  const imageKeys = Array.from(refByKey.keys());
  onRenderProgress?.({ subphase: "images", imagesLoaded: 0, imagesTotal: imageKeys.length });

  const imageCache = await prefetchPdfImageCache(
    imageKeys,
    (key) => fetchPdfImageRef(refByKey.get(key)!, pdfImageFetch),
    undefined,
    (completed, total) => {
      throwIfAborted();
      onRenderProgress?.({ subphase: "images", imagesLoaded: completed, imagesTotal: total });
    },
  );
  throwIfAborted();

  function imgTag(item: AlbumItem): string {
    if (!item.mimeType.startsWith("image/")) {
      return `<div class="media-placeholder">🎥 Video</div>`;
    }
    const src = imageCache.get(mediaCacheKey(toMediaRef(item)));
    if (!src) {
      return `<div class="media-placeholder">Image unavailable</div>`;
    }
    return `<img src="${src}" alt="" />`;
  }

  function sourceBadge(type: AlbumSourceType): string {
    const label = sourceLabels[type] ?? type;
    const color = SOURCE_BADGE_COLORS[type] ?? "#6B7280";
    return `<span class="source-badge" style="background:${color}">${escHtml(label)}</span>`;
  }

  function renderLocationBlock(block: MediaAlbumLocationBlock): string {
    const { location, items } = block;
    if (items.length === 0) return "";

    const cards = items
      .map((item) => {
        const caption = item.caption?.trim();
        const sourceLabel = item.source.label?.trim();
        const metaParts = [fmtItemDate(item.createdAt)];
        if (sourceLabel) metaParts.push(sourceLabel);

        return `
          <figure class="media-card">
            <div class="media-frame">${imgTag(item)}</div>
            <figcaption>
              ${sourceBadge(item.source.type)}
              ${caption ? `<p class="media-caption">${escHtml(caption)}</p>` : ""}
              <p class="media-meta">${escHtml(metaParts.join(" · "))}</p>
            </figcaption>
          </figure>
        `;
      })
      .join("");

    const kindBadge =
      location.kind !== "unit"
        ? `<span class="location-kind">${escHtml(customLocationBadge)}</span>`
        : "";

    return `
      <div class="location-block">
        <div class="location-header">
          <div class="location-heading">
            <h3 class="location-title">${escHtml(location.label)}${kindBadge}</h3>
            ${
              location.detailLine?.trim()
                ? `<p class="location-detail">${escHtml(location.detailLine.trim())}</p>`
                : ""
            }
          </div>
          <span class="location-count">${items.length} item${items.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="media-grid">${cards}</div>
      </div>
    `;
  }

  const standaloneHtml =
    standalone.length > 0
      ? `
      <section class="section-block">
        <h2 class="section-title">${escHtml(standaloneSectionTitle)}</h2>
        ${standalone.map(renderLocationBlock).join("")}
      </section>`
      : "";

  const buildingsHtml = buildings
    .map((building) => {
      const buildingCustomHtml = building.buildingCustom.map(renderLocationBlock).join("");
      const levelsHtml = building.levels
        .map(
          (level) => `
          <div class="level-block">
            <h3 class="level-title">${escHtml(level.levelLabel)}</h3>
            ${level.locations.map(renderLocationBlock).join("")}
          </div>
        `,
        )
        .join("");

      return `
        <section class="section-block building-section">
          <div class="building-banner">
            <span class="building-label">Building</span>
            <h2 class="building-title">${escHtml(building.buildingLabel)}</h2>
          </div>
          ${buildingCustomHtml}
          ${levelsHtml}
        </section>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9pt;
    color: #1f2937;
    line-height: 1.45;
    padding: 0;
  }
  .cover {
    text-align: center;
    padding: 48px 24px 56px;
    border-bottom: 3px solid #2E5C8A;
    margin-bottom: 28px;
    break-after: page;
  }
  .cover-project {
    font-size: 11pt;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8px;
  }
  .cover-title {
    font-size: 22pt;
    font-weight: 700;
    color: #2E5C8A;
    margin-bottom: 6px;
  }
  .cover-sub { font-size: 9pt; color: #6b7280; margin-bottom: 12px; }
  .cover-filters {
    font-size: 8.5pt;
    color: #374151;
    max-width: 480px;
    margin: 0 auto 16px;
    line-height: 1.5;
  }
  .cover-stats {
    display: inline-flex;
    gap: 16px;
    margin-top: 8px;
  }
  .cover-stat {
    background: #eff6ff;
    color: #1e40af;
    font-size: 9pt;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: 999px;
  }
  .section-block { margin-bottom: 24px; }
  .section-title {
    font-size: 13pt;
    font-weight: 700;
    color: #2E5C8A;
    margin: 0 0 14px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e5e7eb;
  }
  .building-banner {
    background: linear-gradient(90deg, #2E5C8A 0%, #4A7BA7 100%);
    color: #fff;
    padding: 12px 16px;
    border-radius: 6px;
    margin-bottom: 16px;
    break-inside: avoid;
  }
  .building-label {
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    opacity: 0.85;
    display: block;
    margin-bottom: 2px;
  }
  .building-title { font-size: 14pt; font-weight: 700; }
  .level-block { margin: 0 0 18px 8px; }
  .level-title {
    font-size: 11pt;
    font-weight: 700;
    color: #374151;
    margin: 0 0 10px;
    padding-left: 8px;
    border-left: 3px solid #93c5fd;
  }
  .location-block {
    margin: 0 0 16px 0;
    padding: 12px 14px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    break-inside: avoid-page;
  }
  .location-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }
  .location-heading {
    flex: 1;
    min-width: 0;
  }
  .location-title {
    font-size: 10.5pt;
    font-weight: 700;
    color: #111827;
    margin: 0;
  }
  .location-detail {
    margin: 4px 0 0;
    font-size: 8.5pt;
    font-weight: 600;
    color: #4b5563;
    line-height: 1.4;
  }
  .location-kind {
    display: inline-block;
    margin-left: 6px;
    font-size: 7pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b7280;
    background: #e5e7eb;
    padding: 2px 6px;
    border-radius: 3px;
    vertical-align: middle;
  }
  .location-count { font-size: 8pt; color: #6b7280; white-space: nowrap; }
  .media-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .media-card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
    break-inside: avoid;
  }
  .media-frame {
    aspect-ratio: 4 / 3;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .media-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .media-placeholder {
    font-size: 8pt;
    color: #9ca3af;
    text-align: center;
    padding: 12px;
  }
  figcaption { padding: 8px; }
  .source-badge {
    display: inline-block;
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #fff;
    padding: 2px 6px;
    border-radius: 3px;
    margin-bottom: 4px;
  }
  .media-caption {
    font-size: 8pt;
    color: #374151;
    margin: 4px 0 2px;
    word-break: break-word;
  }
  .media-meta { font-size: 7pt; color: #9ca3af; }
  @media print {
    .location-block { break-inside: avoid-page; }
    .building-section { break-before: auto; }
  }
</style>
</head>
<body>

<div class="cover">
  <p class="cover-project">${escHtml(projectName)}</p>
  <p class="cover-title">${escHtml(coverTitle)}</p>
  <p class="cover-sub">Exported ${fmtDateTime(exportedAt)}</p>
  ${filterSummary.trim() ? `<p class="cover-filters"><strong>Filters:</strong> ${escHtml(filterSummary)}</p>` : ""}
  <div class="cover-stats">
    <span class="cover-stat">${locations.length} location${locations.length !== 1 ? "s" : ""}</span>
    <span class="cover-stat">${totalItems} photo${totalItems !== 1 ? "s" : ""}</span>
  </div>
</div>

${standaloneHtml}
${buildingsHtml}

</body>
</html>`;
}

export async function buildMediaAlbumPdf(opts: BuildMediaAlbumPdfOptions): Promise<Buffer> {
  const html = await buildHtml(opts);
  const printedOn = fmtPrintedOn(opts.exportedAt);

  opts.onRenderProgress?.({ subphase: "pdf" });
  if (opts.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const browser = await launchPdfPuppeteerBrowser();
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
          <span>${escHtml(opts.projectName)}</span>
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

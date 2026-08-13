import { launchPdfPuppeteerBrowser } from "@/lib/pdf/puppeteer-launch";
import { formatReportDate } from "@/lib/format-report-date";
import type { LevelScopeCellData } from "@/lib/level-scope-report";
import type { PortfolioProgressExportPayload } from "@/lib/reports/portfolio-progress-export";
import {
  deltaColorHex,
  formatExportDeltaText,
  formatExportUnitsInline,
} from "@/lib/reports/portfolio-export-format";
import {
  levelDisplayLabel,
  pctFromQty,
  sumQtyForScope,
  sumUnitDeltaForScopeInLevels,
  verifiedDeltaForScopeInLevels,
} from "@/lib/reports/level-scope-qty";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function heatmap(pct: number): { bg: string; color: string } {
  if (pct === 0) return { bg: "transparent", color: "#d1d5db" };
  if (pct < 25) return { bg: "#dcfce7", color: "#15803d" };
  if (pct < 50) return { bg: "#bbf7d0", color: "#15803d" };
  if (pct < 75) return { bg: "#86efac", color: "#14532d" };
  if (pct < 100) return { bg: "#4ade80", color: "#14532d" };
  return { bg: "#16a34a", color: "#ffffff" };
}

function formatDeltaHtml(
  delta: number | null | undefined,
  unitDelta: number | null | undefined,
  noChange: string,
  locale: string,
): string {
  const pctLabel = formatExportDeltaText(delta, noChange);
  const color = deltaColorHex(delta);
  const unitCount =
    unitDelta !== null && unitDelta !== undefined ? Math.abs(unitDelta) : 0;
  const showUnits =
    delta !== null && delta !== undefined && unitCount > 0;
  const unitsHtml = showUnits
    ? `<span class="delta-units">${esc(formatExportUnitsInline(unitCount, locale))}</span>`
    : "";
  return `<span class="delta-pct" style="color:${color};font-weight:700;">${esc(pctLabel)}</span>${unitsHtml}`;
}

function formatOverallDeltaHtml(delta: number | null, noChange: string): string {
  if (delta === null) return esc(noChange);
  const prefix = delta > 0 ? "▲ " : delta < 0 ? "▼ " : "";
  const text = delta > 0 ? `+${delta}%` : `${delta}%`;
  return esc(`${prefix}${text}`);
}

function formatPctCellHtml(
  pct: number,
  installedQty: number,
  totalQty: number,
  bold: boolean,
  showUnits: boolean,
  noChange: string,
): string {
  const { bg, color } = heatmap(pct);
  const hasCell = totalQty > 0 || pct > 0;
  const pctText = hasCell ? `${pct}%` : noChange;
  const unitsText =
    showUnits && totalQty > 0 ? `${installedQty}/${totalQty}` : "";
  return `<div class="pct-cell">
    <span class="pct-pill" style="background:${hasCell ? bg : "transparent"};color:${hasCell ? color : "#d1d5db"};font-weight:${bold ? 800 : 700};">${esc(pctText)}</span>
    ${unitsText ? `<span class="pct-units">${esc(unitsText)}</span>` : `<span class="pct-units pct-units--empty"></span>`}
  </div>`;
}

interface ScopeStackRowInput {
  scopeLabel: string;
  pct: number;
  installedQty: number;
  totalQty: number;
  delta: number | null | undefined;
  unitDelta: number | null | undefined;
  startedOn: string;
  lastUpdatedOn: string;
  endOn: string;
  bold?: boolean;
  rowClass?: string;
}

function renderScopeStackRow(
  row: ScopeStackRowInput,
  showUnitCounts: boolean,
  labels: PortfolioProgressExportPayload["labels"],
  locale: string,
): string {
  const rowClass = row.rowClass ? ` class="${row.rowClass}"` : "";
  return `<tr${rowClass}>
    <td class="scope-name">${esc(row.scopeLabel)}</td>
    <td class="data-cell">${formatPctCellHtml(
      row.pct,
      row.installedQty,
      row.totalQty,
      row.bold ?? false,
      showUnitCounts,
      labels.noChange,
    )}</td>
    <td class="delta-cell">${formatDeltaHtml(row.delta, row.unitDelta, labels.noChange, locale)}</td>
    <td class="date-cell">${esc(row.startedOn)}</td>
    <td class="date-cell">${esc(row.lastUpdatedOn)}</td>
    <td class="date-cell">${esc(row.endOn)}</td>
  </tr>`;
}

function cellDatesForExport(
  cell: LevelScopeCellData | undefined,
  pct: number,
  locale: string,
  noChange: string,
): { startedOn: string; lastUpdatedOn: string; endOn: string } {
  return {
    startedOn: cell?.startedOn ? formatReportDate(cell.startedOn, locale) : noChange,
    lastUpdatedOn: cell?.lastUpdatedOn
      ? formatReportDate(cell.lastUpdatedOn, locale)
      : noChange,
    endOn:
      pct >= 100 && cell?.completedOn
        ? formatReportDate(cell.completedOn, locale)
        : noChange,
  };
}

function renderScopeStackTable(
  heading: string,
  rows: ScopeStackRowInput[],
  labels: PortfolioProgressExportPayload["labels"],
  locale: string,
  showUnitCounts: boolean,
  options?: {
    headingClass?: string;
    blockClass?: string;
    firstColumnHeader?: string;
  },
): string {
  const headingClass = options?.headingClass ?? "level-heading";
  const blockClass = options?.blockClass ?? "level-block";
  const firstColumnHeader = options?.firstColumnHeader ?? labels.colScope;
  return `<div class="${blockClass}">
    <div class="${headingClass}">${esc(heading)}</div>
    <table class="scope-stack-table">
      <thead>
        <tr>
          <th>${esc(firstColumnHeader)}</th>
          <th>${esc(labels.colPct)}</th>
          <th>${esc(labels.colChange)}</th>
          <th>${esc(labels.colStart)}</th>
          <th>${esc(labels.colLastUpdated)}</th>
          <th>${esc(labels.colEnd)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => renderScopeStackRow(row, showUnitCounts, labels, locale))
          .join("")}
      </tbody>
    </table>
  </div>`;
}

function formatBuildingHeading(building: string, colBuilding: string): string {
  return `${colBuilding}: ${building}`;
}

function formatLevelHeading(levelKey: string, colLevel: string): string {
  return `${colLevel}: ${levelDisplayLabel(levelKey)}`;
}

export function buildPortfolioProgressExportHtml(payload: PortfolioProgressExportPayload): string {
  const {
    projectName,
    exportedAt,
    period,
    overallVerifiedPct,
    overallVerifiedDelta,
    scopeSummaries,
    levelReport,
    deltaPeriodLabel,
    labels,
    locale,
  } = payload;

  const exportedDate = new Date(exportedAt);
  const dateStr = exportedDate.toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const periodRangeLong = `${formatReportDate(period.rangeFrom, locale)} – ${formatReportDate(period.rangeTo, locale)}`;

  const scopeRows = scopeSummaries
    .map(
      (scope) => `<tr>
        <td class="scope-name">${esc(scope.scopeName)}</td>
        <td class="num">${scope.verifiedPct}%</td>
        <td class="num">${formatDeltaHtml(scope.verifiedDelta, null, labels.noChange, locale)}</td>
        <td class="num">${scope.subPct}%</td>
        <td class="num">${formatDeltaHtml(scope.subDelta, null, labels.noChange, locale)}</td>
      </tr>`,
    )
    .join("");

  const {
    levels,
    scopes,
    data,
    buildings,
  } = levelReport;
  const showUnitCounts = levels.some((lk: string) =>
    scopes.some((scope: string) => (data[lk]?.[scope]?.totalQty ?? 0) > 0),
  );

  const buildingBlocks = buildings
    .map((building) => {
      const buildingLevels = levels.filter((lk) => levelReport.levelToBuilding[lk] === building);
      const buildingPageHeader = formatBuildingHeading(building, labels.colBuilding);

      const scopeBlocks = scopes
        .map((scope) => {
          const levelRows: ScopeStackRowInput[] = buildingLevels.map((lk) => {
            const cell = data[lk]?.[scope];
            const pct = cell?.pct ?? 0;
            const dates = cellDatesForExport(cell, pct, locale, labels.noChange);
            return {
              scopeLabel: formatLevelHeading(lk, labels.colLevel),
              pct,
              installedQty: cell?.installedQty ?? 0,
              totalQty: cell?.totalQty ?? 0,
              delta: cell?.verifiedDelta ?? null,
              unitDelta: cell?.verifiedUnitDelta ?? null,
              ...dates,
            };
          });
          const scopeQty = sumQtyForScope(scope, buildingLevels, data);
          levelRows.push({
            scopeLabel: labels.colBuildingTotal,
            pct: pctFromQty(scopeQty.installedQty, scopeQty.totalQty),
            installedQty: scopeQty.installedQty,
            totalQty: scopeQty.totalQty,
            delta: verifiedDeltaForScopeInLevels(scope, buildingLevels, data),
            unitDelta: sumUnitDeltaForScopeInLevels(scope, buildingLevels, data),
            startedOn: labels.noChange,
            lastUpdatedOn: labels.noChange,
            endOn: labels.noChange,
            bold: true,
            rowClass: "overall-row",
          });
          return renderScopeStackTable(
            scope,
            levelRows,
            labels,
            locale,
            showUnitCounts,
            {
              headingClass: "scope-heading",
              blockClass: "scope-block",
              firstColumnHeader: labels.colLevel,
            },
          );
        })
        .join("");

      return `<div class="building-block">
        <div class="building-page-header">${esc(buildingPageHeader)}</div>
        ${scopeBlocks}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="${esc(locale.slice(0, 2))}">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 10px;
    color: #111827;
    background: #fff;
    padding: 28px 32px;
  }
  .cover {
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 14px;
    margin-bottom: 18px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .cover-brand { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; margin-bottom: 3px; }
  .cover-project { font-size: 22px; font-weight: 800; color: #111827; line-height: 1.2; }
  .cover-report-type { font-size: 14px; font-weight: 700; color: #374151; margin-top: 4px; }
  .cover-sub { font-size: 11px; color: #6b7280; margin-top: 4px; }
  .period-box {
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    border-radius: 8px;
    padding: 10px 12px;
    min-width: 140px;
    text-align: center;
  }
  .period-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #4338ca; }
  .period-range { font-size: 13px; font-weight: 800; color: #312e81; margin-top: 2px; }
  .period-preset { font-size: 9px; font-weight: 600; color: #4338ca; margin-top: 2px; }
  .period-compare { font-size: 9px; color: #6b7280; margin-top: 4px; line-height: 1.3; }
  .rollup-box { text-align: right; min-width: 120px; }
  .rollup-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; }
  .rollup-pct { font-size: 28px; font-weight: 800; line-height: 1; color: #111827; margin-top: 2px; }
  .rollup-delta { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 999px; background: #dcfce7; color: #15803d; font-size: 10px; font-weight: 700; }
  .section-title { font-size: 12px; font-weight: 800; color: #111827; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .summary-table th, .summary-table td { border: 1px solid #e5e7eb; padding: 6px 8px; }
  .summary-table th { background: #f9fafb; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; text-align: left; }
  .summary-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .scope-name { font-weight: 700; }
  .building-block {
    margin-bottom: 0;
    page-break-before: always;
  }
  .building-page-header {
    background: #1f2937;
    color: #fff;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 10px 12px;
    margin: 0 0 14px;
    break-after: avoid;
    page-break-after: avoid;
  }
  .level-block, .rollup-block {
    margin: 0 0 12px;
    page-break-inside: avoid;
  }
  .scope-block {
    margin: 0 0 14px;
  }
  .scope-heading {
    break-after: avoid;
    page-break-after: avoid;
  }
  .scope-stack-table thead {
    display: table-header-group;
  }
  .level-heading, .scope-heading, .rollup-heading {
    font-size: 11px;
    font-weight: 700;
    color: #374151;
    margin-bottom: 4px;
  }
  .scope-heading {
    font-size: 12px;
    font-weight: 800;
    color: #111827;
    margin-top: 2px;
  }
  .scope-stack-table th {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    padding: 5px 6px;
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    color: #9ca3af;
    text-align: center;
  }
  .scope-stack-table th:first-child { text-align: left; }
  .scope-stack-table td {
    border: 1px solid #f3f4f6;
    padding: 5px 6px;
    vertical-align: middle;
    font-variant-numeric: tabular-nums;
  }
  .scope-stack-table .scope-name {
    font-size: 10px;
    font-weight: 600;
    color: #374151;
    white-space: nowrap;
  }
  .scope-stack-table .data-cell,
  .scope-stack-table .delta-cell,
  .scope-stack-table .date-cell {
    text-align: center;
  }
  .scope-stack-table .date-cell { font-size: 9px; color: #6b7280; }
  .scope-stack-table .overall-row { background: #fafafa; }
  .scope-stack-table .overall-row .scope-name { font-weight: 700; color: #6b7280; }
  .pct-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 32px; }
  .pct-pill { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .pct-units { font-size: 9px; font-weight: 500; color: #6b7280; font-variant-numeric: tabular-nums; min-height: 11px; line-height: 1.1; }
  .pct-units--empty { visibility: hidden; }
  .delta-cell { white-space: nowrap; }
  .delta-pct { font-size: 11px; }
  .delta-units { font-size: 9px; font-weight: 500; color: #6b7280; margin-left: 2px; }
  .doc-footer { margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 9px; color: #9ca3af; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="cover">
    <div>
      <div class="cover-brand">CP Build</div>
      <div class="cover-project">${esc(projectName)}</div>
      <div class="cover-report-type">${esc(labels.documentTitle)}</div>
      <div class="cover-sub">${esc(dateStr)}</div>
    </div>
    <div class="period-box">
      <div class="period-label">${esc(labels.periodHeading)}</div>
      <div class="period-range">${esc(period.rangeDisplay)}</div>
      <div class="period-preset">${esc(period.presetLabel)}</div>
      <div class="period-compare">${esc(period.compareLabel)}<br />${esc(periodRangeLong)}</div>
    </div>
    <div class="rollup-box">
      <div class="rollup-label">${esc(labels.overallVerifiedLabel)}</div>
      <div class="rollup-pct">${overallVerifiedPct}%</div>
      <div class="rollup-delta">${formatOverallDeltaHtml(overallVerifiedDelta, labels.noChange)}</div>
    </div>
  </div>

  <h2 class="section-title">${esc(labels.scopeSummaryHeading)}</h2>
  <table class="summary-table">
    <thead>
      <tr>
        <th>${esc(labels.colScope)}</th>
        <th>${esc(labels.colVerified)}</th>
        <th>${esc(labels.colVerifiedChange)}</th>
        <th>${esc(labels.colUnverified)}</th>
        <th>${esc(labels.colUnverifiedChange)}</th>
      </tr>
    </thead>
    <tbody>${scopeRows}</tbody>
  </table>

  <h2 class="section-title">${esc(labels.levelDetailHeading)}</h2>
  <p style="font-size:9px;color:#6b7280;margin-bottom:10px;">${esc(labels.colChange)}: ${esc(deltaPeriodLabel)}</p>
  ${buildingBlocks}

  <div class="doc-footer">
    <span>${esc(labels.confidentialFooter)}</span>
    <span>${esc(projectName)} · ${esc(dateStr)}</span>
  </div>
</body>
</html>`;
}

export async function buildPortfolioProgressExportPdf(
  payload: PortfolioProgressExportPayload,
): Promise<Buffer> {
  const browser = await launchPdfPuppeteerBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(buildPortfolioProgressExportHtml(payload), {
      waitUntil: "domcontentloaded",
    });
    const pdf = await page.pdf({
      format: "A4",
      landscape: false,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

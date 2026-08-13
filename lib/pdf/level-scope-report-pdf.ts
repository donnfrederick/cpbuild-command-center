/**
 * PDF renderer for the Install Complete by Level report.
 * Progress bar per scope per level. Green = has progress, gray = nothing yet.
 */

import { launchPdfPuppeteerBrowser } from "@/lib/pdf/puppeteer-launch";
import type { LevelScopeReportData } from "@/lib/level-scope-report";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function heatmap(pct: number): { bg: string; color: string } {
  if (pct === 0)  return { bg: "transparent", color: "#d1d5db" };
  if (pct < 25)   return { bg: "#dcfce7",     color: "#15803d" };
  if (pct < 50)   return { bg: "#bbf7d0",     color: "#15803d" };
  if (pct < 75)   return { bg: "#86efac",     color: "#14532d" };
  if (pct < 100)  return { bg: "#4ade80",     color: "#14532d" };
  return             { bg: "#16a34a",     color: "#ffffff" };
}

function buildHtml(
  report: LevelScopeReportData,
  projectName: string,
  exportedAt: Date
): string {
  const { levels, scopes, data, overallByLevel, overallByScope, grandTotalPct } = report;

  const dateStr = exportedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const scopeHeaders = scopes
    .map((s) => `<th class="scope-th">${esc(s)}</th>`)
    .join("");

  const totalCols = scopes.length + 2;
  const dataRows = report.buildings
    .map((building) => {
      const buildingLevels = levels.filter((lk) => report.levelToBuilding[lk] === building);
      const buildingHeader = `<tr>
        <td colspan="${totalCols}" style="padding:6px 10px;background:#f3f4f6;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
          ${esc(building)}
        </td>
      </tr>`;

      const levelRows = buildingLevels
        .map((lk, i) => {
          const overallPct = overallByLevel[lk] ?? 0;
          const bg = i % 2 === 0 ? "#ffffff" : "#f9fafb";

          const cells = scopes
            .map((scope) => {
              const cell = data[lk]?.[scope];
              const pct = cell?.pct ?? 0;
              const { bg: cellBg, color } = heatmap(pct);
              const label = cell ? `${pct}%` : "—";
              return `<td class="data-cell" style="background:${cellBg};"><span style="color:${color};font-weight:700;">${label}</span></td>`;
            })
            .join("");

          const { bg: overallBg, color: overallColor } = heatmap(overallPct);
          return `<tr>
            <td class="level-cell" style="background:${bg};">${esc(lk)}</td>
            ${cells}
            <td class="overall-cell" style="background:${overallBg};"><span style="color:${overallColor};font-weight:800;">${overallPct}%</span></td>
          </tr>`;
        })
        .join("");

      return buildingHeader + levelRows;
    })
    .join("");

  const footerCells = scopes
    .map((scope) => {
      const pct = overallByScope[scope] ?? 0;
      const { bg: cellBg, color } = heatmap(pct);
      return `<td class="footer-cell" style="background:${cellBg};"><span style="color:${color};">${pct}%</span></td>`;
    })
    .join("");

  const { bg: grandBg, color: grandColor } = heatmap(grandTotalPct);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 11px;
    color: #111827;
    background: #fff;
    padding: 32px 36px;
  }

  .cover {
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 14px;
    margin-bottom: 20px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
  }
  .cover-brand { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; margin-bottom: 3px; }
  .cover-title { font-size: 18px; font-weight: 800; color: #111827; }
  .cover-sub { font-size: 11px; color: #9ca3af; margin-top: 4px; }
  .grand-total { text-align: right; }
  .grand-pct { font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
  .grand-label { font-size: 10px; color: #9ca3af; margin-top: 2px; }

  table { width: 100%; border-collapse: collapse; }

  .scope-th {
    background: #f9fafb;
    border-bottom: 2px solid #e5e7eb;
    border-right: 1px solid #e5e7eb;
    padding: 7px 6px;
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    color: #6b7280;
    white-space: nowrap;
  }
  .level-th {
    background: #f9fafb;
    border-bottom: 2px solid #e5e7eb;
    border-right: 1px solid #e5e7eb;
    padding: 7px 8px;
    font-size: 10px;
    font-weight: 700;
    color: #6b7280;
    width: 80px;
  }
  .overall-th {
    background: #f9fafb;
    border-bottom: 2px solid #e5e7eb;
    border-left: 2px solid #e5e7eb;
    padding: 7px 6px;
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    color: #6b7280;
    white-space: nowrap;
  }

  .level-cell {
    border-right: 1px solid #e5e7eb;
    border-bottom: 1px solid #f3f4f6;
    padding: 7px 8px;
    font-size: 10px;
    font-weight: 600;
    color: #374151;
    white-space: nowrap;
  }
  .data-cell {
    padding: 5px 6px;
    text-align: center;
    vertical-align: middle;
  }
  .data-cell span { font-size: 11px; display: block; font-variant-numeric: tabular-nums; }
  .bar-track { width: 40px; height: 3px; border-radius: 99px; background: #e5e7eb; overflow: hidden; margin: 3px auto 0; }
  .overall-cell {
    border-left: 2px solid #e5e7eb;
    border-bottom: 1px solid #f3f4f6;
    padding: 7px 6px;
    text-align: center;
  }
  .overall-cell span { font-size: 11px; font-variant-numeric: tabular-nums; }

  .footer-row td { border-top: 2px solid #e5e7eb; padding: 7px 6px; text-align: center; background: #f9fafb; }
  .footer-cell span { font-size: 11px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .footer-level { border-right: 1px solid #e5e7eb; padding: 7px 8px; font-size: 10px; font-weight: 700; color: #6b7280; background: #f9fafb; }
  .footer-overall { border-left: 2px solid #e5e7eb; padding: 7px 6px; text-align: center; background: #f9fafb; }

  .doc-footer {
    margin-top: 24px;
    border-top: 1px solid #e5e7eb;
    padding-top: 8px;
    font-size: 10px;
    color: #9ca3af;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>
  <div class="cover">
    <div>
      <div class="cover-brand">CP Build</div>
      <div class="cover-title">Install Complete by Level</div>
      <div class="cover-sub">${esc(projectName)} · ${esc(dateStr)}</div>
    </div>
    <div class="grand-total">
      <div class="grand-pct" style="color:${grandColor};">${grandTotalPct}%</div>
      <div class="grand-label">overall</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="level-th">Level</th>
        ${scopeHeaders}
        <th class="overall-th">Overall</th>
      </tr>
    </thead>
    <tbody>
      ${dataRows}
      <tr class="footer-row">
        <td class="footer-level">Overall</td>
        ${footerCells}
        <td class="footer-overall" style="background:${grandBg};"><span style="color:${grandColor};font-weight:800;font-size:12px;">${grandTotalPct}%</span></td>
      </tr>
    </tbody>
  </table>

  <div class="doc-footer">
    <span>Confidential — Generated by CP Build Command Center</span>
    <span>${esc(projectName)} · ${esc(dateStr)}</span>
  </div>
</body>
</html>`;
}

export interface BuildLevelScopeReportPdfOptions {
  report: LevelScopeReportData;
  projectName: string;
  exportedAt: Date;
}

export async function buildLevelScopeReportPdf(
  opts: BuildLevelScopeReportPdfOptions
): Promise<Buffer> {
  const browser = await launchPdfPuppeteerBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(
      buildHtml(opts.report, opts.projectName, opts.exportedAt),
      { waitUntil: "domcontentloaded" }
    );
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

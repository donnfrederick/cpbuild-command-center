/**
 * Fails `npm start` when .next still bundles the pre-fix observations PDF log line.
 * That stale string caused Windows to keep spawning %TEMP%/chromium (ENOENT).
 *
 * Run manually: node scripts/pdf-next-bundle-guard.cjs
 */
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

try {
  require("@next/env").loadEnvConfig(process.cwd());
} catch {
  /* Best-effort env loading; explicit shell env still works. */
}

const shouldRun =
  process.env.PDF_NEXT_BUNDLE_GUARD === "1" || process.env.APP_ENV === "dev";

if (!shouldRun) {
  process.exit(0);
}

function walkJsFiles(dir, visitor) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkJsFiles(full, visitor);
    else if (full.endsWith(".js")) visitor(full);
  }
}

const obsPath = path.join("lib", "pdf", "observations-pdf.ts");
if (!fs.existsSync(obsPath)) {
  console.error("[pdf-next-bundle-guard] missing lib/pdf/observations-pdf.ts");
  process.exit(1);
}
const obsSrc = fs.readFileSync(obsPath, "utf8");
if (!obsSrc.includes("launchPdfPuppeteerBrowser")) {
  console.error(
    "[pdf-next-bundle-guard] Source does not use launchPdfPuppeteerBrowser — guard skipped (unexpected tree).",
  );
  process.exit(0);
}

const nextServer = path.join(".next", "server");
if (!fs.existsSync(nextServer)) {
  console.error("[pdf-next-bundle-guard] No .next/server — run npm run build before npm start.");
  process.exit(1);
}

/** Old bundled log from observations-pdf.ts before the Puppeteer launch centralization. */
const STALE_SUBSTR = "launching browser, isLocal=";
let staleFile = null;

walkJsFiles(nextServer, (file) => {
  if (staleFile) return;
  try {
    const c = fs.readFileSync(file, "utf8");
    if (c.includes(STALE_SUBSTR)) staleFile = file;
  } catch {
    /* unreadable — ignore */
  }
});

if (staleFile) {
  console.error("[pdf-next-bundle-guard] STALE .next build: still contains the old PDF launcher log.");
  console.error(`[pdf-next-bundle-guard] Matched file: ${path.relative(process.cwd(), staleFile)}`);
  console.error("[pdf-next-bundle-guard] Fix: delete .next then rebuild, e.g.:");
  console.error("  PowerShell: Remove-Item -Recurse -Force .next; npm run build");
  process.exit(1);
}

console.log("[pdf-next-bundle-guard] OK — .next has no stale observations PDF launcher markers.");

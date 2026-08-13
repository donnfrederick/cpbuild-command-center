/**
 * Centralizes how Puppeteer resolves Chrome/Chromium for PDF routes.
 *
 * - **Railway/Docker:** Linux + NODE_ENV=production → `@sparticuz/chromium-min`
 *   (bundled Linux binary + deps from Dockerfile).
 * - **Windows / macOS:** Always use installed Chrome or Edge (`npm run build &&
 *   npm run start` still runs on darwin/win32 — packaged Chromium from Sparticuz
 *   is Linux-only and would ENOENT locally).
 * - **Linux dev:** System Chrome/Chromium under common paths unless env overrides.
 *
 * Overrides: when `CHROME_EXECUTABLE_PATH` or `PUPPETEER_EXECUTABLE_PATH` is set, it is used **only**
 * if `existsSync` passes; on Windows the path **must end in `.exe`** so bare temp `...\chromium` stubs
 * (Sparticuz/Linux layout) cannot hijack Puppeteer locally.
 */

import * as nodeFs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import type { Browser } from "puppeteer-core";

/** Same tarball URL used everywhere we previously inlined. */
export const PDF_PACKED_CHROMIUM_TAR =
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";

function envExecutableOverride(): string | null {
  const raw = process.env.CHROME_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  const t = raw?.trim();
  return t ? t : null;
}

/** True when override points at something we can spawn (`existsSync` + Windows needs `.exe`). */
function isRunnableBrowserPath(p: string): boolean {
  if (!nodeFs.existsSync(p)) return false;
  const norm = path.normalize(p);
  if (process.platform === "win32" && !/\.exe$/i.test(norm)) return false;
  return true;
}

const WIN_BROWSER_CANDIDATES = ((): string[] => {
  const la = process.env.LOCALAPPDATA;
  const pf = process.env.ProgramFiles;
  const uniq = new Set<string>();
  const push = (s: string) => {
    const t = s.trim();
    if (t) uniq.add(path.normalize(t));
  };
  push("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
  push("C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe");
  if (pf) push(path.join(pf, "Google", "Chrome", "Application", "chrome.exe"));
  if (la) push(path.join(la, "Google", "Chrome", "Application", "chrome.exe"));
  if (la) push(path.join(la, "Google", "Chrome SxS", "Application", "chrome.exe")); // Canary
  if (pf) push(path.join(pf, "Google", "Chrome Beta", "Application", "chrome.exe"));
  push("C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe");
  if (pf) push(path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"));
  push("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe");
  if (la) push(path.join(la, "Microsoft", "Edge", "Application", "msedge.exe"));
  if (la) push(path.join(la, "Microsoft", "Edge Dev", "Application", "msedge.exe"));
  return [...uniq];
})();

/** Non-Linux packaged path: locate a browser for Puppeteer Core. */
export function resolveSystemChromeExecutable(): string {
  if (process.platform === "darwin") {
    const macCandidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    ];
    for (const p of macCandidates) {
      if (nodeFs.existsSync(p)) return p;
    }
    throw new Error(
      'PDF export: Chrome, Edge, or Brave not found. Install a browser or set CHROME_EXECUTABLE_PATH.',
    );
  }

  if (process.platform === "win32") {
    for (const cand of WIN_BROWSER_CANDIDATES) {
      if (cand && nodeFs.existsSync(cand)) return cand;
    }
    throw new Error(
      'PDF export: No Chrome or Edge found under standard paths. Install Google Chrome or set CHROME_EXECUTABLE_PATH.',
    );
  }

  const linuxCandidates = [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const p of linuxCandidates) {
    if (nodeFs.existsSync(p)) return p;
  }
  throw new Error(
    'PDF export: Chrome/Chromium not found. Install chromium or set CHROME_EXECUTABLE_PATH.',
  );
}

/**
 * Sparticuz bundle is Linux-only; production containers (Railway) are Linux slim
 * images that install shared libs — not full Google Chrome packages.
 *
 * Not named `use*` — ESLint react-hooks/rules-of-hooks treats any `useX()` callee
 * as a hook when the callee function name starts with "use".
 */
function packagedLinuxChromiumEligible(): boolean {
  return process.platform === "linux" && process.env.NODE_ENV === "production";
}

export interface PdfPuppeteerLaunchOpts {
  executablePath: string;
  args: string[];
}

async function computePdfPuppeteerLaunchOptions(): Promise<{
  executablePath: string;
  args: string[];
  strategy: string;
}> {
  const overridden = envExecutableOverride();
  if (overridden && isRunnableBrowserPath(overridden)) {
    return {
      executablePath: overridden,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      strategy: "env-chrome-path",
    };
  }
  if (overridden && !isRunnableBrowserPath(overridden)) {
    console.warn(
      `[pdf] Ignoring CHROME_EXECUTABLE_PATH / PUPPETEER_EXECUTABLE_PATH (missing, unusable on Windows without .exe, etc.): ${overridden}`,
    );
  }

  // Sparticuz is Linux ELF + tmpdir layout (`os.tmpdir()/chromium`) — unsafe on darwin/win32.
  // Call it ONLY on linux so production Win/mac `npm run start` never inherits a bogus temp path.
  if (process.platform !== "linux") {
    return {
      executablePath: resolveSystemChromeExecutable(),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      strategy:
        process.platform === "darwin"
          ? "system-mac"
          : process.platform === "win32"
            ? "system-win"
            : "system-non-linux-non-mac",
    };
  }

  if (packagedLinuxChromiumEligible()) {
    const chromium = (await import("@sparticuz/chromium-min")).default;
    return {
      executablePath: await chromium.executablePath(PDF_PACKED_CHROMIUM_TAR),
      args: [...chromium.args],
      strategy: "sparticuz-linux-prod",
    };
  }

  return {
    executablePath: resolveSystemChromeExecutable(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    strategy: "system-linux-dev",
  };
}

/** Args + binary for `puppeteer.launch({ ...opts, headless: true })`. */
export async function getPdfPuppeteerLaunchOptions(): Promise<PdfPuppeteerLaunchOpts> {
  const raw = await computePdfPuppeteerLaunchOptions();
  const { strategy, ...opts } = raw;
  console.log(
    `[pdf] puppeteer strategy=${strategy} platform=${process.platform} NODE_ENV=${process.env.NODE_ENV ?? ""} exe=${opts.executablePath}`,
  );
  return opts;
}

/**
 * Launch Chrome/Edge (or Sparticuz on Railway Linux prod) for PDF builders.
 * Passes **`executablePath` explicitly** so puppeteer-core never falls back to
 * built-in Chromium discovery (important on Windows vs `TEMP/chromium`).
 */
export async function launchPdfPuppeteerBrowser(): Promise<Browser> {
  const { executablePath, args } = await getPdfPuppeteerLaunchOptions();
  if (!executablePath?.trim()) {
    throw new Error("PDF internal error: executablePath empty after resolver.");
  }
  if (process.platform === "win32") {
    const norm = path.normalize(executablePath);
    if (!/\.exe$/i.test(norm)) {
      throw new Error(
        `PDF export refuses to spawn a non-.exe path on Windows (${executablePath}). ` +
          "Unset bogus CHROME_EXECUTABLE_PATH / PUPPETEER_EXECUTABLE_PATH, remove stale %TEMP%/chromium* files, delete .next, run npm run build, then npm start.",
      );
    }
  }
  return puppeteer.launch({
    executablePath,
    args,
    headless: true,
  });
}

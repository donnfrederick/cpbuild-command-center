/**
 * Validates PDF browser resolution OUTSIDE Next.js (no .next drift).
 *
 * Usage: npm run smoke:pdf-browser
 */
import { loadEnvConfig } from "@next/env";
import { launchPdfPuppeteerBrowser } from "../lib/pdf/puppeteer-launch";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  console.log("[smoke-pdf-browser] resolving and launching Puppeteer…");
  const browser = await launchPdfPuppeteerBrowser();
  await browser.close();
  console.log("[smoke-pdf-browser] OK — browser spawned and exited cleanly.");
}

main().catch((err: unknown) => {
  console.error("[smoke-pdf-browser] FAILED:", err);
  process.exitCode = 1;
});

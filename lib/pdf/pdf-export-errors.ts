import { NextResponse } from "next/server";
import { isNonProd } from "@/lib/app-env";

const DETAILS_MAX = 600;

/**
 * Narrow classification for dashboards / telemetry (no secrets in `message`).
 */
export function classifyPdfGenerationFailure(message: string): string | undefined {
  if (/PDF export:/i.test(message)) return "PDF_BROWSER_NOT_CONFIGURED";
  if (/PDF export refuses to spawn/i.test(message)) return "PDF_BROWSER_NOT_CONFIGURED";
  if (/PDF internal error: executablePath empty/i.test(message)) {
    return "PDF_BROWSER_NOT_CONFIGURED";
  }
  if (
    (/ENOENT/i.test(message) || /spawn .+ ENOENT/i.test(message) || /Failed to launch the browser/i.test(message)) &&
    /Chrome|Chromium|chromium|Puppeteer|pptr|browser|Edge/i.test(message)
  ) {
    return "PDF_BROWSER_LAUNCH_FAILED";
  }
  if (/Target closed|Navigation failed|Protocol error/i.test(message)) {
    return "PDF_RENDER_FAILED";
  }
  return undefined;
}

/**
 * Logs the full error, returns minimal JSON on prod; adds `details` + optional
 * `code` when `isNonProd()` is true (local dev, `APP_ENV=dev`, or `NODE_ENV` ≠ production).
 */
export function pdfGenerationFailedNextResponse(
  logPrefix: string,
  err: unknown,
): NextResponse {
  console.error(`${logPrefix} PDF generation failed:`, err);

  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err ?? "");

  const body: {
    error: string;
    code?: string;
    details?: string;
  } = { error: "PDF generation failed." };

  const code = classifyPdfGenerationFailure(msg);
  if (code) body.code = code;

  if (isNonProd() && msg) {
    body.details =
      msg.length > DETAILS_MAX ? `${msg.slice(0, DETAILS_MAX)}…` : msg;
  }

  return NextResponse.json(body, { status: 500 });
}

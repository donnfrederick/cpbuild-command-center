/**
 * api-logger
 *
 * Tiny server-side helper that emits structured, human-readable console
 * messages for every API route outcome. Messages use the `[API]` prefix so
 * ServerLogs.tsx can detect them and render them with richer styling.
 *
 * Active when NODE_ENV !== "production" OR isDevToolsAllowed() (Railway dev).
 *
 * Usage:
 *   const t = apiTimer();
 *   const data = { id: "...", projectName: "X" };
 *   logApi("POST", "/api/projects", 201, 'Created "X"', t(), data);
 *
 * Output (picked up by dev-logger interceptor):
 *   [API] POST /api/projects → 201 ✓ Created "X" (34ms)
 *   Response: {"id":"...","projectName":"X"}
 */

import { isDevToolsAllowed } from "@/lib/devtools-env";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const IS_DEV = process.env.NODE_ENV !== "production" || isDevToolsAllowed();
const MAX_BODY_CHARS = 2000;

function formatResponseBody(body: unknown): string {
  if (body === undefined || body === null) return "";
  try {
    const str = typeof body === "string" ? body : JSON.stringify(body, null, 2);
    if (str.length <= MAX_BODY_CHARS) return str;
    return str.slice(0, MAX_BODY_CHARS) + "\n… (truncated)";
  } catch {
    return String(body).slice(0, MAX_BODY_CHARS);
  }
}

export function logApi(
  method: HttpMethod,
  path: string,
  status: number,
  detail: string,
  durationMs?: number,
  responseBody?: unknown
): void {
  if (!IS_DEV) return;
  // Suppress during Vitest runs to avoid noisy stderr (401/403/404 etc. are expected in tests)
  if (process.env.VITEST === "true" && process.env.VITEST_SILENT_API !== "false") return;

  const icon = status < 400 ? "✓" : "✗";
  const ms   = durationMs != null ? ` (${durationMs}ms)` : "";
  let msg    = `[API] ${method} ${path} → ${status} ${icon} ${detail}${ms}`;

  const bodyStr = formatResponseBody(responseBody);
  if (bodyStr) msg += `\n\nResponse:\n${bodyStr}`;

  if (status >= 500) {
    console.error(msg);
  } else if (status >= 400) {
    console.warn(msg);
  } else {
    console.info(msg);
  }
}

/** Returns a function that reports elapsed ms since the timer was created. */
export function apiTimer(): () => number {
  const t0 = Date.now();
  return () => Date.now() - t0;
}

import "server-only";

/**
 * Server-only client: dev app calls production internal feedback API with the bridge secret.
 * Never import from client components.
 */

export function getFeedbackBridgeProdBaseUrl(): string | undefined {
  const u = process.env.FEEDBACK_BRIDGE_PROD_BASE_URL?.trim().replace(/\/$/, "");
  return u || undefined;
}

export function isFeedbackProdMergeEnabled(): boolean {
  return Boolean(getFeedbackBridgeProdBaseUrl() && process.env.FEEDBACK_BRIDGE_SECRET?.trim());
}

export type FeedbackOrigin = "development" | "production";

export async function fetchProdInternalFeedback(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = getFeedbackBridgeProdBaseUrl();
  const secret = process.env.FEEDBACK_BRIDGE_SECRET?.trim();
  if (!base || !secret) {
    return new Response(JSON.stringify({ error: "Bridge not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = `${base}/api/internal/feedback${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${secret}`);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    return await fetch(url, {
      ...init,
      headers,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

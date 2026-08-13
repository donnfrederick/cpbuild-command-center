/**
 * Canonical public origin for transactional email links (invite, password reset).
 *
 * Must match the URL users open in the browser — same value as Railway `AUTH_URL`.
 * Admin "Generate reset link" uses `window.location.origin`; email uses this module.
 */

const LOCAL_DEV_FALLBACK = "http://localhost:3002";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

/** Resolve AUTH_URL → NEXTAUTH_URL → localhost fallback (dev only). */
export function resolvePublicAppUrl(): string {
  const configured =
    process.env.AUTH_URL?.trim() || process.env.NEXTAUTH_URL?.trim() || "";
  if (configured) {
    return stripTrailingSlash(configured);
  }
  return LOCAL_DEV_FALLBACK;
}

/** True when the URL is unsuitable for links emailed to production users. */
export function isMisconfiguredPublicAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") {
      return true;
    }
    // Railway internal port leaked into public URL (see proxy.ts / DEV_NOTES).
    if (parsed.protocol === "https:" && parsed.port && parsed.port !== "443") {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** Log once per send when prod email would point at a bad host — grep `[public-app-url]`. */
export function warnIfPublicAppUrlMisconfigured(context: string): void {
  if (process.env.NODE_ENV !== "production" || process.env.APP_ENV === "dev") {
    return;
  }
  const url = resolvePublicAppUrl();
  if (isMisconfiguredPublicAppUrl(url)) {
    console.error(
      `[public-app-url] Misconfigured AUTH_URL/NEXTAUTH_URL for ${context}: ${url}. ` +
        "Reset/invite email links will not match the live app. Set AUTH_URL to the production service URL.",
    );
  }
}

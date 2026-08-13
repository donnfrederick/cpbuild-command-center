import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { hasAuthJsSessionCookie } from "@/lib/auth-session-cookie";
import { routing } from "./i18n/routing";

const PUBLIC_PATHS = ["/login", "/register", "/invite", "/forgot-password", "/reset-password"];
const AUTH_API_PREFIX = "/api/auth";

const intlMiddleware = createMiddleware(routing);

/**
 * Returns the public-facing origin used for auth redirect URLs.
 *
 * next-intl ≥4.10.0 changed how it constructs redirect URLs — it now reads from
 * `request.url` directly instead of `request.nextUrl`. On Railway, `request.url`
 * carries the internal port (8080), so the auth redirect to /login would produce
 * https://hostname:8080/en/login, causing ERR_ABORTED in browsers.
 *
 * Priority: AUTH_URL / NEXTAUTH_URL when set to a non-internal hostname (Railway
 * env vars). Otherwise `getForwardedPublicOrigin()` uses validated
 * X-Forwarded-Host / Host when behind a reverse proxy (ngrok, Railway), and
 * falls back to `request.url` with non-standard HTTPS ports stripped.
 */
export function getPublicOrigin(request: NextRequest): string {
  const configured = getConfiguredPublicOrigin();
  if (configured) return configured;
  return getForwardedPublicOrigin(request);
}

/** Strip Railway/ngrok-internal :8080 (etc.) from HTTPS origins; keep HTTP dev ports. */
function toPublicOrigin(protocol: string, host: string): string {
  try {
    const url = new URL(`${protocol}//${host}`);
    if (url.protocol === "https:" && url.port && url.port !== "443") {
      url.port = "";
    }
    return url.origin;
  } catch {
    return `${protocol}//${host}`;
  }
}

function isInternalHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "");
  return (
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "localhost" ||
    normalized === "127.0.0.1"
  );
}

function getConfiguredPublicOrigin(): string | null {
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!configured) return null;
  try {
    const url = new URL(configured.trim());
    return isInternalHostname(url.hostname) ? null : url.origin;
  } catch {
    return null;
  }
}

function parseForwardedHost(host: string | undefined): string | null {
  const trimmed = host?.split(",")[0]?.trim();
  if (!trimmed || /[/?#\\\s@]/.test(trimmed)) return null;

  try {
    const parsed = new URL(`http://${trimmed}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return null;
    }
    return isInternalHostname(parsed.hostname) ? null : parsed.host;
  } catch {
    return null;
  }
}

export function getForwardedPublicOrigin(request: NextRequest): string {
  const raw = new URL(request.url);
  const forwardedHost = parseForwardedHost(request.headers.get("x-forwarded-host") ?? undefined);
  const requestHost = parseForwardedHost(request.headers.get("host") ?? undefined);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const configured = getConfiguredPublicOrigin();
  if (configured) return configured;

  const host = forwardedHost ?? requestHost ?? raw.host;
  const protocol = forwardedProto === "http" || forwardedProto === "https"
    ? `${forwardedProto}:`
    : raw.protocol;
  return toPublicOrigin(protocol, host);
}

export function normalizeProxyRedirectLocation(location: string, request: NextRequest): string {
  const url = new URL(location);

  if (isInternalHostname(url.hostname)) {
    const publicOrigin = new URL(getForwardedPublicOrigin(request));
    url.protocol = publicOrigin.protocol;
    url.hostname = publicOrigin.hostname;
    url.port = publicOrigin.port;
  }

  // Strip any non-standard port from an HTTPS redirect.
  if (url.protocol === "https:" && url.port && url.port !== "443") {
    url.port = "";
  }

  return url.toString();
}

/**
 * If a redirect response contains Railway's internal port in its Location
 * header, mutates the Location header in-place to strip it.
 * Only activates when running behind a reverse proxy (production/staging).
 * Mutates in-place rather than cloning to avoid dropping Set-Cookie headers.
 */
function withCleanLocation(
  response: NextResponse,
  request: NextRequest
): NextResponse {
  const isBehindProxy = !!(
    request.headers.get("x-forwarded-host") ||
    request.headers.get("x-forwarded-for")
  );
  if (!isBehindProxy) return response;

  const location = response.headers.get("Location");
  if (!location) return response;

  try {
    response.headers.set("Location", normalizeProxyRedirectLocation(location, request));
  } catch {
    // Unparseable Location — leave untouched.
  }
  return response;
}

export default async function proxy(request: NextRequest) {
  // Step 1: Run next-intl (locale detection, redirects / to /en etc.)
  // Apply withCleanLocation to strip Railway's internal :8080 port if present.
  const intlResponse = withCleanLocation(
    (await intlMiddleware(request)) as NextResponse,
    request
  );
  const { pathname } = request.nextUrl;

  // Step 2: Auth check (skip for API, dev bypass, and public paths)
  if (pathname.startsWith(AUTH_API_PREFIX)) {
    return intlResponse;
  }
  if (process.env.DEV_BYPASS_AUTH === "true") {
    return intlResponse;
  }

  // Pathname is locale-prefixed (e.g. /en/login, /es/projects)
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(\/|$)/, "$1") || "/";
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + "/")
  );
  if (isPublic) {
    return intlResponse;
  }

  if (!hasAuthJsSessionCookie(request.cookies.getAll())) {
    const locale = pathname.match(/^\/([a-z]{2})\b/)?.[1] ?? routing.defaultLocale;
    // Use getPublicOrigin to avoid leaking Railway's internal :8080 port.
    const loginUrl = new URL(`/${locale}/login`, getPublicOrigin(request));
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return intlResponse;
}

export const config = {
  matcher: [
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};

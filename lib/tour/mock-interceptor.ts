/**
 * MockFetchInterceptor — patches window.fetch during tour mode so that
 * mutation API calls (POST / PATCH / PUT / DELETE) return fake responses
 * instead of touching the real database.
 *
 * GET requests always pass through to the real fetch so the tour sees live
 * read data (project list, user list, etc.).
 *
 * Usage:
 *   activateInterceptor(SITE_TOUR_FIXTURES);   // call when tour starts
 *   deactivateInterceptor();                   // call when tour ends
 */

import type { MockFixture } from "./types";

let _originalFetch: typeof fetch | null = null;
let _fixtures: MockFixture[] = [];

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function activateInterceptor(fixtures: MockFixture[]): void {
  if (typeof window === "undefined") return;
  if (_originalFetch) return; // already active — avoid double-patching
  _fixtures = fixtures;
  _originalFetch = window.fetch;
  window.fetch = patchedFetch as typeof fetch;
}

export function deactivateInterceptor(): void {
  if (typeof window === "undefined" || !_originalFetch) return;
  window.fetch = _originalFetch;
  _originalFetch = null;
  _fixtures = [];
}

export function isInterceptorActive(): boolean {
  return _originalFetch !== null;
}

async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;

  const method = (
    init?.method ??
    (input instanceof Request ? input.method : "GET")
  ).toUpperCase();

  // Only intercept mutations — GETs pass through
  if (!MUTATION_METHODS.has(method)) {
    return _originalFetch!(input, init);
  }

  const fixture = _fixtures.find((f) => {
    if (f.match.method !== method) return false;
    return typeof f.match.urlPattern === "string"
      ? url.includes(f.match.urlPattern)
      : f.match.urlPattern.test(url);
  });

  if (!fixture) {
    return _originalFetch!(input, init);
  }

  if (fixture.response.delay) {
    await new Promise<void>((r) => setTimeout(r, fixture.response.delay));
  }

  return new Response(JSON.stringify(fixture.response.body), {
    status: fixture.response.status,
    headers: { "Content-Type": "application/json" },
  });
}

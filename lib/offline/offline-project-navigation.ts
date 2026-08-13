/**
 * Offline navigation for pre-downloaded projects.
 *
 * Client-side App Router navigation (router.push) still fetches RSC payloads
 * over the network and fails in airplane mode. Pre-downloaded HTML in pages-v1
 * is opened via the Cache API; production also falls back to SW document nav.
 */

import {
  openCachedProjectPage,
} from "@/lib/offline/pages-cache";

export interface ProjectNavRouter {
  push: (href: string) => void;
}

export function projectDetailPath(locale: string, projectId: string): string {
  return `/${locale}/projects/${projectId}`;
}

export function hasActiveServiceWorker(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller != null
  );
}

/** Production SW serves warmed pages on navigate; dev SW is NetworkOnly. */
export function canServeOfflineDocumentNav(): boolean {
  return hasActiveServiceWorker() && process.env.NODE_ENV === "production";
}

/** Prefer navigator.onLine when React state is still hydrated as online. */
export function isEffectivelyOffline(isOnline: boolean): boolean {
  if (!isOnline) return true;
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export function shouldUseOfflineDocumentNav(
  isOnline: boolean,
  isPreDownloaded: boolean,
): boolean {
  return isEffectivelyOffline(isOnline) && isPreDownloaded;
}

export type OfflineProjectNavResult = "document" | "client" | "unavailable";

export async function navigateToProjectDetail(params: {
  locale: string;
  projectId: string;
  isOnline: boolean;
  isPreDownloaded: boolean;
  router: ProjectNavRouter;
}): Promise<OfflineProjectNavResult> {
  if (!shouldUseOfflineDocumentNav(params.isOnline, params.isPreDownloaded)) {
    params.router.push(`/projects/${params.projectId}`);
    return "client";
  }

  const openedFromCache = await openCachedProjectPage(params.locale, params.projectId);
  if (openedFromCache) return "document";

  if (canServeOfflineDocumentNav()) {
    window.location.assign(projectDetailPath(params.locale, params.projectId));
    return "document";
  }

  return "unavailable";
}

/** For next-intl Link — call from onClick; no-op when online or not pre-downloaded. */
export async function handleOfflineProjectLinkClick(
  event: { preventDefault: () => void },
  params: {
    locale: string;
    projectId: string;
    isOnline: boolean;
    isPreDownloaded: boolean;
    router: ProjectNavRouter;
  },
): Promise<OfflineProjectNavResult> {
  if (!shouldUseOfflineDocumentNav(params.isOnline, params.isPreDownloaded)) {
    return "client";
  }
  event.preventDefault();
  return navigateToProjectDetail(params);
}

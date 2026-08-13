"use client";

import { useEffect } from "react";

const SW_CLEANED_KEY = "devtools-sw-cleaned";

/** Module-level guard — React Strict Mode runs effects twice before reload completes. */
let reloadScheduled = false;

/**
 * Development-only: unregisters any stale service workers left over from
 * production builds. The PWA plugin disables SW registration in dev mode, but
 * a previously registered SW persists in the browser across sessions, which can
 * cause navigator.onLine to flip false and block API requests.
 *
 * If a service worker is actively controlling the page when it's unregistered,
 * a one-time reload is triggered so the SW-free state takes effect immediately.
 * Without the reload, the old SW continues to intercept requests for this tab
 * until the next navigation, which can cause mysterious crashes and request
 * failures in the dev environment.
 *
 * This component is never rendered in production (see app/layout.tsx).
 */
export function DevSwCleanup() {
  useEffect(() => {
    // Offline QA via ngrok keeps the SW + caches (see PWA_DEV_ENABLED in next.config).
    if (process.env.NEXT_PUBLIC_PWA_DEV_ENABLED === "true") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.getRegistrations().then((registrations) => {
      if (registrations.length === 0) return;

      let hadActiveController = false;
      const unregisterPromises = registrations.map((reg) => {
        if (navigator.serviceWorker.controller) hadActiveController = true;
        return reg.unregister();
      });

      // Clear workbox / next-pwa caches so stale responses don't linger
      const clearCaches =
        "caches" in window
          ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          : Promise.resolve();

      Promise.all([...unregisterPromises, clearCaches]).then(() => {
        // If the SW was actively controlling this tab, reload once so the
        // browser uses the dev server directly (no SW interception).
        // sessionStorage + reloadScheduled prevent Strict Mode / double-effect loops.
        if (
          hadActiveController &&
          !sessionStorage.getItem(SW_CLEANED_KEY) &&
          !reloadScheduled
        ) {
          reloadScheduled = true;
          sessionStorage.setItem(SW_CLEANED_KEY, "1");
          window.location.reload();
        }
      });
    });
  }, []);

  return null;
}

/** Inline script for app/layout `<head>` — dev only, before React loads. */
export const DEV_SW_EARLY_CLEANUP_INLINE_SCRIPT = `
(function () {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (r) { r.unregister(); });
  });
  if (typeof caches !== "undefined" && caches.keys) {
    caches.keys().then(function (keys) {
      keys.forEach(function (k) { caches.delete(k); });
    });
  }
})();
`.trim();

/** Skip when ngrok offline QA intentionally keeps the PWA service worker (see DevSwCleanup). */
export function shouldInjectDevSwEarlyCleanup(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.PWA_DEV_ENABLED !== "true"
  );
}

/**
 * Dev-only offline routes (imported when PWA_DEV_ENABLED=true).
 * next-pwa dev mode registers NetworkOnly for all URLs; this capture-phase
 * handler serves warmed pages-v1 + next-static-assets before that rule runs.
 */
(function () {
  if (typeof self === "undefined") return;

  function isHtmlNavigation(request) {
    return (
      request.mode === "navigate" ||
      (request.headers.get("accept") || "").includes("text/html")
    );
  }

  async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        var key = new URL(request.url);
        key.search = "";
        await cache.put(key.toString(), response.clone());
      }
      return response;
    } catch {
      return cached || Response.error();
    }
  }

  async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      return Response.error();
    }
  }

  self.addEventListener(
    "fetch",
    function (event) {
      const request = event.request;
      if (request.method !== "GET") return;

      const url = new URL(request.url);
      if (url.origin !== self.location.origin) return;

      if (url.pathname.startsWith("/_next/static/")) {
        event.respondWith(cacheFirst(request, "next-static-assets"));
        return;
      }

      if (
        isHtmlNavigation(request) &&
        !url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/_next/")
      ) {
        event.respondWith(networkFirst(request, "pages-v1"));
      }
    },
    { capture: true },
  );
})();

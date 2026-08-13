import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import withPWA from "@ducanh2912/next-pwa";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ngrok tunneling: the "tunnel" script uses --host-header=localhost:3002 which rewrites
  // the Host header. However, ngrok ALSO adds X-Forwarded-Host with the public URL, which
  // Next.js 16 uses for its cross-origin check on dev resources (/_next/webpack-hmr etc.).
  // allowedDevOrigins whitelists those hostnames so the HMR WebSocket and RSC endpoints
  // are not blocked — without this, React never completes hydration via ngrok.
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.io",
    "*.ngrok.app",
    "*.ngrok.dev",
  ],
  // turbopack: {} is present but the dev server always runs with --webpack (see package.json "dev" script).
  // @ducanh2912/next-pwa requires webpack at compile time to inject the service worker registration
  // shim. If --webpack is ever removed from the dev script, PWA hot-reload will silently break.
  turbopack: {},
  // Expose the Railway git SHA at build time so ReleaseTourBanner can detect new deploys
  // client-side without an API call. Falls back to "dev" in local development.
  env: {
    NEXT_PUBLIC_GIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    // Set PWA_DEV_ENABLED=true locally to register the SW via ngrok for offline QA.
    NEXT_PUBLIC_PWA_DEV_ENABLED:
      process.env.PWA_DEV_ENABLED === "true" ? "true" : "",
  },
  experimental: {
    // Disable Turbopack filesystem cache to avoid stale compiled output
    // (e.g. Prisma invite.findMany errors after migrating to $queryRaw)
    turbopackFileSystemCacheForDev: false,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Replace watch ignore list — merging with Next's default can inject invalid
      // empty entries that crash webpack (ValidationError on ignored[0]).
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/__tests__/**",
          "**/docs/**",
          "**/.cursor/**",
        ],
      };
    }
    return config;
  },
};

export default withNextIntl(withPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: false,
  disable:
    process.env.NODE_ENV === "development" &&
    process.env.PWA_DEV_ENABLED !== "true",
  // Pre-cache the offline fallback page so it can be served when a navigation
  // fails with no network AND no cached version of the requested page.
  // Uses the English locale; acceptable for an error-state fallback.
  fallbacks: {
    document: "/en/offline",
  },
  workboxOptions: {
    disableDevLogs: true,
    importScripts:
      process.env.NODE_ENV === "development" &&
      process.env.PWA_DEV_ENABLED === "true"
        ? ["/offline-sw-routes.js"]
        : undefined,
    // Activate the new SW immediately on install so users get the latest
    // version without having to close all tabs. Combined with clientsClaim,
    // this ensures that after every deploy the updated SW is in control and
    // the EagerSyncActivator's auto-warm populates the correct cache version.
    skipWaiting: true,
    clientsClaim: true,

    // ── Runtime caching rules ──────────────────────────────────────────
    // These complement the auto-generated precache manifest. Each rule
    // runs at service-worker install time and handles fetch events.
    runtimeCaching: [
      // Offline data snapshot — NetworkFirst with long cache.
      // When the user hits "Sync Now", the client manually writes to
      // the "offline-data-v1" cache. This rule covers automatic SW
      // interception as a fallback.
      {
        urlPattern: /^\/api\/offline\/snapshot/,
        handler: "NetworkFirst",
        options: {
          cacheName: "offline-data-v1",
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 1, maxAgeSeconds: 86400 }, // 24h
          cacheableResponse: { statuses: [0, 200] },
        },
      },

      // Offline preferences — NetworkFirst, short TTL.
      {
        urlPattern: /^\/api\/offline\/preferences/,
        handler: "NetworkFirst",
        options: {
          cacheName: "offline-prefs-v1",
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 1, maxAgeSeconds: 3600 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },

      // Next.js static assets — CacheFirst (hashed filenames, safe to
      // cache indefinitely).
      {
        urlPattern: /\/_next\/static\/.+/,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static-assets",
          expiration: { maxEntries: 200, maxAgeSeconds: 2592000 }, // 30d
          cacheableResponse: { statuses: [0, 200] },
          matchOptions: { ignoreSearch: true },
        },
      },

      // App pages (non-API) — NetworkFirst so fresh content always
      // wins when online; falls back to cache when offline.
      {
        urlPattern: ({ request, url }: { request: Request; url: URL }) =>
          url.origin === self.location.origin &&
          !url.pathname.startsWith("/api/") &&
          (request.mode === "navigate" ||
            request.headers.get("accept")?.includes("text/html")),
        handler: "NetworkFirst",
        options: {
          cacheName: "pages-v1",
          networkTimeoutSeconds: 8,
          // 6 sub-pages × 2 locales = ~60 entries needed.
          // 64 was too low for multi-project pre-download; 128 fits ~6 projects.
          expiration: { maxEntries: 128, maxAgeSeconds: 86400 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },

      // File upload routes — NetworkOnly: POST requests with large file bodies must not
      // be intercepted with a timeout. The 10-second NetworkFirst timeout on the generic
      // /api/* rule below would silently drop large uploads on slow mobile connections,
      // causing the "Failed to upload file N" error in the field. NetworkOnly bypasses
      // the SW entirely and lets the browser handle the full upload natively.
      {
        urlPattern: /^\/api\/upload\//,
        handler: "NetworkOnly",
      },

      // Units endpoint — ignoreSearch: true lets the cached /api/projects/:id/units
      // (no params, warmed by triggerResync) serve as a fallback when the app requests
      // /api/projects/:id/units?limit=25 etc. Scoped narrowly to /units only — applying
      // ignoreSearch broadly would collapse observations, issues, album, and activity
      // into the same cache entry per path, serving the wrong response offline.
      {
        urlPattern: /^\/api\/projects\/[^/]+\/units(\?|$)/,
        handler: "NetworkFirst",
        options: {
          cacheName: "project-api-v2",
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 128, maxAgeSeconds: 86400 },
          cacheableResponse: { statuses: [0, 200] },
          matchOptions: { ignoreSearch: true },
        },
      },

      // All other project API routes — NetworkFirst, query strings kept in cache key.
      // Must appear BEFORE the generic /api/* rule (first match wins in Workbox).
      {
        urlPattern: /^\/api\/projects\//,
        handler: "NetworkFirst",
        options: {
          cacheName: "project-api-v2",
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 256, maxAgeSeconds: 86400 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },

      // Form builder GET /api/forms — NetworkOnly (Workbox runtime routes default to GET).
      // Workbox still handles the fetch but always goes to the network (no cache read/write).
      {
        urlPattern: /^\/api\/forms(\/|$)/,
        handler: "NetworkOnly",
        method: "GET",
      },
      // Form mutations — explicit methods so POST/PATCH/DELETE skip the NetworkFirst API rule below.
      {
        urlPattern: /^\/api\/forms(\/|$)/,
        handler: "NetworkOnly",
        method: "POST",
      },
      {
        urlPattern: /^\/api\/forms(\/|$)/,
        handler: "NetworkOnly",
        method: "PATCH",
      },
      {
        urlPattern: /^\/api\/forms(\/|$)/,
        handler: "NetworkOnly",
        method: "DELETE",
      },

      // Generic same-origin API routes — NetworkFirst, short TTL.
      // Auth routes are excluded (never cache credentials).
      {
        urlPattern: ({ url }: { url: URL }) =>
          url.origin === self.location.origin &&
          url.pathname.startsWith("/api/") &&
          !url.pathname.startsWith("/api/auth/"),
        handler: "NetworkFirst",
        options: {
          cacheName: "api-responses-v1",
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 64, maxAgeSeconds: 3600 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },

      // Images & fonts — StaleWhileRevalidate for quick loads.
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "static-media-v1",
          expiration: { maxEntries: 64, maxAgeSeconds: 604800 }, // 7d
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
})(nextConfig));

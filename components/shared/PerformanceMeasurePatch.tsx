"use client";

import { useEffect } from "react";

/**
 * Development-only workaround for vercel/next.js#86060 / facebook/react#32823.
 *
 * React 19's internal RSC performance instrumentation initialises childrenEndTime
 * to -Infinity and only updates it when children are processed. When a server
 * component aborts early (e.g. returns null for unauthenticated users), the
 * variable stays at -Infinity. React then calls:
 *
 *   performance.measure('\u200bProjectsPage', { start: -Infinity })
 *
 * The browser throws: "Failed to execute 'measure' on 'Performance':
 * '<page name>' cannot have a negative time stamp."
 *
 * This is a non-breaking dev-mode console error — page functionality is
 * unaffected and the error never appears in production builds. The upstream
 * fix lives in React core; this patch suppresses the noise until Next.js ships
 * a bundled React version that includes it.
 */
export function PerformanceMeasurePatch() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof performance === "undefined") return;

    // Save the raw reference so the cleanup can restore it exactly (not a bound
    // copy — .bind() produces a new function object each call, so restoring the
    // bound copy would leave a different reference on performance.measure).
    const originalRef = performance.measure;
    // Bound version preserves the `performance` context when forwarding calls,
    // preventing "Illegal invocation" errors in browsers that enforce it.
    const originalBound = performance.measure.bind(performance);

    performance.measure = function (
      ...args: Parameters<typeof performance.measure>
    ): PerformanceMeasure {
      try {
        return originalBound(...args);
      } catch (e) {
        if (
          e instanceof TypeError &&
          typeof e.message === "string" &&
          e.message.includes("negative time stamp")
        ) {
          // Suppress — React dev instrumentation fires this when an RSC component
          // returns early (null / notFound / redirect) before its children render.
          return {} as PerformanceMeasure;
        }
        throw e;
      }
    };

    return () => {
      performance.measure = originalRef;
    };
  }, []);

  return null;
}

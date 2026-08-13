"use client";

/**
 * NewDeployTourTrigger — silently detects new deploys and auto-starts the TourPlayer.
 *
 * Detection:
 *   1. On mount, compare NEXT_PUBLIC_GIT_SHA against localStorage("last-seen-sha").
 *   2. If they match, this deploy has already been seen — do nothing.
 *   3. Fetch GET /api/releases/latest-new.
 *   4. If a tour is attached, dispatch "tour:request" → TourPlayer starts automatically.
 *   5. Write the current SHA to localStorage so this deploy is not triggered again.
 *   6. If no tour exists (204 or empty steps), just write the SHA silently.
 *
 * Renders nothing — no visible UI. TourPlayer's existing close button handles dismiss.
 */

import { useEffect } from "react";

const SHA_KEY = "last-seen-sha";
const BUILD_SHA = process.env.NEXT_PUBLIC_GIT_SHA ?? "dev";

// Keep in sync with SiteTourLauncher.tsx — bump both when the site tour resets.
const SITE_TOUR_SEEN_KEY = "cc-site-tour-v2-seen";

interface LatestNewResponse {
  release: { id: string };
  tour: { steps: unknown[] };
}

export function NewDeployTourTrigger() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(SHA_KEY) === BUILD_SHA) return;

    // New users haven't seen the site tour yet — SiteTourLauncher owns their
    // first-run experience. Mark the SHA seen and skip the release tour so the
    // async fetch doesn't interrupt the onboarding tour mid-step.
    if (!localStorage.getItem(SITE_TOUR_SEEN_KEY)) {
      localStorage.setItem(SHA_KEY, BUILD_SHA);
      return;
    }

    void (async () => {
      try {
        const res = await fetch("/api/releases/latest-new");
        if (res.ok && res.status !== 204) {
          const data = (await res.json()) as LatestNewResponse;
          if (data.tour?.steps?.length) {
            window.dispatchEvent(
              new CustomEvent("tour:request", {
                detail: { releaseId: data.release.id },
              })
            );
          }
        }
      } catch {
        // Network error — skip silently, retry on next page load
        return;
      }
      localStorage.setItem(SHA_KEY, BUILD_SHA);
    })();
  }, []);

  return null;
}

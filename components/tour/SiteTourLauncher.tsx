"use client";

import { useEffect } from "react";

/**
 * SiteTourLauncher
 *
 * Mounts silently in the dashboard layout. On first visit (no localStorage flag)
 * it primes TourPlayer to launch the full site walkthrough automatically.
 *
 * Storage keys:
 *   localStorage  "cc-site-tour-v1-seen"  Set once to prevent re-triggering
 *   sessionStorage "pendingTour"           Read by TourPlayer on the next render
 *
 * Increment the version suffix (v1 → v2) in TOUR_SEEN_KEY when the tour
 * content changes significantly enough to warrant re-showing to existing users.
 */

// Bump the version suffix when tour content changes significantly enough
// to warrant re-showing to existing users (e.g. v2 → v3 after the next
// full tour update). Flip TEMPORARILY_DISABLED back to false at the same time.
const TOUR_SEEN_KEY = "cc-site-tour-v2-seen";

// Set to true while the tour content is out of date. Auto-launch is suppressed
// so first-time users are not shown a stale walkthrough. The localStorage seen
// flag is intentionally NOT written when disabled — flip this to false (and bump
// TOUR_SEEN_KEY if needed) once the tour is updated and the auto-launch should
// resume for users who have never seen the new version.
const TEMPORARILY_DISABLED = true;

export function SiteTourLauncher() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (TEMPORARILY_DISABLED) return;

    const alreadySeen = localStorage.getItem(TOUR_SEEN_KEY);
    if (alreadySeen) return;

    // Don't overwrite a release/feedback tour already queued by TourDeepLinkHandler.
    if (sessionStorage.getItem("pendingTour")) return;

    // Mark seen immediately so a fast page refresh during the tour doesn't
    // re-queue a second tour on top of the one already playing.
    localStorage.setItem(TOUR_SEEN_KEY, "1");

    // Prime TourPlayer — it reads this on its own mount cycle.
    // autoPlay is intentionally false so users navigate at their own pace
    // by clicking the Next button. Voice narration still plays per step.
    sessionStorage.setItem(
      "pendingTour",
      JSON.stringify({ siteTour: true, autoPlay: false })
    );
  }, []);

  return null;
}

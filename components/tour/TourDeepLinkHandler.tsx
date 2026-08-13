"use client";

/**
 * TourDeepLinkHandler — reads a `?tour=<releaseId>` query param and primes
 * the TourPlayer to launch that tour automatically.
 *
 * Usage: mount this component anywhere inside the dashboard layout, before
 * TourPlayer. When the URL contains `?tour=<releaseId>`, this component writes
 * `{ releaseId }` to `sessionStorage("pendingTour")` and strips the param from
 * the URL so it doesn't persist on refresh.
 *
 * Example shareable link shape:
 *   https://<app-host>/en/projects?tour=<releaseId>
 *
 * TourPlayer picks up the pendingTour on mount and launches the tour.
 */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";

const PENDING_KEY = "pendingTour";

export function TourDeepLinkHandler() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const releaseId = searchParams.get("tour");
    if (!releaseId || typeof window === "undefined") return;

    // Write to sessionStorage so TourPlayer picks it up on (next) mount
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ releaseId }));
    } catch {
      // sessionStorage may be blocked in some privacy modes — fail silently
    }

    // Strip the ?tour= param from the URL without adding a history entry
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tour");
    const newSearch = params.toString();
    const newUrl = newSearch ? `${pathname}?${newSearch}` : pathname;
    router.replace(newUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

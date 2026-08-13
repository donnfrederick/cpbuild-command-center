"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function RouteAnnouncer() {
  const pathname = usePathname();

  useEffect(() => {
    // Move focus to the first h1 after route changes for screen readers.
    // tabindex="-1" is added only to make the element programmatically focusable,
    // then removed immediately — leaving it in the DOM causes a React hydration
    // mismatch when the Suspense boundary streams in fresh server HTML.
    // no-focus-ring only during programmatic focus — remove after, same as tabindex.
    // Leaving either attribute in the DOM causes hydration mismatch when Suspense
    // streams page content (common on ngrok / slow dev loads).
    const heading = document.querySelector<HTMLHeadingElement>("#main-content h1");
    if (heading) {
      heading.classList.add("no-focus-ring");
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
      heading.removeAttribute("tabindex");
      heading.classList.remove("no-focus-ring");
    }
  }, [pathname]);

  return null;
}

import type { MouseEvent } from "react";

export function shouldStartNavigation(event: MouseEvent<HTMLAnchorElement>): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  return true;
}

export function pathnameFromHref(href: string): string {
  try {
    const url = new URL(href, "http://localhost");
    return url.pathname;
  } catch {
    return href.split("?")[0] ?? href;
  }
}

export function isSameRoutePathname(currentPathname: string, targetHref: string): boolean {
  const targetPathname = pathnameFromHref(targetHref);
  return currentPathname === targetPathname;
}

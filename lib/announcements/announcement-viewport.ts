export type AnnouncementViewportMode = "mobile" | "tablet" | "desktop";

export const MOBILE_MAX_WIDTH_PX = 767;
export const TABLET_MAX_WIDTH_PX = 1023;

/** Pure helper — unit-test at boundary widths. */
export function getAnnouncementViewportMode(width: number): AnnouncementViewportMode {
  if (width <= MOBILE_MAX_WIDTH_PX) return "mobile";
  if (width <= TABLET_MAX_WIDTH_PX) return "tablet";
  return "desktop";
}

/** Extra tail space so the last sticky building header can scroll to the top of the modal frame. */
export function computeLevelScopeModalScrollTailPadding(
  scrollViewportHeight: number,
  lastBuildingHeadHeight: number,
  lastBuildingLevelsHeight: number,
  footerHeight: number,
): number {
  if (scrollViewportHeight <= 0) return 0;
  return Math.max(
    0,
    Math.ceil(
      scrollViewportHeight -
        lastBuildingHeadHeight -
        lastBuildingLevelsHeight -
        footerHeight,
    ),
  );
}

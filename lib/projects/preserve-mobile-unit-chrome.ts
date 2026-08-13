/**
 * Pin mobile viewport flags while unit/inspection chrome is open so rotating
 * the phone (crossing the 767px breakpoint) does not unmount the unit modal
 * or inspection overlay.
 */

export interface PinMobileLayoutInput {
  live: boolean;
  pinned: boolean | null;
  preserveChrome: boolean;
}

/** Update the pinned snapshot when preserve-chrome toggles. */
export function nextPinnedBoolean({
  live,
  pinned,
  preserveChrome,
}: PinMobileLayoutInput): boolean | null {
  if (!preserveChrome) return null;
  if (pinned === null) return live;
  return pinned;
}

/** Effective layout flag: pinned value while chrome is preserved, else live. */
export function effectiveBoolean({
  live,
  pinned,
}: {
  live: boolean;
  pinned: boolean | null;
}): boolean {
  return pinned ?? live;
}

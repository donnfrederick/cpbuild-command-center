"use client";

import { useSyncExternalStore } from "react";

const DESKTOP_DETAIL_PANEL_MQ = "(min-width: 768px)";

function subscribe(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(DESKTOP_DETAIL_PANEL_MQ);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getDesktopDetailPanelSnapshot(): boolean {
  return window.matchMedia(DESKTOP_DETAIL_PANEL_MQ).matches;
}

/** True at md+ — use side panel; below md use bottom sheet for location detail modals. */
export function useDesktopDetailPanel(): boolean {
  return useSyncExternalStore(
    subscribe,
    getDesktopDetailPanelSnapshot,
    () => false,
  );
}

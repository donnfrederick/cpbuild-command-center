"use client";

import { createPortal } from "react-dom";
import { useIsBrowser } from "@/hooks/use-is-browser";
import { InspectionSyncStatusStrip } from "@/components/projects/inspections/InspectionSyncStatusStrip";

/**
 * Global top banner for inspection sync status — out of the way of bottom
 * controls (nav, camera shutter, form submit). Clicks pass through the banner.
 */
export function InspectionSyncStatusHost() {
  const isBrowser = useIsBrowser();

  if (!isBrowser) return null;

  return createPortal(
    <div
      data-testid="inspection-sync-status-host"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: 0,
        zIndex: 280,
        padding: "calc(6px + env(safe-area-inset-top, 0px)) 10px 0",
        pointerEvents: "none",
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <InspectionSyncStatusStrip />
      </div>
    </div>,
    document.body,
  );
}

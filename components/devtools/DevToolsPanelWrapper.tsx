"use client";

/**
 * Client-only wrapper to avoid hydration mismatch.
 * Visible to any role with ACCESS_DEVTOOLS (ADMIN, DESIGNER, DEVELOPER).
 */
import { useSyncExternalStore } from "react";
import { DevToolsPanel } from "./DevToolsPanel";
import { DevToolsAlerts } from "./DevToolsAlerts";

// subscribe is a no-op: mounted never changes after initial render
function subscribe() {
  return () => {};
}

interface Props {
  /** When true, render the dev tray. True for any role with ACCESS_DEVTOOLS. */
  canUseDevTools?: boolean;
  /**
   * The APP_ENV value from the server (e.g. "dev", "production").
   * Undefined means local development — all tabs are shown.
   */
  appEnv?: string;
}

export function DevToolsPanelWrapper({ canUseDevTools = false, appEnv }: Props) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  const shouldShow = mounted && canUseDevTools;

  if (!shouldShow) return null;

  return (
    <>
      <DevToolsPanel appEnv={appEnv} />
      <DevToolsAlerts />
    </>
  );
}

/**
 * browser.ts — MSW browser worker for sandbox mode
 *
 * Lazily initializes the MSW service worker on first use.
 * The worker is a singleton — only one instance exists across the app.
 *
 * Usage in sandbox mode toggle:
 *   import { startSandbox, stopSandbox } from "@/lib/msw/browser";
 *   await startSandbox();   // enables request interception
 *   await stopSandbox();    // disables, real API calls resume
 */

import { type SetupWorker } from "msw/browser";

let worker: SetupWorker | null = null;
let started = false;

async function getWorker(): Promise<SetupWorker> {
  if (!worker) {
    // Dynamic import keeps MSW out of the server bundle
    const { setupWorker } = await import("msw/browser");
    const { sandboxHandlers } = await import("./browser-handlers");
    worker = setupWorker(...sandboxHandlers);
  }
  return worker;
}

/**
 * Start the MSW service worker and begin intercepting API calls.
 * Safe to call multiple times — only starts once.
 */
export async function startSandbox(): Promise<void> {
  if (started) return;
  const w = await getWorker();
  await w.start({
    onUnhandledRequest: "bypass", // non-mocked requests pass through normally
    serviceWorker: { url: "/mockServiceWorker.js" },
  });
  started = true;
}

/**
 * Stop the MSW service worker and restore normal API calls.
 */
export async function stopSandbox(): Promise<void> {
  if (!worker || !started) return;
  worker.stop();
  started = false;
}

/** Whether the sandbox worker is currently active. */
export function isSandboxActive(): boolean {
  return started;
}

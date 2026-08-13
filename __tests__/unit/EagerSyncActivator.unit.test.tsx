/**
 * EagerSyncActivator.unit.test.tsx
 *
 * Tests the silent auto-warm on project entry and the module-level
 * 5-minute cooldown that prevents excessive downloads.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockTriggerResync = vi.fn().mockResolvedValue({ ok: true, syncedAt: "2026-04-08T12:00:00Z" });
const mockActivateEagerSync  = vi.fn();
const mockDeactivateEagerSync = vi.fn();

vi.mock("@/lib/offline/background-sync", () => ({
  triggerResync: mockTriggerResync,
  activateEagerSync: mockActivateEagerSync,
  deactivateEagerSync: mockDeactivateEagerSync,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderActivator(projectId: string) {
  // Dynamic import so each test gets a fresh module if needed
  const { EagerSyncActivator } = await import(
    "@/components/projects/EagerSyncActivator"
  );
  const { unmount } = render(<EagerSyncActivator projectId={projectId} />);
  return { unmount };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("EagerSyncActivator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset navigator.onLine to true for each test
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("calls triggerResync with warmHtml: minimal and autoForce: true on mount when online", async () => {
    // Reset the module-level cooldown map by reimporting with a fresh timestamp
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));

    await renderActivator("proj-online");

    // minimal warms a small HTML set (en-only) without the full 12-page blast.
    expect(mockTriggerResync).toHaveBeenCalledWith(
      ["proj-online"],
      undefined,
      { warmHtml: "minimal", autoForce: true }
    );
  });

  it("does NOT call triggerResync when navigator.onLine is false", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    vi.setSystemTime(new Date("2026-04-08T01:00:00Z"));

    await renderActivator("proj-offline");

    expect(mockTriggerResync).not.toHaveBeenCalled();
  });

  it("activates eager sync interval on mount", async () => {
    vi.setSystemTime(new Date("2026-04-08T02:00:00Z"));

    await renderActivator("proj-eager");

    expect(mockActivateEagerSync).toHaveBeenCalledWith("proj-eager");
  });

  it("deactivates eager sync on unmount", async () => {
    vi.setSystemTime(new Date("2026-04-08T03:00:00Z"));

    const { unmount } = await renderActivator("proj-unmount");
    unmount();

    expect(mockDeactivateEagerSync).toHaveBeenCalledOnce();
  });

  it("respects the 5-minute cooldown — second mount within 5 min does not trigger auto-warm again", async () => {
    // Use a unique project ID so there's no cooldown state from other tests
    const projectId = "proj-cooldown-test";

    // First mount — triggers auto-warm
    vi.setSystemTime(new Date("2026-04-08T04:00:00Z"));
    const { unmount: unmount1 } = await renderActivator(projectId);
    expect(mockTriggerResync).toHaveBeenCalledTimes(1);
    unmount1();

    // Second mount 2 minutes later — within 5-min cooldown window
    vi.setSystemTime(new Date("2026-04-08T04:02:00Z"));
    const { unmount: unmount2 } = await renderActivator(projectId);
    // Still only called once — cooldown prevents second call
    expect(mockTriggerResync).toHaveBeenCalledTimes(1);
    unmount2();
  });
});

/** @vitest-environment jsdom */
/**
 * OfflineProjectButton.hydration.unit.test.tsx
 *
 * SSR → hydrate contract: server HTML must match client first paint when
 * localStorage has cached offline prefs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect, useState, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { act, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { OfflineProjectButton } from "@/components/projects/OfflineProjectButton";
import { OfflineSyncProvider } from "@/hooks/offline-sync-context";
import {
  resetLocalOfflinePrefsStoreForTests,
  writeLocalOfflinePrefs,
} from "@/lib/offline/offline-prefs-local";
import type { OfflineProjectButtonProps } from "@/components/projects/OfflineProjectButtonClient";

vi.mock("next/dynamic", () => ({
  default: (
    loader: () => Promise<ComponentType<OfflineProjectButtonProps>>,
    options?: { loading?: () => React.ReactNode; ssr?: boolean },
  ) => {
    return function DynamicOfflineButtonMock(props: OfflineProjectButtonProps) {
      const [Client, setClient] = useState<ComponentType<OfflineProjectButtonProps> | null>(
        null,
      );
      useEffect(() => {
        void loader().then((Comp) => setClient(() => Comp));
      }, []);
      if (!Client) {
        return options?.loading?.() ?? null;
      }
      return <Client {...props} />;
    };
  },
}));

const mockTriggerResync = vi.fn();

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true, wasOffline: false }),
}));

vi.mock("@/lib/offline/mutation-queue", () => ({
  getPendingCount: vi.fn().mockResolvedValue(0),
  flushMutationQueue: vi.fn().mockResolvedValue({ flushed: 0, failed: 0 }),
}));

vi.mock("@/lib/offline/background-sync", () => ({
  triggerResync: (...args: unknown[]) => mockTriggerResync(...args),
  cancelActiveResync: vi.fn(),
}));

vi.mock("@/lib/inspections/useInspectionSync", () => ({
  useInspectionSync: () => ({
    pendingInspectionCount: 0,
    isInspectionSyncing: false,
  }),
}));

vi.mock("@/components/projects/PreDownloadProgressOverlay", () => ({
  PreDownloadProgressOverlay: () => null,
}));
vi.mock("@/components/shared/PendingInspectionOpenHost", () => ({
  PendingInspectionOpenHost: () => null,
}));
vi.mock("@/components/shared/PendingMutationOpenHost", () => ({
  PendingMutationOpenHost: () => null,
}));
vi.mock("@/components/shared/StatusPhotoRetakeHost", () => ({
  StatusPhotoRetakeHost: () => null,
}));

const messages = {
  offlineProjectButton: {
    preDownload: "Pre-download",
    preDownloadAriaLabel: "Pre-download project for offline use",
    preDownloaded: "Pre-downloaded",
    readyAriaLabel: "Pre-downloaded — tap to refresh",
    readyAriaLabelWithTime: "Pre-downloaded {time} — tap to refresh",
    downloading: "Downloading {pct}%",
    downloadingAriaLabel: "Downloading — {pct}% complete",
    stale: "Stale — refresh",
    staleAriaLabel: "Offline data stale — tap to refresh",
    error: "Failed — retry",
    errorAriaLabel: "Download failed — tap to retry",
    disableAriaLabel: "Remove offline download",
  },
};

function TestTree() {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <OfflineSyncProvider>
        <OfflineProjectButton projectId="proj-cached" projectName="Cached Project" compact />
      </OfflineSyncProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLocalOfflinePrefsStoreForTests();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-06-19T12:05:00.000Z"));
  mockTriggerResync.mockResolvedValue({ ok: true, syncedAt: "2026-06-19T12:05:00.000Z" });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        offlineProjectIds: ["proj-cached"],
        projectSyncedAt: { "proj-cached": "2026-06-19T12:04:00.000Z" },
      }),
    }),
  );
  writeLocalOfflinePrefs({
    offlineProjectIds: ["proj-cached"],
    projectSyncedAt: { "proj-cached": "2026-06-19T12:04:00.000Z" },
  });
});

afterEach(() => {
  vi.useRealTimers();
  resetLocalOfflinePrefsStoreForTests();
});

describe("OfflineProjectButton SSR hydration", () => {
  it("server HTML is placeholder-only (no cached ready label)", () => {
    const html = renderToString(<TestTree />);
    expect(html).toContain("Pre-download project for offline use");
    expect(html).not.toMatch(/Pre-downloaded .* tap to refresh/i);
  });

  it("hydrateRoot emits no hydration errors against server HTML", async () => {
    const element = <TestTree />;
    const html = renderToString(element);
    const container = document.createElement("div");
    container.innerHTML = html;

    const hydrationErrors: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      const msg = args.map(String).join(" ");
      if (msg.includes("Hydration failed") || msg.includes("hydration-mismatch")) {
        hydrationErrors.push(msg);
      }
      origError(...args);
    };

    try {
      await act(async () => {
        hydrateRoot(container, element);
      });
    } finally {
      console.error = origError;
    }

    expect(hydrationErrors).toHaveLength(0);
  });

  it("eventually shows cached ready state after dynamic client chunk loads", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<TestTree />);
    });

    await waitFor(() => {
      expect(container.textContent).toMatch(/minute/i);
    });

    root.unmount();
  });
});

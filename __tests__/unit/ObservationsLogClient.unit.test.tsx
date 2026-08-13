import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";

vi.mock("@/hooks/use-register-offline-cache-view", () => ({
  useRegisterOfflineCacheView: vi.fn(),
}));

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true, wasOffline: false }),
}));

vi.mock("@/lib/offline/snapshot-project-reads", () => ({
  readSnapshotObservationsForProject: vi.fn().mockResolvedValue(null),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/projects/ObservationDetailModal", () => ({
  ObservationDetailModal: () => null,
}));

function makeObs(id: string, title: string) {
  return {
    id,
    observationType: "QUALITY",
    title,
    description: title,
    unitRef: "||",
    createdAt: "2026-07-01T12:00:00.000Z",
    author: { id: "u1", name: "Admin", email: "admin@test.com" },
    attachments: [],
    _count: { comments: 0 },
  };
}

const MOCK_OBS = [
  makeObs("obs-aaa", "First observation"),
  makeObs("obs-bbb", "Second observation"),
];

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("ObservationsLogClient PDF export selection", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/observations/export-pdf")) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        });
      }
      if (url.includes("/observations") && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ observations: MOCK_OBS }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(HTMLAnchorElement.prototype, "click", {
      configurable: true,
      value: vi.fn(),
    });
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports all filtered observations in normal mode", async () => {
    const user = userEvent.setup();
    const { ObservationsLogClient } = await import("@/components/projects/ObservationsLogClient");

    render(
      <Wrapper>
        <ObservationsLogClient projectId="proj-1" projectName="Demo Project" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("First observation")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Export observations as PDF" }));

    await waitFor(() => {
      const exportCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("/observations/export-pdf"),
      );
      expect(exportCall).toBeTruthy();
      const body = JSON.parse(String((exportCall![1] as RequestInit).body));
      expect(body.observationIds).toEqual(["obs-aaa", "obs-bbb"]);
      expect(body.obsTypes).toEqual([]);
    });
  });

  it("exports only selected observationIds in select mode", async () => {
    const user = userEvent.setup();
    const { ObservationsLogClient } = await import("@/components/projects/ObservationsLogClient");

    render(
      <Wrapper>
        <ObservationsLogClient projectId="proj-1" projectName="Demo Project" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("First observation")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("button", { name: /Select observation: First observation/i }));
    await user.click(screen.getByRole("button", { name: "Export selected observations as PDF" }));

    await waitFor(() => {
      const exportCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("/observations/export-pdf"),
      );
      expect(exportCall).toBeTruthy();
      const body = JSON.parse(String((exportCall![1] as RequestInit).body));
      expect(body.observationIds).toEqual(["obs-aaa"]);
      expect(body.filterSummary).toBe("1 selected observations");
      expect(body.obsTypes).toBeUndefined();
    });
  });
});

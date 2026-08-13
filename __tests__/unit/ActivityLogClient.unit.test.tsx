import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";

vi.mock("@/lib/offline/pending-activity", () => ({
  getPendingActivityEvents: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/hooks/use-register-offline-cache-view", () => ({
  useRegisterOfflineCacheView: vi.fn(),
}));

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true, wasOffline: false }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

const syncFailureEvent = {
  id: "evt-sync-fail",
  projectId: "proj-1",
  eventType: "INSPECTION_SYNC_FAILED" as const,
  userId: "u1",
  userName: "Tester",
  createdAt: "2026-06-25T10:10:00.000Z",
  metadata: {
    formName: "Clear Inspection",
    category: "CLEAR_INSPECTION",
    outcome: "PASS",
    offlineMutationId: "local-abc",
    building: "A",
    level: "1",
    unit: "101",
    syncErrors: [
      {
        attempt: 1,
        message: "HTTP 503: Service Unavailable",
        httpStatus: 503,
        errorKind: "retriable" as const,
        recordedAt: "2026-06-25T10:00:00.000Z",
      },
    ],
  },
};

describe("ActivityLogClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            events: [syncFailureEvent],
            nextCursor: null,
            totalCount: 1,
          }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens sync error detail modal when an INSPECTION_SYNC_FAILED card is clicked", async () => {
    const { ActivityLogClient } = await import("@/components/projects/ActivityLogClient");

    render(
      <Wrapper>
        <ActivityLogClient projectId="proj-1" projectName="Test Project" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(enMessages.activityLog.syncFailedBadge)).toBeInTheDocument();
    });

    await userEvent.click(
      screen.getByRole("button", { name: enMessages.activityLog.syncErrorCardAria }),
    );

    expect(screen.getByText(enMessages.activityLog.syncErrorDetail.title)).toBeInTheDocument();
    expect(screen.getByText("HTTP 503: Service Unavailable")).toBeInTheDocument();
  });
});

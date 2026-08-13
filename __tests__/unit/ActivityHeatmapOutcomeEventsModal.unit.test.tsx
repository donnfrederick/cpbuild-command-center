import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { ActivityHeatmapOutcomeEventsModal } from "@/components/reports/ActivityHeatmapOutcomeEventsModal";

const MESSAGES = {
  activityHeatmap: {
    outcomeEventsModalTitle: "{label} — {count} events",
    closeOutcomeEvents: "Close events list",
    loading: "Loading…",
    loadMore: "Load more",
    outcomeEventsEmpty: "No events for this reason.",
  },
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("ActivityHeatmapOutcomeEventsModal", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          events: [
            {
              activityLogId: "evt-1",
              summary: "Inspection submitted",
              createdAt: "2026-01-01T12:00:00.000Z",
              userName: "Alice",
              projectName: "Menchaca Apt Complex",
              distanceFromProjectMeters: 128,
            },
          ],
          nextCursor: null,
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and renders events when open", async () => {
    render(
      <Wrapper>
        <ActivityHeatmapOutcomeEventsModal
          open
          outcome="no_capture"
          outcomeLabel="Not captured"
          totalCount={3}
          scope="dashboard"
          projectIds={["proj-1"]}
          datePreset="7d"
          selectedUserIds={[]}
          onClose={vi.fn()}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("Inspection submitted")).toBeInTheDocument();
    });

    expect(screen.getByText(/Menchaca Apt Complex/)).toBeInTheDocument();
    expect(screen.getByText(/420 ft from project/)).toBeInTheDocument();

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("outcome=no_capture");
    expect(url).toContain("projectIds=proj-1");
  });
});

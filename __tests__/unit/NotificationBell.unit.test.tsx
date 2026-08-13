import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/en/dashboard",
}));

const messages = {
  notifications: {
    title: "Notifications",
    markAllRead: "Mark all as read",
    empty: "You're all caught up — no notifications yet.",
    unread: "unread",
    feedbackInProgress: "Your {type} is now in progress",
    feedbackResolved: "Your {type} has been resolved",
    typeBug: "bug report",
    typeFeature: "feature request",
    watchTour: "Watch the tour",
    viewFeedback: "View feedback",
    justNow: "Just now",
    minutesAgo: "{n}m ago",
    hoursAgo: "{n}h ago",
    daysAgo: "{n}d ago",
  },
  common: { close: "Close" },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

// ── Import component after mocks ───────────────────────────────────────────────

import { NotificationBell } from "@/components/notifications/NotificationBell";

// ── Test data ─────────────────────────────────────────────────────────────────

const RESOLVED_NOTIFICATION = {
  id: "notif-1",
  type: "FEEDBACK_RESOLVED" as const,
  read: false,
  createdAt: new Date().toISOString(),
  feedback: {
    id: "fb-1",
    type: "BUG" as const,
    title: "Upload button broken",
    status: "RESOLVED",
    tour: { id: "tour-1" },
  },
};

const IN_PROGRESS_NOTIFICATION = {
  id: "notif-2",
  type: "FEEDBACK_IN_PROGRESS" as const,
  read: false,
  createdAt: new Date().toISOString(),
  feedback: {
    id: "fb-2",
    type: "FEATURE_REQUEST" as const,
    title: "Export to PDF",
    status: "IN_PROGRESS",
    tour: null,
  },
};

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the bell button", () => {
    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>
    );
    expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
  });

  it("shows no unread badge when there are no notifications", async () => {
    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // No badge element should exist
    expect(document.querySelector("[aria-hidden='true'][style*='error-600']")).toBeNull();
  });

  it("shows unread count badge when there are unread notifications", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [RESOLVED_NOTIFICATION, IN_PROGRESS_NOTIFICATION],
      })
    );

    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>
    );

    // Open panel to trigger fetch
    const bell = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText("2 unread")).toBeInTheDocument();
    });
  });

  it("opens the notification panel on bell click", async () => {
    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>
    );
    const bell = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(bell);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /notifications/i })).toBeInTheDocument();
    });
  });

  it("shows empty state when there are no notifications", async () => {
    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>
    );
    const bell = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(bell);
    await waitFor(() => {
      expect(
        screen.getByText("You're all caught up — no notifications yet.")
      ).toBeInTheDocument();
    });
  });

  it("does not show 'Watch the tour' while user tour UI is disabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [RESOLVED_NOTIFICATION],
      })
    );

    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    await waitFor(() => {
      expect(screen.getByText(/Your bug report has been resolved/i)).toBeInTheDocument();
    });
    expect(screen.queryByText("Watch the tour")).not.toBeInTheDocument();
  });

  it("does NOT show 'Watch the tour' for IN_PROGRESS notifications", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [IN_PROGRESS_NOTIFICATION],
      })
    );

    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    await waitFor(() => {
      expect(screen.queryByText("Watch the tour")).not.toBeInTheDocument();
    });
  });

  it("calls mark-all-read API when 'Mark all as read' is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [RESOLVED_NOTIFICATION] });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    await waitFor(() => expect(screen.getByText("Mark all as read")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Mark all as read"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/mark-all-read",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("closes the panel on Escape key", async () => {
    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

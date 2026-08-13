import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── Component import ──────────────────────────────────────────────────────────

import { NotificationCard } from "@/components/notifications/NotificationCard";
import type { NotificationItem } from "@/components/notifications/NotificationCard";

// ── Messages ──────────────────────────────────────────────────────────────────

const messages = {
  notifications: {
    title: "Notifications",
    markAllRead: "Mark all as read",
    empty: "You're all caught up",
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
    feedbackAssignedYou: "You were assigned this feedback",
    feedbackAssignedBy: "{actor} assigned you this feedback",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const bugNotification: NotificationItem = {
  id: "n1",
  type: "FEEDBACK_IN_PROGRESS",
  read: false,
  createdAt: new Date().toISOString(),
  feedback: {
    id: "f1",
    type: "BUG",
    title: "Button broken",
    status: "IN_PROGRESS",
    tour: null,
  },
};

const resolvedWithTour: NotificationItem = {
  id: "n2",
  type: "FEEDBACK_RESOLVED",
  read: false,
  createdAt: new Date(Date.now() - 90 * 60_000).toISOString(),
  feedback: {
    id: "f2",
    type: "FEATURE_REQUEST",
    title: "Dark mode",
    status: "RESOLVED",
    tour: { id: "tour-1" },
  },
};

const readNotification: NotificationItem = {
  ...bugNotification,
  id: "n3",
  read: true,
};

const assignedNotification: NotificationItem = {
  id: "n-assign",
  type: "FEEDBACK_ASSIGNED",
  read: false,
  createdAt: new Date().toISOString(),
  actorName: "Alex",
  feedback: {
    id: "f-assign",
    type: "BUG",
    title: "Crash on save",
    status: "OPEN",
    tour: null,
  },
};

const mentionOnFeedback: NotificationItem = {
  id: "n-mention-fb",
  type: "MENTIONED_IN_COMMENT",
  read: false,
  createdAt: new Date().toISOString(),
  actorName: "Sam",
  mentionCommentId: "c1",
  projectId: null,
  issueId: null,
  observationId: null,
  feedback: {
    id: "f-mention",
    type: "BUG",
    title: "Inbox filters",
    status: "OPEN",
    tour: null,
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("NotificationCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the notification headline for a bug in-progress", () => {
    const onMarkRead = vi.fn();
    render(
      <Wrapper>
        <NotificationCard notification={bugNotification} onMarkRead={onMarkRead} onClose={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText(/bug report is now in progress/i)).toBeInTheDocument();
  });

  it("renders 'resolved' headline for a resolved notification", () => {
    render(
      <Wrapper>
        <NotificationCard notification={resolvedWithTour} onMarkRead={vi.fn()} onClose={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText(/feature request has been resolved/i)).toBeInTheDocument();
  });

  it("does not show 'Watch the tour' while user tour UI is disabled", () => {
    render(
      <Wrapper>
        <NotificationCard notification={resolvedWithTour} onMarkRead={vi.fn()} onClose={vi.fn()} />
      </Wrapper>
    );
    expect(screen.queryByRole("button", { name: /watch the tour/i })).not.toBeInTheDocument();
  });

  it("does not show 'Watch the tour' when notification has no tour", () => {
    render(
      <Wrapper>
        <NotificationCard notification={bugNotification} onMarkRead={vi.fn()} onClose={vi.fn()} />
      </Wrapper>
    );
    expect(screen.queryByRole("button", { name: /watch the tour/i })).not.toBeInTheDocument();
  });

  it("marks read, closes panel, and navigates when an unread status notification is clicked", () => {
    const onMarkRead = vi.fn();
    const onClose = vi.fn();
    render(
      <Wrapper>
        <NotificationCard notification={bugNotification} onMarkRead={onMarkRead} onClose={onClose} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole("button", { name: /view feedback/i }));
    expect(onMarkRead).toHaveBeenCalledWith("n1");
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/feedback/f1");
  });

  it("navigates when a read status notification is clicked without calling onMarkRead", () => {
    const onMarkRead = vi.fn();
    const onClose = vi.fn();
    render(
      <Wrapper>
        <NotificationCard notification={readNotification} onMarkRead={onMarkRead} onClose={onClose} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole("button", { name: /view feedback/i }));
    expect(onMarkRead).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/feedback/f1");
  });

  it("does not store pendingTour when user tour UI is disabled", () => {
    const sessionStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    render(
      <Wrapper>
        <NotificationCard notification={resolvedWithTour} onMarkRead={vi.fn()} onClose={vi.fn()} />
      </Wrapper>
    );
    expect(screen.queryByRole("button", { name: /watch the tour/i })).not.toBeInTheDocument();
    expect(sessionStorageSpy).not.toHaveBeenCalledWith("pendingTour", expect.any(String));
    sessionStorageSpy.mockRestore();
  });

  it("shows relative time (hours ago) for older notifications", () => {
    render(
      <Wrapper>
        <NotificationCard notification={resolvedWithTour} onMarkRead={vi.fn()} onClose={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText(/ago/i)).toBeInTheDocument();
  });

  it("navigates to feedback when a @mention on a feedback thread is clicked", () => {
    const onMarkRead = vi.fn();
    const onClose = vi.fn();
    render(
      <Wrapper>
        <NotificationCard
          notification={mentionOnFeedback}
          onMarkRead={onMarkRead}
          onClose={onClose}
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole("button", { name: /Sam mentioned you in a comment.*view feedback/i }));
    expect(onMarkRead).toHaveBeenCalledWith("n-mention-fb");
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/feedback/f-mention");
  });

  it("renders FEEDBACK_ASSIGNED and navigates to feedback detail on click", () => {
    const onMarkRead = vi.fn();
    const onClose = vi.fn();
    render(
      <Wrapper>
        <NotificationCard
          notification={assignedNotification}
          onMarkRead={onMarkRead}
          onClose={onClose}
        />
      </Wrapper>
    );
    expect(screen.getByText(/Alex assigned you this feedback/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Alex assigned you this feedback/i }));
    expect(onMarkRead).toHaveBeenCalledWith("n-assign");
    expect(mockPush).toHaveBeenCalledWith("/feedback/f-assign");
    expect(onClose).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import React from "react";

const mockReplace = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  usePathname: () => "/en/feedback",
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  getPathname: vi.fn(({ locale, href }: { locale: string; href: string }) => `/${locale}${href}`),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock("@/components/feedback/FeedbackCommentThread", () => ({
  FeedbackCommentThread: () => <div data-testid="feedback-comment-thread" />,
}));

vi.mock("@/components/tour/TourBuilder", () => ({
  TourBuilder: () => <div data-testid="tour-builder" />,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { FeedbackInbox } from "@/components/feedback/FeedbackInbox";
import { FEEDBACK_INBOX_REFRESH_EVENT } from "@/lib/feedback-inbox-events";
import en from "../../messages/en.json";
import { toast } from "sonner";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

/** Opening the detail modal mounts FeedbackDetailView, which fetches `/api/team` when the user can assign. */
const teamFetchResponse = {
  ok: true,
  json: async () => ({
    data: [] as Array<{ id: string; name: string | null; email: string; role: string }>,
  }),
};

function listBody(reports: unknown[]) {
  return { reports, prodFeed: "off" as const };
}

function mockFeedbackListThenTeamForModal(reports: unknown[]) {
  mockFetch
    .mockResolvedValueOnce({ ok: true, json: async () => listBody(reports) })
    .mockResolvedValueOnce(teamFetchResponse);
}

const SCREENSHOT_SRC = "data:image/png;base64,abc123";

const reportWithScreenshot = {
  id: "r1",
  shortId: 1,
  source: "IN_APP" as const,
  type: "BUG" as const,
  title: "Button broken",
  description: "The submit button does nothing.",
  screenshot: SCREENSHOT_SRC,
  videoUrl: null,
  pageUrl: "https://example.com/en/projects",
  status: "OPEN" as const,
  adminNote: null,
  createdAt: new Date().toISOString(),
  user: { id: "u1", name: "Phil Amour", email: "phil@example.com" },
};

const reportWithoutScreenshot = {
  ...reportWithScreenshot,
  id: "r2",
  screenshot: null,
};

function renderInbox(canTriage = true) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ feedback: en.feedback, common: en.common }}>
      <FeedbackInbox locale="en" currentUserId="u1" canTriage={canTriage} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FeedbackInbox — screenshot lightbox", () => {
  it("renders the feedback card and screenshot thumbnail after expanding", async () => {
    mockFeedbackListThenTeamForModal([reportWithScreenshot]);

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("Button broken")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /button broken/i }));

    expect(
      screen.getByRole("button", { name: en.feedback.screenshotEnlargeAria })
    ).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: new RegExp(reportWithScreenshot.title, "i") });
    const thumb = dialog.querySelector(`img[src="${SCREENSHOT_SRC}"]`);
    expect(thumb).not.toBeNull();
  });

  it("opens lightbox when screenshot thumbnail is clicked", async () => {
    mockFeedbackListThenTeamForModal([reportWithScreenshot]);

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Button broken")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /button broken/i }));
    await user.click(screen.getByRole("button", { name: en.feedback.screenshotEnlargeAria }));

    expect(screen.getByRole("dialog", { name: /screenshot preview/i })).toBeInTheDocument();
    expect(screen.getByAltText(en.feedback.screenshotPreview)).toHaveAttribute("src", SCREENSHOT_SRC);
  });

  it("closes lightbox when close button is clicked", async () => {
    mockFeedbackListThenTeamForModal([reportWithScreenshot]);

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Button broken")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /button broken/i }));
    await user.click(screen.getByRole("button", { name: en.feedback.screenshotEnlargeAria }));

    expect(screen.getByRole("dialog", { name: /screenshot preview/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: en.feedback.screenshotClose }));

    expect(screen.queryByRole("dialog", { name: /screenshot preview/i })).not.toBeInTheDocument();
  });

  it("closes lightbox when Escape key is pressed", async () => {
    mockFeedbackListThenTeamForModal([reportWithScreenshot]);

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Button broken")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /button broken/i }));
    await user.click(screen.getByRole("button", { name: en.feedback.screenshotEnlargeAria }));

    expect(screen.getByRole("dialog", { name: /screenshot preview/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: /screenshot preview/i })).not.toBeInTheDocument();
  });

  it("closes lightbox when backdrop is clicked", async () => {
    mockFeedbackListThenTeamForModal([reportWithScreenshot]);

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Button broken")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /button broken/i }));
    await user.click(screen.getByRole("button", { name: en.feedback.screenshotEnlargeAria }));

    const lb = screen.getByRole("dialog", { name: /screenshot preview/i });
    expect(lb).toBeInTheDocument();

    await user.click(lb);

    expect(screen.queryByRole("dialog", { name: /screenshot preview/i })).not.toBeInTheDocument();
  });

  it("does not show screenshot thumbnail or enlarge control when report has no screenshot", async () => {
    mockFeedbackListThenTeamForModal([reportWithoutScreenshot]);

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Button broken")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /button broken/i }));

    expect(screen.queryByRole("button", { name: en.feedback.screenshotEnlargeAria })).not.toBeInTheDocument();
  });
});

describe("FeedbackInbox — detail modal header", () => {
  it("shows submitter and timestamp below the full title without truncating", async () => {
    const longTitle =
      "Legacy Heights Project cannot load in the app or web browser when navigating from the hub";
    const report = {
      ...reportWithScreenshot,
      shortId: 116,
      title: longTitle,
      createdAt: "2026-07-17T14:23:06.000Z",
    };
    mockFeedbackListThenTeamForModal([report]);

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText(longTitle)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: new RegExp(longTitle, "i") }));

    const dialog = screen.getByRole("dialog", { name: new RegExp(longTitle, "i") });
    const title = dialog.querySelector("#feedback-modal-title");
    expect(title).toHaveTextContent("FB-0116");
    expect(title).toHaveTextContent(longTitle);
    expect(title?.className).not.toMatch(/truncate/);

    expect(dialog.textContent).toMatch(/Submitted by Phil Amour/);
    expect(dialog.textContent).toMatch(/Jul 17, 2026/);

    expect(
      screen.getByRole("button", { name: en.feedback.copyAgentPromptAria })
    ).toBeInTheDocument();
  });
});

describe("FeedbackInbox — assignee badge", () => {
  it("shows assigned tag when report has an assignee", async () => {
    const withAssignee = {
      ...reportWithScreenshot,
      assignee: { id: "admin1", name: "Admin", email: "admin@example.com" },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => listBody([withAssignee]),
    });

    renderInbox();

    await waitFor(() => {
      expect(screen.getByText("Assigned: Admin")).toBeInTheDocument();
    });
  });

  it("does not show assigned tag when unassigned", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => listBody([reportWithScreenshot]),
    });

    renderInbox();

    await waitFor(() => {
      expect(screen.getByText("Button broken")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Assigned:/)).not.toBeInTheDocument();
  });
});

describe("FeedbackInbox — video player overlay", () => {
  const reportWithVideo = {
    id: "r3",
    shortId: 3,
    source: "IN_APP" as const,
    type: "BUG" as const,
    title: "Crash on submit",
    description: "App crashes.",
    screenshot: null,
    videoUrl: "https://supabase.co/storage/v1/object/sign/feedback-recordings/test.webm?token=abc",
    pageUrl: "https://example.com/en/projects",
    status: "OPEN" as const,
    adminNote: null,
    createdAt: new Date().toISOString(),
    user: { id: "u1", name: "Phil Amour", email: "phil@example.com" },
  };

  it("shows Watch Recording button and opens video player on click", async () => {
    mockFeedbackListThenTeamForModal([reportWithVideo]);

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Crash on submit")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /crash on submit/i }));

    const watchBtn = await screen.findByRole("button", { name: /watch recording/i });
    expect(watchBtn).toBeInTheDocument();

    await user.click(watchBtn);

    const dialog = await screen.findByRole("dialog", { name: /watch recording/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector("video")).not.toBeNull();
    const video = dialog.querySelector("video") as HTMLVideoElement;
    expect(video.src).toContain("supabase.co");
  });

  it("closes video player when Escape is pressed", async () => {
    mockFeedbackListThenTeamForModal([reportWithVideo]);

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Crash on submit")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /crash on submit/i }));
    await user.click(await screen.findByRole("button", { name: /watch recording/i }));

    expect(await screen.findByRole("dialog", { name: /watch recording/i })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /watch recording/i })).not.toBeInTheDocument()
    );
  });
});

describe("FeedbackInbox — copy for agent", () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it("fetches comments and completes copy-for-agent flow (toast + comments API)", async () => {
    const commentsPayload = {
      comments: [
        {
          id: "c1",
          body: "Please fix the submit path.",
          editedAt: null,
          createdAt: "2026-01-01T12:00:00.000Z",
          author: { id: "u2", name: "Reviewer", email: "r@example.com" },
          attachments: [],
        },
      ],
    };

    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      if (url.includes("/comments")) {
        return Promise.resolve({ ok: true, json: async () => commentsPayload });
      }
      if (url.includes("/api/team")) {
        return Promise.resolve(teamFetchResponse);
      }
      if (url.includes("/api/feedback")) {
        return Promise.resolve({ ok: true, json: async () => listBody([reportWithScreenshot]) });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Button broken")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /button broken/i }));

    await user.click(screen.getByRole("button", { name: en.feedback.copyAgentPromptAria }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(en.feedback.copyAgentPromptSuccess);
    });

    const commentFetches = mockFetch.mock.calls.filter((c) => String(c[0]).includes("/comments"));
    expect(commentFetches.length).toBeGreaterThanOrEqual(1);
  });
});

describe("FeedbackInbox — scope and filters", () => {
  const assignedToMe = {
    ...reportWithScreenshot,
    id: "r-mine",
    assignee: { id: "u1", name: "Me", email: "me@example.com" },
  };
  const assignedToOther = {
    ...reportWithScreenshot,
    id: "r-other",
    title: "Other ticket",
    assignee: { id: "u2", name: "Other", email: "other@example.com" },
  };

  it("My items shows only feedback assigned to the current user", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => listBody([assignedToMe, assignedToOther]),
    });

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Button broken")).toBeInTheDocument());
    expect(screen.getByText("Other ticket")).toBeInTheDocument();

    await user.click(
      screen.getByRole("tab", { name: new RegExp(en.feedback.inboxScopeMine, "i") })
    );

    expect(screen.getByText("Button broken")).toBeInTheDocument();
    expect(screen.queryByText("Other ticket")).not.toBeInTheDocument();
  });

  it("shows empty message when My items has no assignments for current user", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => listBody([assignedToOther]),
    });

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Other ticket")).toBeInTheDocument());
    await user.click(
      screen.getByRole("tab", { name: new RegExp(en.feedback.inboxScopeMine, "i") })
    );

    expect(screen.getByText(en.feedback.inboxMineEmpty)).toBeInTheDocument();
  });

  it("search filters the list by title", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => listBody([assignedToMe, assignedToOther]),
    });

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Other ticket")).toBeInTheDocument());
    await user.type(screen.getByLabelText(en.feedback.searchLabel), "Other");

    expect(screen.queryByText("Button broken")).not.toBeInTheDocument();
    expect(screen.getByText("Other ticket")).toBeInTheDocument();
  });

  it("shows environment filter when a production row exists", async () => {
    const prodRow = {
      ...reportWithScreenshot,
      id: "r-prod",
      environment: "production" as const,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => listBody([prodRow]),
    });

    renderInbox();

    await waitFor(() => expect(screen.getByText("Button broken")).toBeInTheDocument());
    expect(screen.getByLabelText(en.feedback.filterEnvironmentLabel)).toBeInTheDocument();
  });
});

describe("FeedbackInbox — refresh", () => {
  it("refetches when the inbox refresh event is dispatched", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => listBody([reportWithScreenshot]) })
      .mockResolvedValueOnce({ ok: true, json: async () => listBody([reportWithScreenshot]) });

    renderInbox();
    await waitFor(() => expect(screen.getByText("Button broken")).toBeInTheDocument());

    act(() => {
      window.dispatchEvent(new CustomEvent(FEEDBACK_INBOX_REFRESH_EVENT));
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch.mock.calls.every((c) => String(c[0]).includes("/api/feedback"))).toBe(true);
  });

  it("refetches when the refresh button is clicked", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => listBody([reportWithScreenshot]) })
      .mockResolvedValueOnce({ ok: true, json: async () => listBody([reportWithScreenshot]) });

    renderInbox();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Button broken")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: en.feedback.inboxRefreshAria }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});

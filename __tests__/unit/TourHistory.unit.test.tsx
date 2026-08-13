/**
 * Unit tests for TourHistory.
 *
 * Key behaviors tested:
 * - Not rendered when isOpen=false
 * - Shows loading state on initial open
 * - Shows "no tours" message when API returns empty list
 * - Renders tour items with Watch buttons when tours exist
 * - Clicking Watch writes { releaseId } to sessionStorage and navigates
 * - Shows "Load more" button when nextCursor is present
 * - Shows error state when fetch fails
 * - Closes when backdrop is clicked
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { TourHistory } from "@/components/tour/TourHistory";

// Module-level push spy so we can assert navigation calls
const mockPush = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const messages = {
  tourHistory: {
    title: "Tour History",
    subtitle: "Replay any past release walkthrough",
    watch: "Watch",
    noTours: "No tours available yet — they'll appear here after each deploy.",
    loadError: "Failed to load tour history.",
    loadMore: "Load more",
    loading: "Loading tours…",
    envBadgeDev: "dev",
    envBadgeStaging: "staging",
    envBadgeProd: "prod",
    envBadgeAll: "all",
    stepsCount: "{count} step",
    stepsCountPlural: "{count} steps",
    mergedOn: "Released {date}",
    prBadge: "PR #{number}",
  },
};

const MOCK_STEP = {
  order: 0,
  pageUrl: "/en/projects",
  title: "Projects Page",
};

const MOCK_RELEASES = [
  {
    id: "release-1",
    title: "March 5 Release — Navigation fixes",
    prNumber: 88,
    branch: "feat/nav",
    environment: "production",
    mergedAt: new Date("2026-03-05").toISOString(),
    tour: { id: "tour-1", steps: [MOCK_STEP] },
  },
  {
    id: "release-2",
    title: "March 1 Release — DevTools improvements",
    prNumber: 80,
    branch: "feat/devtools",
    environment: "development",
    mergedAt: new Date("2026-03-01").toISOString(),
    tour: { id: "tour-2", steps: [MOCK_STEP, { ...MOCK_STEP, order: 1, title: "Users" }] },
  },
];

function setupFetch(
  status: number,
  body?: object,
  reject = false
) {
  const fetchMock = vi.fn().mockImplementation(() =>
    reject
      ? Promise.reject(new Error("Network error"))
      : Promise.resolve({
          ok: status === 200,
          status,
          json: () => Promise.resolve(body ?? {}),
        })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderHistory(isOpen = true, onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TourHistory isOpen={isOpen} onClose={onClose} />
    </NextIntlClientProvider>
  );
}

describe("TourHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("renders nothing when isOpen is false", () => {
    renderHistory(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows loading indicator while fetching", () => {
    setupFetch(200, undefined);
    renderHistory(true);
    expect(screen.getByText("Loading tours…")).toBeTruthy();
  });

  it("shows 'no tours' message when API returns empty list", async () => {
    setupFetch(200, { items: [], nextCursor: null, total: 0 });
    renderHistory(true);
    await waitFor(() => {
      expect(screen.getByText(messages.tourHistory.noTours)).toBeTruthy();
    });
  });

  it("renders release list with Watch buttons when tours exist", async () => {
    setupFetch(200, { items: MOCK_RELEASES, nextCursor: null, total: 2 });
    renderHistory(true);

    await waitFor(() => {
      expect(screen.getByText("March 5 Release — Navigation fixes")).toBeTruthy();
      expect(screen.getByText("March 1 Release — DevTools improvements")).toBeTruthy();
    });

    const watchButtons = screen.getAllByText("Watch");
    expect(watchButtons).toHaveLength(2);
  });

  it("shows environment badges", async () => {
    setupFetch(200, { items: MOCK_RELEASES, nextCursor: null, total: 2 });
    renderHistory(true);

    await waitFor(() => {
      expect(screen.getByText("prod")).toBeTruthy();
      expect(screen.getByText("dev")).toBeTruthy();
    });
  });

  it("writes releaseId to sessionStorage and calls router.push on Watch", async () => {
    setupFetch(200, { items: [MOCK_RELEASES[0]], nextCursor: null, total: 1 });
    renderHistory(true);

    await waitFor(() => screen.getByText("Watch"));
    fireEvent.click(screen.getByText("Watch"));

    const pending = sessionStorage.getItem("pendingTour");
    expect(pending).not.toBeNull();
    const parsed = JSON.parse(pending!);
    expect(parsed.releaseId).toBe("release-1");
    expect(mockPush).toHaveBeenCalledWith(MOCK_STEP.pageUrl);
  });

  it("calls onClose when Watch is clicked", async () => {
    const onClose = vi.fn();
    setupFetch(200, { items: [MOCK_RELEASES[0]], nextCursor: null, total: 1 });
    renderHistory(true, onClose);

    await waitFor(() => screen.getByText("Watch"));
    fireEvent.click(screen.getByText("Watch"));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows Load more button when nextCursor is present", async () => {
    setupFetch(200, { items: [MOCK_RELEASES[0]], nextCursor: "release-2", total: 2 });
    renderHistory(true);

    await waitFor(() => {
      expect(screen.getByText("Load more")).toBeTruthy();
    });
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    setupFetch(200, { items: [], nextCursor: null, total: 0 });
    renderHistory(true, onClose);

    await waitFor(() => screen.queryByText("Loading tours…") === null || true);
    const backdrop = document.querySelector("[aria-hidden='true']");
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows error state when fetch fails", async () => {
    setupFetch(500, {}, true);
    renderHistory(true);

    await waitFor(() => {
      expect(screen.getByText(messages.tourHistory.loadError)).toBeTruthy();
    });
  });
});

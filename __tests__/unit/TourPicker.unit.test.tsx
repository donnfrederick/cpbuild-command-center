/**
 * Unit tests for TourPicker.
 *
 * Key behaviors tested:
 * - Not rendered when isOpen=false
 * - Site tour section always visible with Watch button
 * - Clicking Site Tour dispatches tour:request custom event with siteTour:true
 * - Release tours section loads from API
 * - Clicking release row dispatches tour:request custom event with releaseId
 * - Closes when backdrop is clicked
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { TourPicker } from "@/components/tour/TourPicker";

const messages = {
  tour: {
    tourPickerTitle: "Choose a tour",
    tourPickerSubtitle: "Select a guided walkthrough to get started",
    siteTourLabel: "Getting started",
    siteTourTitle: "Full Site Walkthrough",
    siteTourDescription: "Create projects, upload Field Tracker, and manage your team.",
    siteTourPausedNotice: "Being updated — check back soon",
    releaseToursSection: "Release tours",
  },
  tourHistory: {
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
    title: "March 5 Release",
    prNumber: 88,
    branch: "feat/nav",
    environment: "production",
    mergedAt: new Date("2026-03-05").toISOString(),
    tour: { id: "tour-1", steps: [MOCK_STEP] },
  },
];

function setupFetch(status: number, body?: object, reject = false) {
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

function renderPicker(isOpen = true, onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TourPicker isOpen={isOpen} onClose={onClose} />
    </NextIntlClientProvider>
  );
}

describe("TourPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders dialog with aria-hidden when isOpen is false", () => {
    renderPicker(false);
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).toHaveAttribute("aria-hidden", "true");
  });

  it("shows site tour section as clickable row", async () => {
    setupFetch(200, { items: [], nextCursor: null, total: 0 });
    renderPicker(true);

    await waitFor(() => {
      expect(screen.getByText("Choose a tour")).toBeTruthy();
      expect(screen.getByText("Full Site Walkthrough")).toBeTruthy();
      expect(screen.getByText("Create projects, upload Field Tracker, and manage your team.")).toBeTruthy();
    });
  });

  // NOTE: Site Tour is TEMPORARILY_DISABLED — the row is shown but not clickable.
  // When the tour is updated and re-enabled, restore these two tests to assert:
  //   - clicking dispatches tour:request with { siteTour: true, autoPlay: false }
  //   - clicking calls onClose

  it("shows the Site Tour row as disabled (aria-disabled) while tour is being updated", async () => {
    setupFetch(200, { items: [], nextCursor: null, total: 0 });
    renderPicker(true);

    await waitFor(() => screen.getByText("Full Site Walkthrough"));
    // Row should be present but non-interactive
    const row = screen.getByText("Full Site Walkthrough").closest("[aria-disabled]");
    expect(row).toBeTruthy();
    expect(row?.getAttribute("aria-disabled")).toBe("true");
  });

  it("shows the paused notice text while site tour is disabled", async () => {
    setupFetch(200, { items: [], nextCursor: null, total: 0 });
    renderPicker(true);

    await waitFor(() => screen.getByText("Full Site Walkthrough"));
    expect(screen.getByText("Being updated — check back soon")).toBeTruthy();
  });

  it("does NOT dispatch tour:request when disabled Site Tour row is clicked", async () => {
    setupFetch(200, { items: [], nextCursor: null, total: 0 });
    renderPicker(true);

    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener("tour:request", handler);

    await waitFor(() => screen.getByText("Full Site Walkthrough"));
    fireEvent.click(screen.getByText("Full Site Walkthrough"));

    window.removeEventListener("tour:request", handler);
    expect(events).toHaveLength(0);
  });

  it("renders release tours when API returns items", async () => {
    setupFetch(200, { items: MOCK_RELEASES, nextCursor: null, total: 1 });
    renderPicker(true);

    await waitFor(() => {
      expect(screen.getByText("March 5 Release")).toBeTruthy();
    });
  });

  it("dispatches tour:request with releaseId when release row is clicked", async () => {
    setupFetch(200, { items: MOCK_RELEASES, nextCursor: null, total: 1 });
    renderPicker(true);

    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener("tour:request", handler);

    await waitFor(() => screen.getByText("March 5 Release"));
    fireEvent.click(screen.getByText("March 5 Release"));

    window.removeEventListener("tour:request", handler);

    expect(events).toHaveLength(1);
    expect(events[0].detail.releaseId).toBe("release-1");
    expect(events[0].detail.autoPlay).toBe(false);
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    setupFetch(200, { items: [], nextCursor: null, total: 0 });
    renderPicker(true, onClose);

    await waitFor(() => screen.queryByText("Loading tours…") === null || true);
    const backdrop = document.querySelector("[aria-hidden='true']");
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

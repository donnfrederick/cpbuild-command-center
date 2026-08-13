/**
 * Unit tests for NewDeployTourTrigger.
 *
 * Behaviours:
 * - Does nothing when last-seen-sha matches the current build SHA
 * - Dispatches tour:request with { releaseId } when a new deploy has a tour
 * - Writes SHA to localStorage after dispatching the event
 * - Does nothing (but still writes SHA) when /api/releases/latest-new returns 204
 * - Does nothing (but still writes SHA) when tour has no steps
 * - Does NOT write SHA on network error (retry next page load)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { NewDeployTourTrigger } from "@/components/tour/NewDeployTourTrigger";

const MOCK_RELEASE_ID = "release-abc";

function setupFetch(status: 200 | 204, body?: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status === 200,
      status,
      json: () => Promise.resolve(body ?? {}),
    })
  );
}

function renderTrigger() {
  render(<NewDeployTourTrigger />);
}

describe("NewDeployTourTrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("does nothing when last-seen-sha already matches the build SHA", async () => {
    localStorage.setItem("last-seen-sha", "dev"); // matches NEXT_PUBLIC_GIT_SHA fallback
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderTrigger();

    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dispatches tour:request with releaseId when a tour exists (returning user)", async () => {
    localStorage.setItem("cc-site-tour-v2-seen", "1"); // existing user — has seen site tour
    setupFetch(200, {
      release: { id: MOCK_RELEASE_ID },
      tour: { steps: [{ order: 0, pageUrl: "/en/projects" }] },
    });

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    renderTrigger();

    await waitFor(() => {
      const events = dispatchSpy.mock.calls
        .map((c) => c[0] as CustomEvent)
        .filter((e) => e instanceof CustomEvent && e.type === "tour:request");
      expect(events).toHaveLength(1);
      expect(events[0].detail.releaseId).toBe(MOCK_RELEASE_ID);
    });
  });

  it("writes SHA to localStorage after dispatching the tour", async () => {
    localStorage.setItem("cc-site-tour-v2-seen", "1");
    setupFetch(200, {
      release: { id: MOCK_RELEASE_ID },
      tour: { steps: [{ order: 0, pageUrl: "/en/projects" }] },
    });

    renderTrigger();

    await waitFor(() => {
      expect(localStorage.getItem("last-seen-sha")).toBe("dev");
    });
  });

  it("writes SHA but does not dispatch when /api/releases/latest-new returns 204", async () => {
    localStorage.setItem("cc-site-tour-v2-seen", "1");
    setupFetch(204);

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    renderTrigger();

    await waitFor(() => {
      expect(localStorage.getItem("last-seen-sha")).toBe("dev");
    });

    const tourEvents = dispatchSpy.mock.calls
      .map((c) => c[0] as CustomEvent)
      .filter((e) => e instanceof CustomEvent && e.type === "tour:request");
    expect(tourEvents).toHaveLength(0);
  });

  it("writes SHA but does not dispatch when tour has no steps", async () => {
    localStorage.setItem("cc-site-tour-v2-seen", "1");
    setupFetch(200, {
      release: { id: MOCK_RELEASE_ID },
      tour: { steps: [] },
    });

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    renderTrigger();

    await waitFor(() => {
      expect(localStorage.getItem("last-seen-sha")).toBe("dev");
    });

    const tourEvents = dispatchSpy.mock.calls
      .map((c) => c[0] as CustomEvent)
      .filter((e) => e instanceof CustomEvent && e.type === "tour:request");
    expect(tourEvents).toHaveLength(0);
  });

  it("skips release tour and marks SHA seen for first-time users (no site tour seen flag)", async () => {
    // New user: no site-tour-seen flag — SiteTourLauncher owns their first experience.
    // NewDeployTourTrigger should mark SHA seen but NOT dispatch tour:request.
    setupFetch(200, {
      release: { id: MOCK_RELEASE_ID },
      tour: { steps: [{ order: 0, pageUrl: "/en/projects" }] },
    });

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    renderTrigger();

    await waitFor(() => {
      expect(localStorage.getItem("last-seen-sha")).toBe("dev");
    });

    const tourEvents = dispatchSpy.mock.calls
      .map((c) => c[0] as CustomEvent)
      .filter((e) => e instanceof CustomEvent && e.type === "tour:request");
    expect(tourEvents).toHaveLength(0);
  });

  it("does NOT write SHA on network error (allows retry on next load)", async () => {
    localStorage.setItem("cc-site-tour-v2-seen", "1");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    renderTrigger();

    await new Promise((r) => setTimeout(r, 100));
    expect(localStorage.getItem("last-seen-sha")).toBeNull();
  });
});

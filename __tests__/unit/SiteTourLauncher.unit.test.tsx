import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { SiteTourLauncher } from "@/components/tour/SiteTourLauncher";

const TOUR_SEEN_KEY = "cc-site-tour-v2-seen";

// Polyfill sessionStorage / localStorage in jsdom
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });
Object.defineProperty(window, "sessionStorage", { value: sessionStorageMock });

describe("SiteTourLauncher", () => {
  beforeEach(() => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    vi.clearAllMocks();
  });

  it("renders nothing to the DOM", () => {
    const { container } = render(<SiteTourLauncher />);
    expect(container.firstChild).toBeNull();
  });

  // NOTE: These two tests document the TEMPORARILY_DISABLED state.
  // When the site tour is updated and TEMPORARILY_DISABLED is flipped back to false,
  // rewrite these two tests to assert:
  //   - pendingTour IS written to sessionStorage
  //   - TOUR_SEEN_KEY IS set in localStorage

  it("does NOT write pendingTour while tour is temporarily disabled", () => {
    render(<SiteTourLauncher />);
    expect(sessionStorageMock.getItem("pendingTour")).toBeNull();
  });

  it("does NOT set the seen flag in localStorage while tour is temporarily disabled", () => {
    // Intentional: not marking seen so auto-launch resumes for first-time
    // users once TEMPORARILY_DISABLED is flipped to false.
    render(<SiteTourLauncher />);
    expect(localStorageMock.getItem(TOUR_SEEN_KEY)).toBeNull();
  });

  it("does NOT write pendingTour on second mount when flag is already set", () => {
    localStorageMock.setItem(TOUR_SEEN_KEY, "1");

    render(<SiteTourLauncher />);

    expect(sessionStorageMock.getItem("pendingTour")).toBeNull();
  });

  it("does NOT overwrite an existing pendingTour even when seen flag is NOT set", () => {
    // Simulates a first visit where TourDeepLinkHandler already queued a release tour.
    const existingPending = JSON.stringify({ releaseId: "release-123" });
    sessionStorageMock.setItem("pendingTour", existingPending);

    render(<SiteTourLauncher />);

    expect(sessionStorageMock.getItem("pendingTour")).toBe(existingPending);
    expect(localStorageMock.getItem(TOUR_SEEN_KEY)).toBeNull();
  });

  it("does NOT overwrite an existing pendingTour when seen flag IS already set", () => {
    const existingPending = JSON.stringify({ releaseId: "release-123" });
    sessionStorageMock.setItem("pendingTour", existingPending);
    localStorageMock.setItem(TOUR_SEEN_KEY, "1");

    render(<SiteTourLauncher />);

    expect(sessionStorageMock.getItem("pendingTour")).toBe(existingPending);
  });
});

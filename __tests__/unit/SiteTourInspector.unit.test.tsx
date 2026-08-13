import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SiteTourInspector } from "@/components/devtools/SiteTourInspector";
import { SITE_TOUR_STEPS } from "@/lib/site-tour-steps";

const TOUR_SEEN_KEY = "cc-site-tour-v2-seen";
const EDITS_KEY = "cc-tour-step-edits";

// ── Storage mocks ─────────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    get store() { return store; },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

// ── describe block ────────────────────────────────────────────────────────────

describe("SiteTourInspector", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("renders the component header with step count", () => {
    render(<SiteTourInspector />);
    expect(screen.getByText("Site Tour Inspector")).toBeTruthy();
    expect(screen.getByText(`${SITE_TOUR_STEPS.length} steps`)).toBeTruthy();
  });

  it("renders a card for each SITE_TOUR_STEPS entry", () => {
    render(<SiteTourInspector />);
    for (const step of SITE_TOUR_STEPS) {
      expect(screen.getByText(String(step.order))).toBeTruthy();
    }
  });

  it("shows the Edit steps toggle button in its default (not pressed) state", () => {
    render(<SiteTourInspector />);
    const editBtn = screen.getByRole("button", { name: /edit steps/i });
    expect(editBtn).toBeTruthy();
    expect(editBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles aria-pressed on the Edit button when clicked", () => {
    render(<SiteTourInspector />);
    const editBtn = screen.getByRole("button", { name: /edit steps/i });
    fireEvent.click(editBtn);
    expect(editBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(editBtn);
    expect(editBtn.getAttribute("aria-pressed")).toBe("false");
  });

  describe("handleResetSeenFlag / handleMarkSeen", () => {
    it("'Re-enable' removes the seen flag from localStorage when flag is currently set", () => {
      localStorageMock.setItem(TOUR_SEEN_KEY, "1");
      render(<SiteTourInspector />);
      const btn = screen.getByRole("button", { name: /re-enable/i });
      fireEvent.click(btn);
      expect(localStorageMock.getItem(TOUR_SEEN_KEY)).toBeNull();
    });

    it("'Disable' writes the seen flag into localStorage when flag is not set", () => {
      render(<SiteTourInspector />);
      const btn = screen.getByRole("button", { name: /disable/i });
      fireEvent.click(btn);
      expect(localStorageMock.getItem(TOUR_SEEN_KEY)).toBe("1");
    });
  });

  describe("handleResetAll", () => {
    it("removes the edits key from localStorage when Reset all edits is clicked", () => {
      localStorageMock.setItem(EDITS_KEY, JSON.stringify({ 1: { titleEn: "Custom" } }));
      render(<SiteTourInspector />);
      const resetBtn = screen.getByRole("button", { name: /reset all edits/i });
      fireEvent.click(resetBtn);
      expect(localStorageMock.getItem(EDITS_KEY)).toBeNull();
    });
  });

  describe("handlePlay", () => {
    it("dispatches a tour:request CustomEvent with the correct payload", () => {
      render(<SiteTourInspector />);

      const received: CustomEvent[] = [];
      const handler = (e: Event) => received.push(e as CustomEvent);
      window.addEventListener("tour:request", handler);

      // Step cards are collapsed by default; the play button is visible per card
      const playBtns = screen.getAllByRole("button", { name: /play tour from step/i });
      fireEvent.click(playBtns[0]);

      window.removeEventListener("tour:request", handler);

      expect(received).toHaveLength(1);
      const detail = received[0].detail as { siteTour: boolean; autoPlay: boolean; startIndex: number };
      expect(detail.siteTour).toBe(true);
      expect(detail.autoPlay).toBe(false);
      expect(typeof detail.startIndex).toBe("number");
    });

    it("calls onClose before dispatching tour:request", () => {
      const onClose = vi.fn();
      render(<SiteTourInspector onClose={onClose} />);

      window.addEventListener("tour:request", () => {});
      const playBtns = screen.getAllByRole("button", { name: /play tour from step/i });
      fireEvent.click(playBtns[0]);

      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});

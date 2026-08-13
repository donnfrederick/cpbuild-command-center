import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BriefingCardFeedback } from "@/components/admin/BriefingCardFeedback";

// ── Global fetch mock ─────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  briefingId: "briefing-123",
  section: "ROI_ITEM" as const,
  itemKey: "roi-0",
  itemData: { area: "Dev velocity", value: "$500/week", reasoning: "Saves 2h/week" },
  briefingContext: { dateFor: "2026-03-10", narrative: "Good day" },
};

function renderFeedback(overrides = {}) {
  return render(
    <BriefingCardFeedback {...defaultProps} {...overrides}>
      <div data-testid="card-content">Card content here</div>
    </BriefingCardFeedback>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BriefingCardFeedback", () => {
  describe("rendering", () => {
    it("renders children", () => {
      renderFeedback();
      expect(screen.getByTestId("card-content")).toBeInTheDocument();
    });

    it("renders feedback toolbar buttons (visible on hover via CSS, present in DOM)", () => {
      renderFeedback();
      // aria-label takes precedence over visible text for accessible name
      expect(screen.getByRole("button", { name: /justify this estimate/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /challenge this estimate/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /mark this estimate as accurate/i })).toBeInTheDocument();
    });
  });

  describe("Justify flow", () => {
    it("calls /feedback/justify and displays justification text", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ justification: "I derived this from the 2h/week saving figure." }),
      });

      renderFeedback();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /justify this estimate/i }));

      await waitFor(() => {
        expect(screen.getByText(/gemini's reasoning/i)).toBeInTheDocument();
        expect(screen.getByText(/derived this from/i)).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/daily-briefing/feedback/justify",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("shows error message when justify API fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Gemini unavailable" }),
      });

      renderFeedback();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /justify this estimate/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText(/gemini unavailable/i)).toBeInTheDocument();
      });
    });
  });

  describe("Challenge form", () => {
    it("opens challenge form when Challenge button is clicked", async () => {
      renderFeedback();
      const user = userEvent.setup();
      // Challenge button: aria-label is "Challenge this estimate"
      await user.click(screen.getByRole("button", { name: /^challenge this estimate$/i }));

      expect(screen.getByText(/what's wrong with this estimate/i)).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /challenge reason/i })).toBeInTheDocument();
    });

    it("closes challenge form on Cancel", async () => {
      renderFeedback();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /^challenge this estimate$/i }));
      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(screen.queryByText(/what's wrong with this estimate/i)).not.toBeInTheDocument();
    });

    it("submits challenge without revision and closes form", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "feedback-1" }),
      });

      renderFeedback();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /^challenge this estimate$/i }));

      // Uncheck the "ask Gemini to revise" checkbox
      const reviseCheckbox = screen.getByRole("checkbox");
      await user.click(reviseCheckbox);
      expect(reviseCheckbox).not.toBeChecked();

      await user.click(screen.getByRole("button", { name: /submit challenge/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/daily-briefing/feedback",
          expect.objectContaining({ method: "POST" })
        );
      });
    });

    it("calls revise API and invokes onRevision callback when revision requested", async () => {
      const onRevision = vi.fn();
      const revisedItem = { area: "Dev velocity", value: "N/A — infrastructure fix", reasoning: "No consumer impact" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ revisedItem }),
      });

      renderFeedback({ onRevision });
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /^challenge this estimate$/i }));

      // Checkbox is checked by default
      expect(screen.getByRole("checkbox")).toBeChecked();
      await user.click(screen.getByRole("button", { name: /submit challenge/i }));

      await waitFor(() => {
        expect(onRevision).toHaveBeenCalledWith(revisedItem);
      });

      expect(screen.getByText(/gemini revised this card/i)).toBeInTheDocument();
    });
  });

  describe("Approve flow", () => {
    it("calls /feedback with APPROVE and shows confirmation", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      renderFeedback();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /^mark this estimate as accurate$/i }));

      await waitFor(() => {
        expect(screen.getByText(/marked as accurate/i)).toBeInTheDocument();
      });
    });
  });
});

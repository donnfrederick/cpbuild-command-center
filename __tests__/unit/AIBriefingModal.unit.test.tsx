import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { AIBriefingModal } from "@/components/ai/AIBriefingModal";

const messages = {
  ai: {
    generateBriefing: "Generate Briefing",
    briefingTitle: "Site Briefing",
    briefingSubtitle: "{projectName}",
    generatingBriefing: "Generating…",
    copyBriefing: "Copy",
    briefingCopied: "Copied!",
    print: "Print",
    errorDisabled: "AI is disabled",
    errorRateLimit: "Rate limited",
    errorNoData: "No data",
    errorGeneric: "Something went wrong",
  },
};

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AIBriefingModal projectId="proj-1" projectName="Tower A" />
    </NextIntlClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("AIBriefingModal", () => {
  it("renders the Generate Briefing button", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /generate briefing/i })).toBeInTheDocument();
  });

  it("opens modal and shows loading state when generate is clicked", async () => {
    // Never resolves so we can observe loading
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    expect(await screen.findByText("Generating…")).toBeInTheDocument();
  });

  it("shows briefing content on successful API response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ briefing: "## Summary\nAll units on track." }),
    });
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /print/i })).toBeInTheDocument();
  });

  it("shows generic error when API returns non-ok without known code", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "UNKNOWN" }),
    });
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows AI disabled error for AI_DISABLED code", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "AI_DISABLED" }),
    });
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    expect(await screen.findByText("AI is disabled")).toBeInTheDocument();
  });

  it("shows rate limit error for RATE_LIMITED code", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "RATE_LIMITED" }),
    });
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    expect(await screen.findByText("Rate limited")).toBeInTheDocument();
  });

  it("shows generic error when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("closes modal when close button is clicked", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ briefing: "Good news." }),
    });
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument());
    await user.click(screen.getByLabelText("Close briefing"));
    expect(screen.queryByText("Generating…")).not.toBeInTheDocument();
  });

  it("closes modal when clicking the backdrop", async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate briefing/i }));
    await screen.findByText("Generating…");
    // The backdrop is the fixed overlay div - click its center
    const backdrop = document.querySelector('div[style*="position: fixed"]') as HTMLElement;
    fireEvent.click(backdrop);
    await waitFor(() => expect(screen.queryByText("Generating…")).not.toBeInTheDocument());
  });
});

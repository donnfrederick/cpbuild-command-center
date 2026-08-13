import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { AIInsightsPanel } from "@/components/ai/AIInsightsPanel";
import type { InsightReport } from "@/lib/ai/types";

const messages = {
  ai: {
    analysisTitle: "AI Analysis",
    analysisSubtitle: "Powered by Gemini",
    analyzeUnits: "Analyze Locations",
    refresh: "Refresh",
    dismiss: "Dismiss",
    risks: "Risks",
    noRisks: "No risks found",
    bottlenecks: "Bottlenecks",
    noBottlenecks: "No bottlenecks",
    highlights: "Highlights",
    riskHigh: "High",
    riskMedium: "Medium",
    riskLow: "Low",
    errorDisabled: "AI is disabled",
    errorRateLimit: "Rate limited",
    errorQuota: "Quota exceeded",
    errorNoData: "No unit data",
    errorGeneric: "Something went wrong",
  },
};

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AIInsightsPanel projectId="proj-1" />
    </NextIntlClientProvider>
  );
}

const mockReport: InsightReport = {
  completionPct: 72,
  summary: "Project is 72% complete with some risks.",
  risks: [{ severity: "high", description: "Unit 101 overdue" }],
  bottlenecks: [{ stage: "INSTALL", unitCount: 3, reason: "Waiting on materials" }],
  highlights: ["Building A fully staged"],
};

beforeEach(() => vi.clearAllMocks());

describe("AIInsightsPanel", () => {
  it("renders idle state with Analyze Locations button", () => {
    renderPanel();
    expect(screen.getByText("AI Analysis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze locations/i })).toBeInTheDocument();
  });

  it("calls API and shows success state with report data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ insights: mockReport }),
    });
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /analyze locations/i }));
    await waitFor(() => expect(screen.getByText("72%")).toBeInTheDocument());
    expect(screen.getByText("Project is 72% complete with some risks.")).toBeInTheDocument();
    expect(screen.getByText("Unit 101 overdue")).toBeInTheDocument();
    expect(screen.getByText("Waiting on materials")).toBeInTheDocument();
    expect(screen.getByText("Building A fully staged")).toBeInTheDocument();
  });

  it("shows refresh button in success state", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ insights: mockReport }),
    });
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /analyze locations/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument());
  });

  it("shows empty risk and bottleneck messages when arrays are empty", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        insights: { ...mockReport, risks: [], bottlenecks: [], highlights: [] },
      }),
    });
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /analyze locations/i }));
    await waitFor(() => expect(screen.getByText("No risks found")).toBeInTheDocument());
    expect(screen.getByText("No bottlenecks")).toBeInTheDocument();
  });

  it("shows generic error on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "UNKNOWN" }),
    });
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /analyze locations/i }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows rate limit error for RATE_LIMITED code", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "RATE_LIMITED" }),
    });
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /analyze locations/i }));
    expect(await screen.findByText("Rate limited")).toBeInTheDocument();
  });

  it("shows generic error when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /analyze locations/i }));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("dismiss button resets panel to idle", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ insights: mockReport }),
    });
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /analyze locations/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /analyze locations/i })).toBeInTheDocument());
  });
});

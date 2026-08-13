import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { PortfolioHealthCard } from "@/components/ai/PortfolioHealthCard";
import type { PortfolioReport } from "@/lib/ai/types";

const messages = {
  ai: {
    portfolioHealth: "Portfolio Health",
    analyzeUnits: "Analyze Locations",
    refresh: "Refresh",
    errorQuota: "Quota exceeded",
    errorRateLimit: "Rate limited",
    errorGeneric: "Something went wrong",
    riskHigh: "High",
    riskMedium: "Medium",
    riskLow: "Low",
  },
};

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PortfolioHealthCard />
    </NextIntlClientProvider>
  );
}

const mockPortfolio: PortfolioReport = {
  atRiskCount: 2,
  healthyCount: 5,
  summary: "Most projects are on track.",
  topRisks: [
    { projectName: "Tower A", severity: "high", reason: "Behind schedule" },
    { projectName: "Tower B", severity: "medium", reason: "Budget concerns" },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("PortfolioHealthCard", () => {
  it("renders idle state with Portfolio Health heading and analyze button", () => {
    renderCard();
    expect(screen.getByText("Portfolio Health")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls /api/ai/analyze with type=portfolio on click", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ portfolio: mockPortfolio }),
    });
    renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button"));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/ai/analyze",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.type).toBe("portfolio");
  });

  it("shows success state with counts and risks", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ portfolio: mockPortfolio }),
    });
    renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Most projects are on track.")).toBeInTheDocument();
    expect(screen.getByText("Tower A")).toBeInTheDocument();
    expect(screen.getByText("Behind schedule")).toBeInTheDocument();
  });

  it("shows refresh button in success state", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ portfolio: mockPortfolio }),
    });
    renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument());
  });

  it("stays idle silently when AI_DISABLED is returned", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "AI_DISABLED" }),
    });
    renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button"));
    // Should not show an error — stays silent
    await waitFor(() => {
      expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
      expect(screen.queryByText("AI is disabled")).not.toBeInTheDocument();
    });
  });

  it("shows error message for QUOTA_EXCEEDED", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "QUOTA_EXCEEDED" }),
    });
    renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button"));
    expect(await screen.findByText("Quota exceeded")).toBeInTheDocument();
  });

  it("shows generic error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button"));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows retry button in error state", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "RATE_LIMITED" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ portfolio: mockPortfolio }) });
    renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button"));
    await screen.findByText("Rate limited");
    const retryBtn = screen.getByRole("button");
    await user.click(retryBtn);
    await waitFor(() => expect(screen.getByText("Most projects are on track.")).toBeInTheDocument());
  });
});

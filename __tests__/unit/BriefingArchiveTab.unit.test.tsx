import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { BriefingArchiveTab } from "@/components/admin/BriefingArchiveTab";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ── i18n messages ─────────────────────────────────────────────────────────────

const messages = {
  morningBriefing: {
    title: "Morning Briefing",
    subtitle: "Subtitle",
    generate: "Generate",
    regenerate: "Regenerate",
    generating: "Generating…",
    generatedAt: "Generated {time}",
    coversDate: "Covers {date}",
    emptyTitle: "Good morning.",
    emptyDescription: "Generate your briefing.",
    errorTitle: "Error",
    errorDescription: "Error",
    errorRetry: "Retry",
    sectionYesterdaysWork: "Yesterday's Work",
    sectionOptimizations: "Optimizations",
    sectionIssues: "Issues",
    sectionROI: "ROI Analysis",
    sectionTechPulse: "Tech Pulse",
    sectionSprint: "Today's Sprint",
    sectionInsight: "Morning Insight",
    labelShipped: "Shipped",
    labelEstROI: "Est. ROI",
    labelROITotal: "Total Estimated Value",
    labelSource: "Source",
    sprintTheme: "Theme",
    aiNotConfigured: "AI not configured",
    resolutionResolved: "Resolved",
    resolutionOpen: "Open",
    resolutionMonitoring: "Monitoring",
    // Archive + backfill keys added for BriefingArchiveTab
    archiveBack: "Back to Archive",
    archiveHeading: "Briefing Archive",
    archiveCount: "{count, plural, one {# briefing stored} other {# briefings stored}}",
    archiveEmptyTitle: "No archive yet",
    archiveEmptyDescription: "Past briefings will appear here.",
    backfillTitle: "Generate for a past date",
    backfillDescription: "Generate a digest for any day not captured automatically.",
    backfillDateLabel: "Select a date",
    backfillGenerate: "Generate",
    backfillGenerating: "Generating…",
    backfillErrorFallback: "Generation failed.",
    backfillNetworkError: "Network error.",
    archiveOptimizations: "{count} optimizations",
    archiveIssues: "{count} issues",
    archiveLoadError: "Failed to load briefing archive.",
    briefingLoadError: "Failed to load this briefing.",
  },
};

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const historyItems = [
  {
    id: "b1",
    dateFor: "2026-03-10",
    generatedAt: "2026-03-11T08:00:00Z",
    roiSummary: "Shipped 3 PRs with solid ROI",
    totalEstimatedValue: "~4h saved",
    optimizationCount: 2,
    issueCount: 1,
    shippedCount: 3,
  },
];

const fullBriefingReport = {
  generatedAt: "2026-03-11T08:00:00Z",
  dateFor: "2026-03-10",
  yesterdaysWork: { narrative: "Good day.", shipped: [], dbHighlights: "" },
  inFlight: { openPRs: [], summary: "Nothing open." },
  optimizationsRecognized: [],
  issuesAndChallenges: [],
  roiAnalysis: { summary: "Decent ROI.", items: [], totalEstimatedValue: "~4h" },
  techPulse: { summary: "Quiet.", items: [] },
  todaysSprint: { theme: "Stability", items: [] },
  sprintRetro: { wentWell: [], toImprove: [], agentRecommendation: "Keep going.", velocityNote: "Normal day." },
  morningInsight: "Interesting insight here.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BriefingArchiveTab", () => {
  it("shows loading spinner initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const renderBriefing = vi.fn(() => <div>Briefing</div>);
    render(<BriefingArchiveTab renderBriefing={renderBriefing} />, { wrapper });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders empty state with backfill panel when no briefings exist", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    const renderBriefing = vi.fn(() => <div>Briefing</div>);
    render(<BriefingArchiveTab renderBriefing={renderBriefing} />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/no archive yet/i)).toBeInTheDocument();
      expect(screen.getByText(/generate for a past date/i)).toBeInTheDocument();
    });
  });

  it("renders history cards when briefings exist", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: historyItems }),
    });

    const renderBriefing = vi.fn(() => <div>Briefing</div>);
    render(<BriefingArchiveTab renderBriefing={renderBriefing} />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/~4h saved/i)).toBeInTheDocument();
      expect(screen.getByText(/2 optimizations/i)).toBeInTheDocument();
      expect(screen.getByText(/1 issue/i)).toBeInTheDocument();
    });
  });

  it("loads full briefing when a card is clicked", async () => {
    // First call: history list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: historyItems }),
    });
    // Second call: full briefing
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "b1",
        briefing: fullBriefingReport,
        dateFor: "2026-03-10",
        generatedAt: "2026-03-11T08:00:00Z",
      }),
    });

    const renderBriefing = vi.fn(() => <div data-testid="full-briefing">Full Briefing</div>);
    render(<BriefingArchiveTab renderBriefing={renderBriefing} />, { wrapper });

    await waitFor(() => screen.getByText(/~4h saved/i));

    const user = userEvent.setup();
    await user.click(screen.getByText(/~4h saved/i).closest("button")!);

    await waitFor(() => {
      expect(screen.getByTestId("full-briefing")).toBeInTheDocument();
      expect(renderBriefing).toHaveBeenCalledOnce();
    });
  });

  it("shows Back button when viewing a full briefing and goes back on click", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: historyItems }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "b1",
        briefing: fullBriefingReport,
        dateFor: "2026-03-10",
        generatedAt: "2026-03-11T08:00:00Z",
      }),
    });

    const renderBriefing = vi.fn(() => <div>Full Briefing</div>);
    render(<BriefingArchiveTab renderBriefing={renderBriefing} />, { wrapper });

    await waitFor(() => screen.getByText(/~4h saved/i));
    const user = userEvent.setup();
    await user.click(screen.getByText(/~4h saved/i).closest("button")!);
    await waitFor(() => screen.getByText("Full Briefing"));

    await user.click(screen.getByRole("button", { name: /back to archive/i }));

    await waitFor(() => {
      expect(screen.getByText(/~4h saved/i)).toBeInTheDocument();
    });
  });

  it("backfill panel sends POST with selected date and navigates into the new briefing", async () => {
    // Initial history load
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: historyItems }),
    });
    // POST /api/daily-briefing response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "b2",
        briefing: fullBriefingReport,
        dateFor: "2026-03-09",
        generatedAt: "2026-04-14T10:00:00Z",
      }),
    });
    // History reload after successful POST
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: historyItems }),
    });

    const renderBriefing = vi.fn(() => <div data-testid="full-briefing">Full Briefing</div>);
    render(<BriefingArchiveTab renderBriefing={renderBriefing} />, { wrapper });

    await waitFor(() => screen.getByText(/generate for a past date/i));

    const user = userEvent.setup();

    // Find and click the Generate button in the backfill panel
    const generateBtn = screen.getByRole("button", { name: /^generate$/i });
    await user.click(generateBtn);

    // Should POST with a date body
    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        (call) => call[1]?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body as string) as { date: string };
      expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    // Should auto-navigate into the generated briefing
    await waitFor(() => {
      expect(screen.getByTestId("full-briefing")).toBeInTheDocument();
    });
  });

  it("shows error state when history load fails with non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" });

    const renderBriefing = vi.fn(() => <div>Briefing</div>);
    render(<BriefingArchiveTab renderBriefing={renderBriefing} />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/failed to load briefing archive/i)).toBeInTheDocument();
    });
  });

  it("shows error toast and banner when loading full briefing fails", async () => {
    const { toast } = await import("sonner");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: historyItems }),
    });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Error" });

    const renderBriefing = vi.fn(() => <div>Full Briefing</div>);
    render(<BriefingArchiveTab renderBriefing={renderBriefing} />, { wrapper });

    await waitFor(() => screen.getByText(/~4h saved/i));
    const user = userEvent.setup();
    await user.click(screen.getByText(/~4h saved/i).closest("button")!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
      expect(screen.getByText(/failed to load this briefing/i)).toBeInTheDocument();
    });
  });

  it("backfill panel shows error toast when POST fails", async () => {
    const { toast } = await import("sonner");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: historyItems }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "GEMINI_API_KEY is not configured." }),
    });

    const renderBriefing = vi.fn(() => <div>Briefing</div>);
    render(<BriefingArchiveTab renderBriefing={renderBriefing} />, { wrapper });

    await waitFor(() => screen.getByText(/generate for a past date/i));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^generate$/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});

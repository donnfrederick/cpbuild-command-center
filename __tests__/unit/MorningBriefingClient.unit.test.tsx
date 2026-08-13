import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ── i18n messages ─────────────────────────────────────────────────────────────

const messages = {
  morningBriefing: {
    title: "Morning Briefing",
    subtitle: "Your personal daily sprint — powered by Gemini AI",
    generate: "Generate Today's Briefing",
    regenerate: "Regenerate",
    generating: "Generating your briefing…",
    generatedAt: "Generated {time}",
    coversDate: "Covers {date}",
    emptyTitle: "Good morning.",
    emptyDescription: "Generate your AI-powered daily briefing.",
    errorTitle: "Generation failed",
    errorDescription: "Gemini couldn't complete the briefing.",
    errorRetry: "Try Again",
    sectionYesterdaysWork: "Yesterday's Work",
    sectionOptimizations: "Optimizations Recognized",
    sectionIssues: "Issues & Challenges",
    sectionROI: "ROI Analysis",
    sectionTechPulse: "Tech Pulse",
    sectionSprint: "Today's Sprint",
    sectionInsight: "Morning Insight",
    labelShipped: "Shipped",
    labelPriority: "Priority",
    labelROITotal: "Estimated Total Value",
    labelROIItem: "Area",
    labelResolution: "Status",
    resolutionResolved: "Resolved",
    resolutionOpen: "Open",
    resolutionMonitoring: "Monitoring",
    labelCategory: "Category",
    labelEstROI: "Est. ROI",
    labelSource: "Source",
    labelTimeEstimate: "Est. time",
    labelImpact: "Impact",
    sprintTheme: "Today's theme",
    aiNotConfigured: "GEMINI_API_KEY is not set.",
    navLabel: "Morning Briefing",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeReport() {
  return {
    generatedAt: "2026-03-05T08:00:00.000Z",
    dateFor: "2026-03-04",
    yesterdaysWork: {
      narrative: "Yesterday the team shipped the morning briefing feature.",
      shipped: [
        {
          title: "PR #100: feat/morning-briefing",
          description: "Adds the daily AI sprint page.",
          url: "https://github.com/cp-build-dev-ops/command-center-reboot/pull/100",
        },
      ],
      dbHighlights: "2 projects updated, 14 rows changed.",
    },
    optimizationsRecognized: [
      {
        title: "Reduce Gemini cold-start latency",
        description: "Pre-warm the Gemini client on server start.",
        estimatedROI: "Saves ~5s per generation",
        priority: "medium" as const,
        category: "Performance",
      },
    ],
    issuesAndChallenges: [
      {
        description: "Google Search grounding occasionally returns empty results.",
        resolution: "monitoring" as const,
        impact: "Tech Pulse section may be sparse.",
        suggestedAction: "Add fallback static news prompt if search returns nothing.",
      },
    ],
    roiAnalysis: {
      summary: "Yesterday's work delivers significant daily value.",
      items: [
        {
          area: "Morning planning time",
          value: "30 min/day",
          reasoning: "Replaces manual GitHub review with automated summary.",
        },
      ],
      totalEstimatedValue: "$1,200/month in saved hours",
    },
    techPulse: {
      summary: "AI continues to advance rapidly across all domains.",
      items: [
        {
          title: "Gemini 2.5 Flash Released",
          source: "Google DeepMind Blog",
          relevance: "Faster structured JSON generation for the briefing pipeline.",
          opportunityAngle: "Lower latency opens the door for real-time site briefings.",
        },
      ],
    },
    todaysSprint: {
      theme: "Ship and stabilize the Morning Briefing feature.",
      items: [
        {
          priority: 1,
          task: "Run the migration on Railway dev",
          why: "Required before the briefing page is accessible in production.",
          estimatedImpact: "Unblocks the feature entirely.",
          timeEstimate: "15min",
        },
      ],
    },
    morningInsight:
      "Construction scheduling and LLM context windows share the same core constraint: limited working memory. Solving one unlocks solutions for the other.",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MorningBriefingClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows page title and subtitle", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ briefing: null, dateFor: "2026-03-04" }),
    });

    const { MorningBriefingClient } = await import(
      "@/components/admin/MorningBriefingClient"
    );

    render(
      <Wrapper>
        <MorningBriefingClient aiEnabled={true} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Morning Briefing")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Your personal daily sprint — powered by Gemini AI")
    ).toBeInTheDocument();
  });

  it("shows 'Generate Today's Briefing' CTA when no briefing exists", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ briefing: null, dateFor: "2026-03-04" }),
    });

    const { MorningBriefingClient } = await import(
      "@/components/admin/MorningBriefingClient"
    );

    render(
      <Wrapper>
        <MorningBriefingClient aiEnabled={true} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Good morning.")).toBeInTheDocument();
    });
    expect(screen.getByText("Generate Today's Briefing")).toBeInTheDocument();
  });

  it("renders the AI not configured banner when aiEnabled is false", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ briefing: null, dateFor: "2026-03-04" }),
    });

    const { MorningBriefingClient } = await import(
      "@/components/admin/MorningBriefingClient"
    );

    render(
      <Wrapper>
        <MorningBriefingClient aiEnabled={false} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("GEMINI_API_KEY is not set.")).toBeInTheDocument();
    });
  });

  it("renders all 7 section headings when a briefing is loaded", async () => {
    const report = makeReport();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        briefing: report,
        dateFor: "2026-03-04",
        generatedAt: "2026-03-05T08:00:00.000Z",
      }),
    });

    const { MorningBriefingClient } = await import(
      "@/components/admin/MorningBriefingClient"
    );

    render(
      <Wrapper>
        <MorningBriefingClient aiEnabled={true} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Yesterday's Work")).toBeInTheDocument();
    });

    expect(screen.getByText("Optimizations Recognized")).toBeInTheDocument();
    expect(screen.getByText("Issues & Challenges")).toBeInTheDocument();
    expect(screen.getByText("ROI Analysis")).toBeInTheDocument();
    expect(screen.getByText("Tech Pulse")).toBeInTheDocument();
    expect(screen.getByText("Today's Sprint")).toBeInTheDocument();
    expect(screen.getByText("Morning Insight")).toBeInTheDocument();
  });

  it("shows Regenerate button (not Generate CTA) when briefing exists", async () => {
    const report = makeReport();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        briefing: report,
        dateFor: "2026-03-04",
        generatedAt: "2026-03-05T08:00:00.000Z",
      }),
    });

    const { MorningBriefingClient } = await import(
      "@/components/admin/MorningBriefingClient"
    );

    render(
      <Wrapper>
        <MorningBriefingClient aiEnabled={true} />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Regenerate")).toBeInTheDocument();
    });
    expect(screen.queryByText("Generate Today's Briefing")).not.toBeInTheDocument();
  });

  it("shows error state when POST fails", async () => {
    // Initial GET returns no cached briefing
    // POST returns an error
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (_, opts) => {
      callCount++;
      if (opts?.method === "POST") {
        return {
          ok: false,
          json: async () => ({ error: "GEMINI_API_KEY is not configured." }),
        };
      }
      return {
        ok: true,
        json: async () => ({ briefing: null, dateFor: "2026-03-04" }),
      };
    });

    const { MorningBriefingClient } = await import(
      "@/components/admin/MorningBriefingClient"
    );

    render(
      <Wrapper>
        <MorningBriefingClient aiEnabled={true} />
      </Wrapper>
    );

    // Wait for empty state
    await waitFor(() => {
      expect(screen.getByText("Generate Today's Briefing")).toBeInTheDocument();
    });

    // Click generate
    await userEvent.click(screen.getByText("Generate Today's Briefing"));

    // Error should appear
    await waitFor(() => {
      expect(screen.getByText("Generation failed")).toBeInTheDocument();
    });
    expect(screen.getByText("GEMINI_API_KEY is not configured.")).toBeInTheDocument();
    expect(callCount).toBe(2); // GET + POST
  });
});

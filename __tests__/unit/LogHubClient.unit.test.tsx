import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
  useRouter: () => ({
    replace: vi.fn(),
  }),
}));

// ── Messages ──────────────────────────────────────────────────────────────────

const messages = {
  projects: {
    tabLog: "Reports",
    logHubIssues: "Issues",
    logHubIssuesDesc: "Open and resolved issues across the project",
    logHubObservations: "Observations",
    logHubObservationsDesc: "Quality, progress, and safety observations",
    logHubInspections: "Inspections",
    logHubInspectionsDesc: "All form inspections and backfill records across the project",
    logHubActivity: "Activity",
    logHubActivityDesc: "Field events, status changes, and bulk updates",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const { LogHubClient } = await import("@/components/projects/LogHubClient");

function renderHub(projectId = "proj-123") {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LogHubClient projectId={projectId} />
    </NextIntlClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LogHubClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch so the open-issue badge fetch doesn't throw
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => null,
    });
  });

  it("renders the Reports page title", () => {
    renderHub();
    expect(screen.getByText("Reports")).toBeDefined();
  });

  it("renders all four report cards: Issues, Observations, Inspections, Activity", () => {
    renderHub();
    expect(screen.getByText("Issues")).toBeDefined();
    expect(screen.getByText("Observations")).toBeDefined();
    expect(screen.getByText("Inspections")).toBeDefined();
    expect(screen.getByText("Activity")).toBeDefined();
  });

  it("renders description text for each hub row", () => {
    renderHub();
    expect(screen.getByText("Open and resolved issues across the project")).toBeDefined();
    expect(screen.getByText("Quality, progress, and safety observations")).toBeDefined();
    expect(screen.getByText("All form inspections and backfill records across the project")).toBeDefined();
    expect(screen.getByText("Field events, status changes, and bulk updates")).toBeDefined();
  });

  it("links to the correct project-scoped sub-routes", () => {
    const { container } = renderHub("proj-xyz");
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/projects/proj-xyz/log/issues");
    expect(hrefs).toContain("/projects/proj-xyz/log/observations");
    expect(hrefs).toContain("/projects/proj-xyz/log/inspections");
    expect(hrefs).toContain("/projects/proj-xyz/log/activity");
  });

  it("does not show the open-issue badge when fetch fails", () => {
    const { container } = renderHub();
    // No badge element should be present when count is null
    const badges = container.querySelectorAll(".report-card__badge");
    expect(badges.length).toBe(0);
  });

  it("uses the provided projectId in all hrefs", () => {
    const { container } = renderHub("custom-project-id");
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs.every((h) => h?.includes("custom-project-id"))).toBe(true);
  });
});

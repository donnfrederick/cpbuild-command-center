import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { StatusDashboard } from "@/app/[locale]/(dashboard)/admin/status/_components/StatusDashboard";

// ── Messages ──────────────────────────────────────────────────────────────────

const messages = {
  adminStatus: {
    title: "Production Status",
    subtitle: "Live health checks for the running app",
    refresh: "Refresh",
    refreshLoading: "…",
    autoRefresh: "Auto-refresh in {seconds}s",
    lastChecked: "Last checked",
    cardHealth: "Live Health",
    cardDeployment: "Deployment Info",
    cardApiChecks: "API Checks",
    cardQuickLinks: "Quick Links",
    statusHealthy: "Healthy",
    statusDegraded: "Degraded",
    statusChecking: "Checking…",
    statusError: "Error",
    labelVersion: "Version",
    labelStatus: "Status",
    labelTimestamp: "Timestamp",
    labelGitSha: "Git SHA",
    labelBranch: "Branch",
    labelEnvironment: "Environment",
    labelDeployed: "Deployed",
    labelNodeVersion: "Node",
    labelUptime: "Uptime",
    checkPass: "Pass",
    checkFail: "Fail",
    checkChecking: "—",
    linkRailway: "Railway Dashboard",
    linkGitHub: "GitHub Actions",
    linkProd: "Production App",
    uptimeHours: "{hours}h {minutes}m",
    uptimeMinutes: "{minutes}m {seconds}s",
    accessDenied: "Access denied. Admin only.",
    hoursAgo: "{hours}h {minutes}m ago",
    minutesAgo: "{minutes}m ago",
    justDeployed: "Just deployed",
  },
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const healthOk = {
  status: "ok",
  timestamp: new Date().toISOString(),
  version: "0.1.0",
};

const deploymentOk = {
  environment: "production",
  gitSha: "abc1234",
  gitBranch: "main",
  nodeVersion: "v22.0.0",
  uptimeSeconds: 7200,
  timestamp: new Date().toISOString(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

function mockFetchAll({
  health = healthOk,
  deployment = deploymentOk,
  projectsStatus = 200,
  teamStatus = 200,
}: {
  health?: object | null;
  deployment?: object | null;
  projectsStatus?: number;
  teamStatus?: number;
} = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      await Promise.resolve(); // simulate microtask tick
      if (url === "/api/health") {
        return { ok: true, status: 200, json: async () => health };
      }
      if (url === "/api/admin/status") {
        return { ok: true, status: 200, json: async () => deployment };
      }
      if (url === "/api/projects") {
        return { ok: projectsStatus === 200, status: projectsStatus, json: async () => ({}) };
      }
      if (url === "/api/team") {
        return { ok: teamStatus === 200, status: teamStatus, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    })
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("StatusDashboard", () => {
  beforeEach(() => {
    mockFetchAll();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders page title and subtitle", () => {
    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    expect(screen.getByText("Production Status")).toBeInTheDocument();
    expect(screen.getByText("Live health checks for the running app")).toBeInTheDocument();
  });

  it("renders all four card headings immediately (before data loads)", () => {
    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    expect(screen.getByText("Live Health")).toBeInTheDocument();
    expect(screen.getByText("Deployment Info")).toBeInTheDocument();
    expect(screen.getByText("API Checks")).toBeInTheDocument();
    expect(screen.getByText("Quick Links")).toBeInTheDocument();
  });

  it("shows Healthy badge after successful health check", async () => {
    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Healthy")).toBeInTheDocument();
    });
  });

  it("shows Degraded badge when health status is not ok", async () => {
    mockFetchAll({
      health: { status: "degraded", timestamp: new Date().toISOString(), version: "0.1.0" },
    });

    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Degraded")).toBeInTheDocument();
    });
  });

  it("shows version from health response", async () => {
    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("0.1.0")).toBeInTheDocument();
    });
  });

  it("shows git SHA, branch, and environment from deployment response", async () => {
    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("abc1234")).toBeInTheDocument();
      expect(screen.getByText("main")).toBeInTheDocument();
      expect(screen.getByText("production")).toBeInTheDocument();
    });
  });

  it("shows Pass badges for all API checks when endpoints return 200", async () => {
    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    await waitFor(() => {
      const passBadges = screen.getAllByText("Pass");
      // At least 3 checks: /api/health, /api/projects, /api/team
      expect(passBadges.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("shows Fail badge when an API check returns non-200", async () => {
    mockFetchAll({ teamStatus: 500 });

    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Fail")).toBeInTheDocument();
    });
  });

  it("shows all three Quick Links", async () => {
    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Railway Dashboard")).toBeInTheDocument();
      expect(screen.getByText("GitHub Actions")).toBeInTheDocument();
      expect(screen.getByText("Production App")).toBeInTheDocument();
    });
  });

  it("renders a Refresh button", async () => {
    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    });
  });

  it("re-runs all fetches when Refresh button is clicked", async () => {
    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    // Wait for initial load
    await waitFor(() => screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => screen.getByText("Healthy"));

    const fetchSpy = vi.mocked(fetch);
    const callsBefore = fetchSpy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it("shows auto-refresh countdown text", async () => {
    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/Auto-refresh in \d+s/)).toBeInTheDocument();
    });
  });

  it("auto-refreshes after 60 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    // Wait for initial load with real-time resolution
    await waitFor(() => screen.getByText("Healthy"), { timeout: 3000 });

    const fetchSpy = vi.mocked(fetch);
    const callsBefore = fetchSpy.mock.calls.length;

    // Advance 60 seconds to trigger auto-refresh
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    vi.useRealTimers();
  });

  it("renders without crashing when deployment data has unknown values (null fixture)", async () => {
    mockFetchAll({
      deployment: {
        environment: "local",
        gitSha: "unknown",
        gitBranch: "unknown",
        nodeVersion: "v22.0.0",
        uptimeSeconds: 0,
        timestamp: new Date().toISOString(),
      },
    });

    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    await waitFor(() => {
      // Should render the unknown SHA without crashing
      const unknownItems = screen.getAllByText("unknown");
      expect(unknownItems.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows 'Just deployed' for uptime under 2 minutes", async () => {
    mockFetchAll({
      deployment: {
        ...deploymentOk,
        uptimeSeconds: 30,
      },
    });

    render(
      <Wrapper>
        <StatusDashboard />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Just deployed")).toBeInTheDocument();
    });
  });
});

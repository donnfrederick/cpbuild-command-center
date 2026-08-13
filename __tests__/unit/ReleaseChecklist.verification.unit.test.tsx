/**
 * Unit tests for the VerificationPanel (exported from ReleaseChecklist).
 *
 * Tests:
 * - "Generate steps" button is shown when verificationSteps is empty
 * - Steps render with title + instructions once present
 * - "Adjust with AI" input appears when steps exist
 * - "Adjust with AI" input hidden when no steps
 * - "Copy link" button is present
 * - Renders safely when verificationSteps is undefined
 * - Calls /api/automation/release-verification when Generate steps is clicked
 * - After successful generate, renders the returned steps
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VerificationPanel } from "@/components/devtools/ReleaseChecklist";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_STEPS = [
  {
    id: "verify-projects",
    changeId: "c1",
    title: "Projects page loads without error",
    instructions: "Navigate to /en/projects and confirm the table renders.",
    route: "/en/projects",
    category: "bug-fix",
  },
  {
    id: "verify-masquerade",
    changeId: "c2",
    title: "Admin masquerade logs display",
    instructions: "Open DevTools admin panel and check the masquerade log tab.",
    route: "/en/admin",
    category: "feature",
  },
];

const BASE_RELEASE = {
  id: "release-prod-fix",
  title: "Production Fix March 6",
  prNumber: null as null,
  branch: "feat/fix",
  environment: "production",
  mergedAt: "2026-03-06T17:00:00.000Z",
  changes: [
    { id: "c1", description: "Fix masquerade_logs table", route: "/en/admin", category: "database" },
  ],
  verificationSteps: [] as typeof MOCK_STEPS,
  verified: false,
  verifiedAt: null as null,
  isNew: true,
};

const RELEASE_WITH_STEPS = { ...BASE_RELEASE, verificationSteps: MOCK_STEPS };
const RELEASE_NO_STEPS = { ...BASE_RELEASE, verificationSteps: [] };

const noop = () => {};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("VerificationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows 'Generate steps' button when verificationSteps is empty", () => {
    render(<VerificationPanel release={RELEASE_NO_STEPS} onNavigate={noop} onStepsUpdated={noop} />);
    expect(screen.getByText("Generate steps")).toBeInTheDocument();
  });

  it("renders verification step titles when steps are present", () => {
    render(<VerificationPanel release={RELEASE_WITH_STEPS} onNavigate={noop} onStepsUpdated={noop} />);
    expect(screen.getByText("Projects page loads without error")).toBeInTheDocument();
    expect(screen.getByText("Admin masquerade logs display")).toBeInTheDocument();
  });

  it("renders instruction text for each step", () => {
    render(<VerificationPanel release={RELEASE_WITH_STEPS} onNavigate={noop} onStepsUpdated={noop} />);
    expect(screen.getByText(/Navigate to \/en\/projects/)).toBeInTheDocument();
  });

  it("shows Adjust with AI input when steps are present", () => {
    render(<VerificationPanel release={RELEASE_WITH_STEPS} onNavigate={noop} onStepsUpdated={noop} />);
    expect(screen.getByPlaceholderText(/Adjust with AI/i)).toBeInTheDocument();
  });

  it("does NOT show Adjust with AI input when no steps", () => {
    render(<VerificationPanel release={RELEASE_NO_STEPS} onNavigate={noop} onStepsUpdated={noop} />);
    expect(screen.queryByPlaceholderText(/Adjust with AI/i)).not.toBeInTheDocument();
  });

  it("shows Copy link button", () => {
    render(<VerificationPanel release={RELEASE_WITH_STEPS} onNavigate={noop} onStepsUpdated={noop} />);
    expect(screen.getByText("Copy link")).toBeInTheDocument();
  });

  it("renders safely when verificationSteps is undefined", () => {
    const releaseNoField = { ...BASE_RELEASE, verificationSteps: undefined as unknown as typeof MOCK_STEPS };
    expect(() =>
      render(<VerificationPanel release={releaseNoField} onNavigate={noop} onStepsUpdated={noop} />)
    ).not.toThrow();
    expect(screen.getByText("Verification Guide")).toBeInTheDocument();
  });

  it("calls /api/automation/release-verification when Generate steps is clicked", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ releaseId: "release-prod-fix", steps: MOCK_STEPS }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<VerificationPanel release={RELEASE_NO_STEPS} onNavigate={noop} onStepsUpdated={noop} />);

    fireEvent.click(screen.getByText("Generate steps"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/automation/release-verification",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("renders steps after successful generate call", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ releaseId: "release-prod-fix", steps: MOCK_STEPS }),
    });
    vi.stubGlobal("fetch", mockFetch);
    const onStepsUpdated = vi.fn();

    render(
      <VerificationPanel
        release={RELEASE_NO_STEPS}
        onNavigate={noop}
        onStepsUpdated={onStepsUpdated}
      />
    );

    fireEvent.click(screen.getByText("Generate steps"));

    await waitFor(() => {
      expect(screen.getByText("Projects page loads without error")).toBeInTheDocument();
    });
    expect(onStepsUpdated).toHaveBeenCalledWith(MOCK_STEPS);
  });

  it("sends feedback to API when Adjust with AI is submitted", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ releaseId: "release-prod-fix", steps: MOCK_STEPS }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<VerificationPanel release={RELEASE_WITH_STEPS} onNavigate={noop} onStepsUpdated={noop} />);

    const input = screen.getByPlaceholderText(/Adjust with AI/i);
    fireEvent.change(input, { target: { value: "focus on mobile" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      const call = mockFetch.mock.calls.find((c) => c[0] === "/api/automation/release-verification");
      expect(call).toBeDefined();
      const body = JSON.parse(call![1].body as string) as { feedback: string };
      expect(body.feedback).toBe("focus on mobile");
    });
  });
});

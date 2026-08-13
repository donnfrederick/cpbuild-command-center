import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PRWorkflowPanel } from "@/components/devtools/PRWorkflowPanel";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// next/navigation is used inside VerificationPanel — stub router
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const mockDiff = "diff --git a/components/foo.tsx b/components/foo.tsx\n+export const Foo = () => null;";
const mockBranch = "feat/pr-workflow-panel";

const mockSteps = [
  { pageUrl: "/en/projects", title: "Verify projects page loads", instruction: "Navigate and confirm the page renders.", elementHint: "Look for the table" },
  { pageUrl: "/en/settings", title: "Verify settings accessible", instruction: "Open settings and confirm no errors.", elementHint: undefined },
];

function mockFetchSuccess() {
  let callCount = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    callCount++;
    // First call: GET /api/devtools/git-diff
    if (typeof url === "string" && url.includes("git-diff")) {
      return { ok: true, json: async () => ({ branch: mockBranch, diff: mockDiff, isEmpty: false }) };
    }
    // Second call: POST /api/devtools/verification-session
    if (typeof url === "string" && url.includes("verification-session") && callCount === 2) {
      return { ok: true, status: 200, json: async () => ({ sessionId: "sess-1", url: "http://localhost/verify/sess-1", stepCount: 2 }) };
    }
    // Third call: GET /api/devtools/verification-session?sessionId=...
    if (typeof url === "string" && url.includes("verification-session") && url.includes("sessionId")) {
      return { ok: true, json: async () => ({ steps: mockSteps }) };
    }
    return { ok: false, status: 500, json: async () => ({ error: "unexpected" }) };
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PRWorkflowPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the panel header", async () => {
    mockFetchSuccess();
    render(<PRWorkflowPanel onClose={vi.fn()} />);
    expect(screen.getByRole("complementary", { name: /PR Workflow panel/i })).toBeTruthy();
    expect(screen.getByText("Prepare PR")).toBeTruthy();
  });

  it("shows loading state while fetching git diff", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // never resolves
    render(<PRWorkflowPanel onClose={vi.fn()} />);
    expect(screen.getByText("Reading git diff…")).toBeTruthy();
  });

  it("shows AI checklist loading after diff is fetched", async () => {
    let resolveGitDiff!: (v: unknown) => void;
    const gitDiffPromise = new Promise((res) => { resolveGitDiff = res; });

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("git-diff")) return await gitDiffPromise;
      return new Promise(() => {}); // checklist loading stays
    }));

    render(<PRWorkflowPanel onClose={vi.fn()} />);

    // Resolve git diff
    resolveGitDiff({ ok: true, json: async () => ({ branch: mockBranch, diff: mockDiff, isEmpty: false }) });

    await waitFor(() => {
      expect(screen.getByText("Generating AI checklist…")).toBeTruthy();
    });
  });

  it("shows an error when git-diff API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "git not found" }),
    })));

    render(<PRWorkflowPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("git not found")).toBeTruthy();
    });
  });

  it("shows empty-diff warning when branch has no changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ branch: "main", diff: "", isEmpty: true }),
    })));

    render(<PRWorkflowPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No diff found against/i)).toBeTruthy();
    });
  });

  it("renders step content after checklist loads", async () => {
    mockFetchSuccess();
    render(<PRWorkflowPanel onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Verify projects page loads")).toBeTruthy();
    });
    expect(screen.getByText(/Step 1 of 2/i)).toBeTruthy();
  });

  it("calls onClose when the X button is clicked", async () => {
    mockFetchSuccess();
    const onClose = vi.fn();
    render(<PRWorkflowPanel onClose={onClose} />);

    const closeBtn = screen.getByRole("button", { name: /close pr workflow panel/i });
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("transitions to Create PR phase after completing all verification steps", async () => {
    mockFetchSuccess();
    const user = userEvent.setup();
    render(<PRWorkflowPanel onClose={vi.fn()} />);

    // Wait for steps to load
    await waitFor(() => {
      expect(screen.getByText("Verify projects page loads")).toBeTruthy();
    });

    // Pass step 1
    await user.click(screen.getByRole("button", { name: /looks good/i }));

    // Wait for step 2
    await waitFor(() => {
      expect(screen.getByText("Verify settings accessible")).toBeTruthy();
    });

    // Pass step 2
    await user.click(screen.getByRole("button", { name: /looks good/i }));

    // Summary screen should appear with Continue to Create PR
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Continue to Create PR/i })).toBeTruthy();
    });

    // Click to advance to phase 2
    await user.click(screen.getByRole("button", { name: /Continue to Create PR/i }));

    // Create PR form should appear
    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toBeTruthy();
    });
    // Branch should be derived from mockBranch: "Pr Workflow Panel"
    const titleInput = screen.getByLabelText("Title") as HTMLInputElement;
    expect(titleInput.value).toBeTruthy();
  });
});

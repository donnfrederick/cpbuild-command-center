import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RolePreviewBanner } from "@/components/shared/RolePreviewBanner";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRefresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// ── Messages ──────────────────────────────────────────────────────────────────

const messages = {
  rolePreview: {
    bannerLabel: "Role preview active",
    previewingAs: "Previewing as",
    yourRoleIs: "Your real role is {role}",
    exitPreview: "Exit preview",
    exitingLabel: "Exiting…",
    sectionLabel: "Role preview",
    selectRole: "Select a role to preview",
    pickARole: "Preview as…",
    yours: "yours",
    errorGeneric: "Failed to switch preview role",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

const previewContext = {
  realRole: "ADMIN",
  previewRole: "MEMBER",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RolePreviewBanner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") }));
  });

  it("renders the preview role name", () => {
    render(<RolePreviewBanner rolePreview={previewContext} />, { wrapper: Wrapper });
    expect(screen.getByText("Member")).toBeInTheDocument();
  });

  it("renders the real role context", () => {
    render(<RolePreviewBanner rolePreview={previewContext} />, { wrapper: Wrapper });
    expect(screen.getByText(/Admin/)).toBeInTheDocument();
  });

  it("renders the exit button", () => {
    render(<RolePreviewBanner rolePreview={previewContext} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: /Exit preview/i })).toBeInTheDocument();
  });

  it("has role=status and aria-live for screen readers", () => {
    render(<RolePreviewBanner rolePreview={previewContext} />, { wrapper: Wrapper });
    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("aria-live", "polite");
  });

  it("calls DELETE /api/admin/role-preview on exit click", async () => {
    render(<RolePreviewBanner rolePreview={previewContext} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: /Exit preview/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/admin/role-preview", { method: "DELETE" });
    });
  });

  it("calls router.refresh() after exit", async () => {
    render(<RolePreviewBanner rolePreview={previewContext} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole("button", { name: /Exit preview/i }));

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("disables the exit button while exiting", async () => {
    // fetch never resolves so button stays in exiting state
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(<RolePreviewBanner rolePreview={previewContext} />, { wrapper: Wrapper });
    const btn = screen.getByRole("button", { name: /Exit preview/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Exiting/i })).toBeDisabled();
    });
  });

  it("renders correctly when previewing CONTROLS_MANAGER", () => {
    render(
      <RolePreviewBanner rolePreview={{ realRole: "DESIGNER", previewRole: "CONTROLS_MANAGER" }} />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Controls Manager")).toBeInTheDocument();
  });
});

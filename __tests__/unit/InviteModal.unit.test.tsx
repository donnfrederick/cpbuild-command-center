import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRouterRefresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Mock Radix UI Dialog — track all onOpenChange handlers in render order.
// The invite dialog is always rendered first (index 0); the preview dialog second.
// The DialogTrigger always opens the first dialog (the invite form).
const _dialogHandlers: Array<(v: boolean) => void> = [];
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: React.ReactNode;
  }) => {
    _dialogHandlers.push(onOpenChange);
    return <div data-open={String(open)}>{children}</div>;
  },
  DialogTrigger: ({ children, asChild }: { children: React.ReactElement; asChild?: boolean }) => {
    const child = asChild ? children : <button>{children}</button>;
    return React.cloneElement(child as React.ReactElement<{ onClick?: (e: unknown) => void }>, {
      onClick: (e: unknown) => {
        (child as React.ReactElement<{ onClick?: (e: unknown) => void }>).props.onClick?.(e);
        // Always open the first (invite) dialog, not the preview dialog
        _dialogHandlers[0]?.(true);
      },
    });
  },
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div role="dialog" className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Component import ──────────────────────────────────────────────────────────

const { InviteModal } = await import("@/components/team/InviteModal");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_ROLES = [
  { id: "r1", code: "ADMIN", name: "Admin", description: "Full access" },
  { id: "r2", code: "MEMBER", name: "Member", description: "Standard access" },
];

function rolesSuccessResponse() {
  return { ok: true, status: 200, json: async () => ({ data: MOCK_ROLES }) };
}

function setupRolesFetch() {
  mockFetch.mockResolvedValue(rolesSuccessResponse());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InviteModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _dialogHandlers.length = 0;
  });

  it("renders the invite team member trigger button", () => {
    render(<InviteModal />);
    expect(screen.getByRole("button", { name: /invite user/i })).toBeInTheDocument();
  });

  // Helper: wait for at least one dialog to appear (the invite dialog is always first)
  async function findInviteDialog() {
    await waitFor(() => expect(screen.getAllByRole("dialog").length).toBeGreaterThan(0));
    return screen.getAllByRole("dialog")[0];
  }

  it("shows the dialog content area after mounting", async () => {
    setupRolesFetch();
    render(<InviteModal />);
    await waitFor(() => {
      expect(screen.getAllByRole("dialog").length).toBeGreaterThan(0);
    });
  });

  it("loads and displays roles when trigger is clicked", async () => {
    setupRolesFetch();
    render(<InviteModal />);
    await findInviteDialog();
    await userEvent.click(screen.getByRole("button", { name: /invite user/i }));
    await waitFor(() => {
      expect(screen.getByText("Member")).toBeInTheDocument();
    });
  });

  it("shows error message when roles API fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    render(<InviteModal />);
    await findInviteDialog();
    await userEvent.click(screen.getByRole("button", { name: /invite user/i }));
    await waitFor(() => {
      expect(screen.getByText(/failed to load roles/i)).toBeInTheDocument();
    });
  });

  it("shows validation error when email is submitted empty", async () => {
    setupRolesFetch();
    render(<InviteModal />);
    await findInviteDialog();
    await userEvent.click(screen.getByRole("button", { name: /invite user/i }));
    await waitFor(() => expect(screen.getByText("Member")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /create invite link/i }));
    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
  });

  it("submits invite and shows 'Invite sent!' when email was delivered", async () => {
    mockFetch
      .mockResolvedValueOnce(rolesSuccessResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { email: "new@cpbuild.com", inviteLink: "https://app.com/invite/abc123", emailSent: true },
        }),
      });

    render(<InviteModal />);
    await findInviteDialog();
    await userEvent.click(screen.getByRole("button", { name: /invite user/i }));
    await waitFor(() => expect(screen.getByText("Member")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/email/i), "new@cpbuild.com");
    await userEvent.click(screen.getByRole("button", { name: /create invite link/i }));

    await waitFor(() => {
      expect(screen.getByText(/invite sent/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/we emailed an invite to/i)).toBeInTheDocument();
    expect(screen.getByText("https://app.com/invite/abc123")).toBeInTheDocument();
  });

  it("shows 'Invite link created' title and couldn't-send message when email was not delivered", async () => {
    mockFetch
      .mockResolvedValueOnce(rolesSuccessResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { email: "new@cpbuild.com", inviteLink: "https://app.com/invite/abc123", emailSent: false },
        }),
      });

    render(<InviteModal />);
    await findInviteDialog();
    await userEvent.click(screen.getByRole("button", { name: /invite user/i }));
    await waitFor(() => expect(screen.getByText("Member")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/email/i), "new@cpbuild.com");
    await userEvent.click(screen.getByRole("button", { name: /create invite link/i }));

    await waitFor(() => {
      expect(screen.getByText(/invite link created/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/the invite was created but the email couldn/i)).toBeInTheDocument();
    expect(screen.getByText("https://app.com/invite/abc123")).toBeInTheDocument();
  });

  it("shows 'Invite sent!' title and delivery confirmation when email was sent", async () => {
    mockFetch
      .mockResolvedValueOnce(rolesSuccessResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { email: "new@cpbuild.com", inviteLink: "https://app.com/invite/abc123", emailSent: true },
        }),
      });

    render(<InviteModal />);
    await findInviteDialog();
    await userEvent.click(screen.getByRole("button", { name: /invite user/i }));
    await waitFor(() => expect(screen.getByText("Member")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/email/i), "new@cpbuild.com");
    await userEvent.click(screen.getByRole("button", { name: /create invite link/i }));

    await waitFor(() => {
      expect(screen.getByText(/invite sent!/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/we emailed an invite to/i)).toBeInTheDocument();
    expect(screen.getByText("https://app.com/invite/abc123")).toBeInTheDocument();
  });

  it("shows 'Invite sent!' title and delivery confirmation when email was sent", async () => {
    mockFetch
      .mockResolvedValueOnce(rolesSuccessResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { email: "new@cpbuild.com", inviteLink: "https://app.com/invite/abc123", emailSent: true },
        }),
      });

    render(<InviteModal />);
    await findInviteDialog();
    await userEvent.click(screen.getByRole("button", { name: /invite user/i }));
    await waitFor(() => expect(screen.getByText("Member")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/email/i), "new@cpbuild.com");
    await userEvent.click(screen.getByRole("button", { name: /create invite link/i }));

    await waitFor(() => {
      expect(screen.getByText(/invite sent!/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/we emailed an invite to/i)).toBeInTheDocument();
    expect(screen.getByText("https://app.com/invite/abc123")).toBeInTheDocument();
  });
});

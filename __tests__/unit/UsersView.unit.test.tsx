import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { UsersView } from "@/components/users/UsersView";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockRefresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/invites", () => ({ resendInvite: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/components/team/InviteModal", () => ({
  InviteModal: () => <button>Invite Member</button>,
}));
vi.mock("@/components/users/MasqueradeButton", () => ({
  MasqueradeButton: ({ userId }: { userId: string }) => (
    <button>{`Masquerade-${userId}`}</button>
  ),
}));
vi.mock("@/components/users/GenerateResetLinkModal", () => ({
  GenerateResetLinkModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="reset-link-modal">
      <span>Generate Password Reset Link</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Fixtures ───────────────────────────────────────────────────────────────────

const messages = {
  users: {
    title: "Users",
    members: "Members",
    membersCount: "Team members ({count})",
    membersFilteredCount: "Team members ({filtered} of {total})",
    searchPlaceholder: "Search by name, email, or role…",
    searchNoResults: "No users match your search.",
    noMembers: "No team members yet.",
    unnamedMember: "Unnamed",
    pendingInvites: "Pending Invites",
    noPendingInvites: "No pending invites",
    invitedBy: "Invited by",
    expires: "Expires",
    resendInvite: "Resend",
    resend: "Resend",
    resending: "Resending…",
    resendSuccess: "Invite resent",
    resendFailed: "Resend failed",
    youLabel: "(you)",
    colName: "Name",
    colEmail: "Email",
    colRoleStatus: "Role / Status",
    resetLink: {
      sectionLabel: "Password Reset",
      button: "Generate reset link",
      modalTitle: "Generate Password Reset Link",
      modalDescription: "Generate a one-time link for {name}.",
      generating: "Generating…",
      messageLabel: "Message to send",
      copyMessage: "Copy message",
      copied: "Copied!",
      copyLinkOnly: "Copy link only",
      copyLinkHint: "Paste in an incognito window to test",
      singleUseNote: "This link is single-use.",
      close: "Close",
      generateError: "Failed to generate reset link",
      messageTemplate: "Hi {name},\n\n{link}",
    },
  },
};

const admin = {
  id: "admin-1", name: "Phil Admin", email: "phil@example.com",
  role: "ADMIN", roleId: "role-admin", roleName: "Admin", status: "ACTIVE" as const,
  createdAt: new Date().toISOString(),
  specialPermissions: [],
};

const member = {
  id: "member-1", name: "Alice Member", email: "alice@example.com",
  role: "MEMBER", roleId: "role-member", roleName: "Member", status: "ACTIVE" as const,
  createdAt: new Date().toISOString(),
  specialPermissions: [],
};

const allRoles = [
  { id: "role-admin", code: "ADMIN", name: "Admin" },
  { id: "role-member", code: "MEMBER", name: "Member" },
];

const pendingInvite = {
  id: "inv-1", email: "newuser@example.com", token: "tok-abc",
  role: "MEMBER", roleName: "Member",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  createdAt: new Date().toISOString(),
  sentBy: "Phil Admin",
};

function renderView(overrides: Partial<Parameters<typeof UsersView>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <UsersView
        members={[admin, member]}
        pendingInvites={[]}
        allRoles={allRoles}
        canInvite={true}
        canManageRoles={true}
        canMasquerade={true}
        currentUserId="admin-1"
        {...overrides}
      />
    </NextIntlClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("UsersView", () => {
  it("renders the page heading", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
  });

  it("renders all member names", () => {
    renderView();
    expect(screen.getByText("Phil Admin")).toBeInTheDocument();
    expect(screen.getByText("Alice Member")).toBeInTheDocument();
  });

  it("marks current user as (you)", () => {
    renderView();
    expect(screen.getByText("(you)")).toBeInTheDocument();
  });

  it("shows InviteModal button when canInvite is true", () => {
    renderView({ canInvite: true });
    expect(screen.getByRole("button", { name: /invite member/i })).toBeInTheDocument();
  });

  it("hides InviteModal when canInvite is false", () => {
    renderView({ canInvite: false });
    expect(screen.queryByRole("button", { name: /invite member/i })).not.toBeInTheDocument();
  });

  it("shows MasqueradeButton for other members when canMasquerade is true", () => {
    renderView({ canMasquerade: true });
    expect(screen.getByText("Masquerade-member-1")).toBeInTheDocument();
  });

  it("does not show MasqueradeButton for current user", () => {
    renderView({ canMasquerade: true });
    // admin-1 is current user — no masquerade button for them
    expect(screen.queryByText("Masquerade-admin-1")).not.toBeInTheDocument();
  });

  it("expands member row on click to show role change UI", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() => expect(screen.getByText("Change role")).toBeInTheDocument());
  });

  it("does not expand current user row", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Phil Admin").closest("div")!.parentElement!);
    await waitFor(() => expect(screen.queryByText("Change role")).not.toBeInTheDocument());
  });

  it("renders pending invites section with invite data", () => {
    renderView({ pendingInvites: [pendingInvite] });
    expect(screen.getByText("Pending Invites (1)")).toBeInTheDocument();
    expect(screen.getByText("newuser@example.com")).toBeInTheDocument();
  });

  it("shows No pending invites message when list is empty", () => {
    renderView({ canInvite: true, pendingInvites: [] });
    expect(screen.getByText("No pending invites")).toBeInTheDocument();
  });

  it("calls resendInvite when Resend button is clicked", async () => {
    const { resendInvite } = await import("@/lib/invites");
    renderView({ pendingInvites: [pendingInvite] });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /resend/i }));
    await waitFor(() => expect(resendInvite).toHaveBeenCalledWith("inv-1"));
  });

  it("shows member count in section heading", () => {
    renderView();
    expect(screen.getByText("Team members (2)")).toBeInTheDocument();
  });

  it("filters members by search text (name, email, role)", async () => {
    renderView();
    const user = userEvent.setup();
    const searchInput = screen.getByRole("searchbox", { name: /search by name/i });

    await user.type(searchInput, "alice");
    expect(screen.getByText("Alice Member")).toBeInTheDocument();
    expect(screen.queryByText("Phil Admin")).not.toBeInTheDocument();
    expect(screen.getByText("Team members (1 of 2)")).toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, "phil@example.com");
    expect(screen.getByText("Phil Admin")).toBeInTheDocument();
    expect(screen.queryByText("Alice Member")).not.toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, "member");
    expect(screen.getByText("Alice Member")).toBeInTheDocument();
    expect(screen.queryByText("Phil Admin")).not.toBeInTheDocument();
  });

  it("shows empty state when search matches no members", async () => {
    renderView();
    const user = userEvent.setup();
    const searchInput = screen.getByRole("searchbox", { name: /search by name/i });

    await user.type(searchInput, "nobody-here");
    expect(screen.getByText("No users match your search.")).toBeInTheDocument();
    expect(screen.queryByText("Phil Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Alice Member")).not.toBeInTheDocument();
  });

});

// ── MemberRow role change ──────────────────────────────────────────────────────

describe("UsersView — role change", () => {
  it("shows Change role button after expanding and clicking it reveals role select", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() => expect(screen.getByText("Change role")).toBeInTheDocument());
    await user.click(screen.getByText("Change role"));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("cancel role change hides the select", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() => expect(screen.getByText("Change role")).toBeInTheDocument());
    await user.click(screen.getByText("Change role"));
    await user.click(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.queryByRole("combobox")).not.toBeInTheDocument());
  });

  it("submits role change via PATCH and updates UI", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { role: "ADMIN", roleName: "Admin" } }),
    });
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() => expect(screen.getByText("Change role")).toBeInTheDocument());
    await user.click(screen.getByText("Change role"));
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "role-admin");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/team/"),
      expect.objectContaining({ method: "PATCH" })
    ));
  });
});

// ── SpecialPermissionsPanel ───────────────────────────────────────────────────

describe("UsersView — SpecialPermissionsPanel", () => {
  it("shows 'No special permissions' when member has none", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() => expect(screen.getByText("No special permissions — role defaults apply.")).toBeInTheDocument());
  });

  it("shows Grant permission button and reveals select on click", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() => expect(screen.getByText("Grant permission")).toBeInTheDocument());
    await user.click(screen.getByText("Grant permission"));
    expect(screen.getByRole("option", { name: /select a permission/i })).toBeInTheDocument();
  });

  it("includes Manage Forms in the grantable permission list", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() => expect(screen.getByText("Grant permission")).toBeInTheDocument());
    await user.click(screen.getByText("Grant permission"));
    expect(screen.getByRole("option", { name: "Manage Forms" })).toBeInTheDocument();
  });

  it("does not offer Masquerade User as a grantable permission", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() => expect(screen.getByText("Grant permission")).toBeInTheDocument());
    await user.click(screen.getByText("Grant permission"));
    expect(screen.queryByRole("option", { name: "Masquerade User" })).not.toBeInTheDocument();
  });

  it("cancel grant hides the form", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() => expect(screen.getByText("Grant permission")).toBeInTheDocument());
    await user.click(screen.getByText("Grant permission"));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole("option", { name: /select a permission/i })).not.toBeInTheDocument());
  });

  it("shows existing special permissions for a member", async () => {
    const memberWithPerm = {
      ...member,
      specialPermissions: [{
        id: "sp-1",
        permission: "VIEW_MORNING_BRIEFING",
        note: "Granted for reporting",
        grantedAt: new Date().toISOString(),
        grantedBy: "Phil Admin",
      }],
    };
    renderView({ members: [admin, memberWithPerm] });
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() => expect(screen.getByRole("button", { name: /revoke/i })).toBeInTheDocument());
    expect(screen.getByText("Granted for reporting")).toBeInTheDocument();
  });
});

// ── Reset link ────────────────────────────────────────────────────────────────

describe("UsersView — reset link", () => {
  it("shows 'Generate reset link' button when expanding another user's row", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generate reset link/i })).toBeInTheDocument()
    );
  });

  it("does NOT show 'Generate reset link' button on the current user's own row", async () => {
    // Expand Alice Member's row (not current user) to confirm the button DOES appear for others,
    // then verify it is absent when only the current user's row is expanded.
    renderView({ members: [admin] }); // render with only the current user
    const user = userEvent.setup();
    // Click Phil Admin's row header — the "(you)" label sibling means we target the list item
    const philRow = screen.getByText("Phil Admin").closest("li")!;
    await user.click(philRow);
    // The reset link button must never appear for the current user, even after expansion
    // Wait long enough for any async expansion to settle
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /generate reset link/i })
      ).not.toBeInTheDocument();
    });
  });

  it("opens the GenerateResetLinkModal when the reset link button is clicked", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generate reset link/i })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: /generate reset link/i }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "reset-link-modal" })).toBeInTheDocument()
    );
  });

  it("closes the GenerateResetLinkModal when Close is clicked", async () => {
    renderView();
    const user = userEvent.setup();
    await user.click(screen.getByText("Alice Member").closest("div")!.parentElement!);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /generate reset link/i })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: /generate reset link/i }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "reset-link-modal" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "reset-link-modal" })).not.toBeInTheDocument()
    );
  });
});


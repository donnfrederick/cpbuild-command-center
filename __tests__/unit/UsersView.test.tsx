import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { UsersView } from "@/components/users/UsersView";

Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

const mockRefresh = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/invites", () => ({
  resendInvite: vi.fn(),
}));

const messages = {
  users: {
    title: "Users",
    members: "Team members",
    membersCount: "Team members ({count})",
    membersFilteredCount: "Team members ({filtered} of {total})",
    searchPlaceholder: "Search by name, email, or role…",
    searchNoResults: "No users match your search.",
    noMembers: "No team members yet.",
    unnamedMember: "Unnamed",
    pendingInvites: "Pending invites",
    noPendingInvites: "No pending invites",
    inviteMember: "Invite member",
    role: "Role",
    invitedBy: "Invited by",
    expires: "Expires",
    resend: "Resend",
    resending: "Sending…",
    resendInvite: "Resend invite email",
    resendSuccess: "Invite email sent",
    resendFailed: "Failed to send invite email",
    youLabel: "(you)",
    colName: "Name",
    colEmail: "Email",
    colRoleStatus: "Role / Status",
  },
};

const DEFAULT_ROLES = [
  { id: "role-admin", code: "ADMIN", name: "Admin" },
  { id: "role-member", code: "MEMBER", name: "Member" },
];

const DEFAULT_MEMBER = {
  id: "u1",
  name: "Alice",
  email: "alice@test.com",
  role: "ADMIN",
  roleId: "role-admin",
  roleName: "Admin",
  createdAt: "2024-01-01T00:00:00Z",
  specialPermissions: [] as Array<{ id: string; permission: string; note: string | null; grantedAt: string; grantedBy: string | null }>,
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

vi.mock("@/components/team/InviteModal", () => ({
  InviteModal: () => <button type="button">Invite member</button>,
}));

describe("UsersView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ALICE = {
    id: "u1",
    name: "Alice",
    email: "alice@test.com",
    role: "ADMIN",
    roleId: "role-admin",
    roleName: "Admin",
    createdAt: "2024-01-01T00:00:00Z",
    specialPermissions: [],
  };

  it("renders title and members section", () => {
    render(
      <Wrapper>
        <UsersView
          members={[DEFAULT_MEMBER]}
          pendingInvites={[]}
          allRoles={DEFAULT_ROLES}
          canInvite={false}
          canManageRoles={false}
          currentUserId="u2"
        />
      </Wrapper>
    );

    expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByText(/Team members \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getAllByText("alice@test.com").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("shows (you) for current user", () => {
    render(
      <Wrapper>
        <UsersView
          members={[DEFAULT_MEMBER]}
          pendingInvites={[]}
          allRoles={DEFAULT_ROLES}
          canInvite={false}
          canManageRoles={false}
          currentUserId="u1"
        />
      </Wrapper>
    );

    expect(screen.getByText(/\(you\)/)).toBeInTheDocument();
  });

  it("shows InviteModal when canInvite is true", () => {
    render(
      <Wrapper>
        <UsersView
          members={[]}
          pendingInvites={[]}
          allRoles={DEFAULT_ROLES}
          canInvite={true}
          canManageRoles={false}
          currentUserId="u1"
        />
      </Wrapper>
    );

    expect(screen.getByRole("button", { name: "Invite member" })).toBeInTheDocument();
  });

  it("hides InviteModal when canInvite is false", () => {
    render(
      <Wrapper>
        <UsersView
          members={[]}
          pendingInvites={[]}
          allRoles={DEFAULT_ROLES}
          canInvite={false}
          canManageRoles={false}
          currentUserId="u1"
        />
      </Wrapper>
    );

    expect(screen.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
  });

  it("renders pending invites section when canInvite", () => {
    render(
      <Wrapper>
        <UsersView
          members={[]}
          pendingInvites={[
            {
              id: "i1",
              email: "invited@test.com",
              token: "tok-abc",
              role: "MEMBER",
              roleName: "Member",
              expiresAt: "2024-02-01T00:00:00Z",
              createdAt: "2024-01-15T00:00:00Z",
              sentBy: "Admin",
            },
          ]}
          allRoles={DEFAULT_ROLES}
          canInvite={true}
          canManageRoles={false}
          currentUserId="u1"
        />
      </Wrapper>
    );

    expect(screen.getByText(/Pending invites \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("invited@test.com")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
  });

  it("shows no pending invites message when empty", () => {
    render(
      <Wrapper>
        <UsersView
          members={[]}
          pendingInvites={[]}
          allRoles={DEFAULT_ROLES}
          canInvite={true}
          canManageRoles={false}
          currentUserId="u1"
        />
      </Wrapper>
    );

    expect(screen.getByText("No pending invites")).toBeInTheDocument();
  });

  const pendingInvite = {
    id: "i1",
    email: "invited@test.com",
    token: "tok-abc123",
    role: "MEMBER",
    roleName: "Member",
    expiresAt: "2099-02-01T00:00:00Z",
    createdAt: "2024-01-15T00:00:00Z",
    sentBy: "Admin",
  };

  it("calls resendInvite and shows success toast on button click", async () => {
    const { resendInvite } = await import("@/lib/invites");
    vi.mocked(resendInvite).mockResolvedValueOnce({ id: "i1", email: "invited@test.com" });
    const { toast } = await import("sonner");

    render(
      <Wrapper>
        <UsersView
          members={[]}
          pendingInvites={[pendingInvite]}
          allRoles={DEFAULT_ROLES}
          canInvite={true}
          canManageRoles={false}
          currentUserId="u1"
        />
      </Wrapper>
    );

    fireEvent.click(screen.getByRole("button", { name: "Resend invite email" }));

    await waitFor(() => {
      expect(resendInvite).toHaveBeenCalledWith("i1");
      expect(toast.success).toHaveBeenCalledWith("Invite email sent");
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it("disables the resend button while request is in flight", async () => {
    const { resendInvite } = await import("@/lib/invites");
    let resolve!: () => void;
    vi.mocked(resendInvite).mockReturnValueOnce(
      new Promise<{ id: string; email: string }>((res) => {
        resolve = () => res({ id: "i1", email: "invited@test.com" });
      })
    );

    render(
      <Wrapper>
        <UsersView
          members={[]}
          pendingInvites={[pendingInvite]}
          allRoles={DEFAULT_ROLES}
          canInvite={true}
          canManageRoles={false}
          currentUserId="u1"
        />
      </Wrapper>
    );

    const btn = screen.getByRole("button", { name: "Resend invite email" });
    fireEvent.click(btn);

    await waitFor(() => expect(btn).toBeDisabled());
    resolve();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("shows error toast when resendInvite throws", async () => {
    const { resendInvite } = await import("@/lib/invites");
    vi.mocked(resendInvite).mockRejectedValueOnce(new Error("This invite has expired"));
    const { toast } = await import("sonner");

    render(
      <Wrapper>
        <UsersView
          members={[]}
          pendingInvites={[pendingInvite]}
          allRoles={DEFAULT_ROLES}
          canInvite={true}
          canManageRoles={false}
          currentUserId="u1"
        />
      </Wrapper>
    );

    fireEvent.click(screen.getByRole("button", { name: "Resend invite email" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("This invite has expired");
    });
  });

  it("renders Copy link button for each pending invite", () => {
    render(
      <Wrapper>
        <UsersView
          members={[]}
          pendingInvites={[pendingInvite]}
          allRoles={DEFAULT_ROLES}
          canInvite={true}
          canManageRoles={false}
          currentUserId="u1"
        />
      </Wrapper>
    );

    expect(screen.getByRole("button", { name: "Copy invite link" })).toBeInTheDocument();
  });

  it("copies invite link to clipboard and shows toast on Copy link click", async () => {
    const { toast } = await import("sonner");

    render(
      <Wrapper>
        <UsersView
          members={[]}
          pendingInvites={[pendingInvite]}
          allRoles={DEFAULT_ROLES}
          canInvite={true}
          canManageRoles={false}
          currentUserId="u1"
        />
      </Wrapper>
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("/en/invite/tok-abc123")
      );
      expect(toast.success).toHaveBeenCalledWith("Invite link copied");
    });
  });
});

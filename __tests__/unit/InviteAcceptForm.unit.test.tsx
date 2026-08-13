import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockPush = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const VALID_TOKEN = "a".repeat(64);
const TEST_EMAIL = "newuser@cpbuild.com";

// ── Component import after mocks ───────────────────────────────────────────────

const { InviteAcceptForm } = await import("@/components/auth/InviteAcceptForm");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InviteAcceptForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders name, password, and confirm password fields", () => {
    render(<InviteAcceptForm token={VALID_TOKEN} email={TEST_EMAIL} />);
    expect(screen.getByLabelText(/inviteFullName/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText(/inviteConfirmPassword/i)).toBeInTheDocument();
  });

  it("displays the invited email in the description", () => {
    render(<InviteAcceptForm token={VALID_TOKEN} email={TEST_EMAIL} />);
    expect(screen.getByText(TEST_EMAIL)).toBeInTheDocument();
  });

  it("shows validation error when name is empty on submit", async () => {
    render(<InviteAcceptForm token={VALID_TOKEN} email={TEST_EMAIL} />);
    await userEvent.type(screen.getByLabelText("Password"), "SecurePass1!");
    await userEvent.type(screen.getByLabelText(/inviteConfirmPassword/i), "SecurePass1!");
    await userEvent.click(screen.getByRole("button", { name: /inviteCreateAccountButton/i }));
    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls POST /api/invites/accept with token and user data", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<InviteAcceptForm token={VALID_TOKEN} email={TEST_EMAIL} />);
    await userEvent.type(screen.getByLabelText(/inviteFullName/i), "John Doe");
    await userEvent.type(screen.getByLabelText("Password"), "SecurePass1!");
    await userEvent.type(screen.getByLabelText(/inviteConfirmPassword/i), "SecurePass1!");
    await userEvent.click(screen.getByRole("button", { name: /inviteCreateAccountButton/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/invites/accept");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string) as { token: string; name: string };
    expect(body.token).toBe(VALID_TOKEN);
    expect(body.name).toBe("John Doe");
  });

  it("redirects to /login?invited=1 on success", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<InviteAcceptForm token={VALID_TOKEN} email={TEST_EMAIL} />);
    await userEvent.type(screen.getByLabelText(/inviteFullName/i), "John Doe");
    await userEvent.type(screen.getByLabelText("Password"), "SecurePass1!");
    await userEvent.type(screen.getByLabelText(/inviteConfirmPassword/i), "SecurePass1!");
    await userEvent.click(screen.getByRole("button", { name: /inviteCreateAccountButton/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login?invited=1");
    });
  });

  it("shows server error message on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invite token has expired" }),
    });
    render(<InviteAcceptForm token={VALID_TOKEN} email={TEST_EMAIL} />);
    await userEvent.type(screen.getByLabelText(/inviteFullName/i), "John Doe");
    await userEvent.type(screen.getByLabelText("Password"), "SecurePass1!");
    await userEvent.type(screen.getByLabelText(/inviteConfirmPassword/i), "SecurePass1!");
    await userEvent.click(screen.getByRole("button", { name: /inviteCreateAccountButton/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("Invite token has expired")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows generic error when API returns no error message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });
    render(<InviteAcceptForm token={VALID_TOKEN} email={TEST_EMAIL} />);
    await userEvent.type(screen.getByLabelText(/inviteFullName/i), "John Doe");
    await userEvent.type(screen.getByLabelText("Password"), "SecurePass1!");
    await userEvent.type(screen.getByLabelText(/inviteConfirmPassword/i), "SecurePass1!");
    await userEvent.click(screen.getByRole("button", { name: /inviteCreateAccountButton/i }));
    await waitFor(() => {
      expect(screen.getByText("inviteGenericError")).toBeInTheDocument();
    });
  });
});

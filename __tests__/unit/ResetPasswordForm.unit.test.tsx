import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, className, style }: { href: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
    <a href={href} className={className} style={style}>{children}</a>
  ),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const VALID_TOKEN = "a".repeat(64);
const VALID_PASSWORD = "SecurePass1!";

// ── Component import after mocks ───────────────────────────────────────────────

const { ResetPasswordForm } = await import("@/components/auth/ResetPasswordForm");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders new password and confirm password fields", () => {
    render(<ResetPasswordForm token={VALID_TOKEN} />);
    expect(screen.getByLabelText(/newPassword/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirmPassword/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resetPasswordSubmit/i })).toBeInTheDocument();
  });

  it("shows password strength checklist as user types", async () => {
    render(<ResetPasswordForm token={VALID_TOKEN} />);
    await userEvent.type(screen.getByLabelText(/newPassword/i), "SecurePass1!");
    expect(screen.getByText("8+ characters")).toBeInTheDocument();
    expect(screen.getByText("Uppercase letter")).toBeInTheDocument();
    expect(screen.getByText("Number")).toBeInTheDocument();
    expect(screen.getByText("Special character")).toBeInTheDocument();
  });

  it("shows validation error when passwords do not match", async () => {
    render(<ResetPasswordForm token={VALID_TOKEN} />);
    await userEvent.type(screen.getByLabelText(/newPassword/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirmPassword/i), "Different1!");
    await userEvent.click(screen.getByRole("button", { name: /resetPasswordSubmit/i }));
    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls POST /api/auth/reset-password with token and password on valid submit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    render(<ResetPasswordForm token={VALID_TOKEN} />);
    await userEvent.type(screen.getByLabelText(/newPassword/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirmPassword/i), VALID_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: /resetPasswordSubmit/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/reset-password");
    const body = JSON.parse(opts.body as string) as { token: string; password: string };
    expect(body.token).toBe(VALID_TOKEN);
    expect(body.password).toBe(VALID_PASSWORD);
  });

  it("shows success state after successful reset", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    render(<ResetPasswordForm token={VALID_TOKEN} />);
    await userEvent.type(screen.getByLabelText(/newPassword/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirmPassword/i), VALID_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: /resetPasswordSubmit/i }));
    await waitFor(() => {
      expect(screen.getByText("resetPasswordSuccess")).toBeInTheDocument();
    });
  });

  it("shows server error message on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "resetPasswordError" }),
    });
    render(<ResetPasswordForm token={VALID_TOKEN} />);
    await userEvent.type(screen.getByLabelText(/newPassword/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirmPassword/i), VALID_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: /resetPasswordSubmit/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("resetPasswordError")).toBeInTheDocument();
  });
});

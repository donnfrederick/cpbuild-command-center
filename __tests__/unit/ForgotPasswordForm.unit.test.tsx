import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Component import after mocks ───────────────────────────────────────────────

const { ForgotPasswordForm } = await import("@/components/auth/ForgotPasswordForm");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the email input and submit button", () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /forgotPasswordSubmit/i })).toBeInTheDocument();
  });

  it("renders a back to sign in link", () => {
    render(<ForgotPasswordForm />);
    const link = screen.getByRole("link", { name: /backToSignIn/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
  });

  it("shows validation error when email is invalid", async () => {
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "notanemail");
    await userEvent.click(screen.getByRole("button", { name: /forgotPasswordSubmit/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows success message after successful submission", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "user@cpbuild.com");
    await userEvent.click(screen.getByRole("button", { name: /forgotPasswordSubmit/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("forgotPasswordSuccess")).toBeInTheDocument();
  });

  it("shows error message on API failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "user@cpbuild.com");
    await userEvent.click(screen.getByRole("button", { name: /forgotPasswordSubmit/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("forgotPasswordError")).toBeInTheDocument();
  });

  it("shows error message when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "user@cpbuild.com");
    await userEvent.click(screen.getByRole("button", { name: /forgotPasswordSubmit/i }));
    await waitFor(() => {
      expect(screen.getByText("forgotPasswordError")).toBeInTheDocument();
    });
  });

  it("calls POST /api/auth/forgot-password with the email", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    render(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "user@cpbuild.com");
    await userEvent.click(screen.getByRole("button", { name: /forgotPasswordSubmit/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/forgot-password",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

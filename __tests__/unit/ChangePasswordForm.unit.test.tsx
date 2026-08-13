import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const VALID_PASSWORD = "SecurePass1!";

// ── Component import after mocks ───────────────────────────────────────────────

const { ChangePasswordForm } = await import("@/components/auth/ChangePasswordForm");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ChangePasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders current password, new password, and confirm password fields", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByLabelText(/currentPassword/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/newPassword/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirmPassword/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /changePasswordSubmit/i })).toBeInTheDocument();
  });

  it("shows section title and description", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByText("changePasswordTitle")).toBeInTheDocument();
    expect(screen.getByText("changePasswordDescription")).toBeInTheDocument();
  });

  it("shows password strength checklist as user types new password", async () => {
    render(<ChangePasswordForm />);
    await userEvent.type(screen.getByLabelText(/newPassword/i), "SecurePass1!");
    expect(screen.getByText("8+ characters")).toBeInTheDocument();
    expect(screen.getByText("Uppercase letter")).toBeInTheDocument();
  });

  it("shows validation error when passwords do not match", async () => {
    render(<ChangePasswordForm />);
    await userEvent.type(screen.getByLabelText(/currentPassword/i), "OldPass1!");
    await userEvent.type(screen.getByLabelText(/newPassword/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirmPassword/i), "Different1!");
    await userEvent.click(screen.getByRole("button", { name: /changePasswordSubmit/i }));
    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls POST /api/auth/change-password on valid submit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    render(<ChangePasswordForm />);
    await userEvent.type(screen.getByLabelText(/currentPassword/i), "OldPass1!");
    await userEvent.type(screen.getByLabelText(/newPassword/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirmPassword/i), VALID_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: /changePasswordSubmit/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/change-password");
    expect(opts.method).toBe("POST");
  });

  it("shows success message after successful password change", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    render(<ChangePasswordForm />);
    await userEvent.type(screen.getByLabelText(/currentPassword/i), "OldPass1!");
    await userEvent.type(screen.getByLabelText(/newPassword/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirmPassword/i), VALID_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: /changePasswordSubmit/i }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(screen.getByText("changePasswordSuccess")).toBeInTheDocument();
  });

  it("shows 'current password incorrect' error on 400 with matching message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "Current password is incorrect" }),
    });
    render(<ChangePasswordForm />);
    await userEvent.type(screen.getByLabelText(/currentPassword/i), "WrongOld1!");
    await userEvent.type(screen.getByLabelText(/newPassword/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirmPassword/i), VALID_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: /changePasswordSubmit/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("changePasswordError")).toBeInTheDocument();
  });

  it("shows generic error for unexpected API errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    render(<ChangePasswordForm />);
    await userEvent.type(screen.getByLabelText(/currentPassword/i), "OldPass1!");
    await userEvent.type(screen.getByLabelText(/newPassword/i), VALID_PASSWORD);
    await userEvent.type(screen.getByLabelText(/confirmPassword/i), VALID_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: /changePasswordSubmit/i }));
    await waitFor(() => {
      expect(screen.getByText("changePasswordGenericError")).toBeInTheDocument();
    });
  });
});

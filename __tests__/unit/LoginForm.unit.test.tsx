import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));

const credentialsLoginAction = vi.fn();
vi.mock("@/app/actions/credentials-login", () => ({
  credentialsLoginAction: (...args: unknown[]) => credentialsLoginAction(...args),
}));

// ── Component import after mocks ───────────────────────────────────────────────

const { LoginForm } = await import("@/components/auth/LoginForm");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    credentialsLoginAction.mockImplementation(async () => undefined);
  });

  it("renders email and password fields with submit button", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText("password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /signIn/i })).toBeInTheDocument();
  });

  it("renders a forgot password link", () => {
    render(<LoginForm />);
    const link = screen.getByRole("link", { name: /forgotPassword/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/forgot-password");
  });

  it("includes hidden redirectTo defaulting to locale home", () => {
    render(<LoginForm />);
    const hidden = document.querySelector('input[name="redirectTo"]') as HTMLInputElement;
    expect(hidden).toBeTruthy();
    expect(hidden.value).toBe("/en");
  });

  it("shows invalidCredentials when server action returns that error", async () => {
    credentialsLoginAction.mockResolvedValueOnce({
      ok: false as const,
      error: "invalidCredentials" as const,
    });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), "admin@cpbuild.com");
    await userEvent.type(screen.getByLabelText("password"), "WrongPass1!");
    await userEvent.click(screen.getByRole("button", { name: /signIn/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("invalidCredentials");
    });
  });

  it("toggles password visibility with show/hide control", async () => {
    render(<LoginForm />);
    const passwordInput = screen.getByLabelText("password");
    expect(passwordInput).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: /showPassword/i }));
    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /hidePassword/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: /hidePassword/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("invokes credentials login action on submit", async () => {
    render(<LoginForm />);
    await userEvent.clear(screen.getByLabelText(/email/i));
    await userEvent.clear(screen.getByLabelText("password"));
    await userEvent.type(screen.getByLabelText("email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("password"), "GoodPass1!");
    await userEvent.click(screen.getByRole("button", { name: /signIn/i }));
    await waitFor(() => {
      expect(credentialsLoginAction).toHaveBeenCalled();
    });
    const call = credentialsLoginAction.mock.calls[0];
    const formData = call[1] as FormData;
    expect(formData.get("email")).toBe("a@b.com");
    expect(formData.get("password")).toBe("GoodPass1!");
  });
});

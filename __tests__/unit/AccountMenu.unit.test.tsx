import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AccountMenu } from "@/components/layout/AccountMenu";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
}));

vi.mock("@/components/navigation/nav-link", () => ({
  NavLink: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
  usePathname: () => "/projects",
}));

const messages = {
  projects: { accountSettings: "Account Settings" },
  auth: { logout: "Sign Out" },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("AccountMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the user name and role", () => {
    render(
      <Wrapper>
        <AccountMenu name="Phil Amour" role="ADMIN" locale="en" />
      </Wrapper>
    );
    expect(screen.getByText("Phil Amour")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  it("opens dropdown on click and shows Settings and Sign Out", () => {
    render(
      <Wrapper>
        <AccountMenu name="Phil Amour" role="ADMIN" locale="en" />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole("button", { name: /account settings/i }));
    expect(screen.getByText("Account Settings")).toBeInTheDocument();
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
  });

  it("never shows Dev Tools (moved to TopBar)", () => {
    render(
      <Wrapper>
        <AccountMenu name="Phil Amour" role="Admin" locale="en" />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole("button", { name: /account settings/i }));
    expect(screen.queryByText("Dev Tools")).not.toBeInTheDocument();
  });

  it("closes the dropdown after clicking Sign Out", () => {
    render(
      <Wrapper>
        <AccountMenu name="Phil Amour" role="Admin" locale="en" />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole("button", { name: /account settings/i }));
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Sign Out"));
    // dropdown should collapse
    expect(screen.queryByText("Account Settings")).not.toBeInTheDocument();
  });
});

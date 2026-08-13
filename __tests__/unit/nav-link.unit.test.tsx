import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { NavLink } from "@/components/navigation/nav-link";
import { NavigationPendingProvider } from "@/components/navigation/navigation-pending-provider";

let mockPathname = "/projects";
const startNavigation = vi.fn();

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    onClick,
    prefetch,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
    prefetch?: boolean;
    [key: string]: unknown;
  }) => (
    <a href={href} data-prefetch={String(prefetch)} onClick={onClick} {...props}>
      {children}
    </a>
  ),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(""),
  getPathname: ({ href }: { locale: string; href: string }) => href,
}));

vi.mock("@/components/navigation/navigation-pending-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/navigation/navigation-pending-provider")>();
  return {
    ...actual,
    useOptionalNavigationPending: () => ({
      isPending: false,
      startNavigation,
    }),
  };
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={{}}>
      <NavigationPendingProvider>{children}</NavigationPendingProvider>
    </NextIntlClientProvider>
  );
}

describe("NavLink", () => {
  beforeEach(() => {
    mockPathname = "/projects";
    startNavigation.mockClear();
  });

  it("calls startNavigation for cross-route clicks", () => {
    render(
      <NavLink href="/feedback">
        <span>Feedback</span>
      </NavLink>,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByRole("link", { name: "Feedback" }));
    expect(startNavigation).toHaveBeenCalledTimes(1);
  });

  it("skips startNavigation for the current route", () => {
    render(
      <NavLink href="/projects">
        <span>Projects</span>
      </NavLink>,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByRole("link", { name: "Projects" }));
    expect(startNavigation).not.toHaveBeenCalled();
  });

  it("skips startNavigation when click is defaultPrevented", () => {
    render(
      <NavLink
        href="/feedback"
        onClick={(e) => e.preventDefault()}
      >
        <span>Feedback</span>
      </NavLink>,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByRole("link", { name: "Feedback" }));
    expect(startNavigation).not.toHaveBeenCalled();
  });

  it("enables prefetch by default", () => {
    render(
      <NavLink href="/feedback">
        <span>Feedback</span>
      </NavLink>,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole("link")).toHaveAttribute("data-prefetch", "true");
  });
});

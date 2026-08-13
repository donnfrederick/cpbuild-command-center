import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { GlobalReportsBackHeader } from "@/components/reports/GlobalReportsBackHeader";

vi.mock("@/i18n/navigation", () => ({
  usePathname: vi.fn(),
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { usePathname } from "@/i18n/navigation";

const messages = {
  globalReports: {
    hubBack: "Reports",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("GlobalReportsBackHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing on the /reports hub", () => {
    vi.mocked(usePathname).mockReturnValue("/reports");
    const { container } = render(<GlobalReportsBackHeader />, { wrapper: Wrapper });
    expect(container.firstChild).toBeNull();
  });

  it("renders a back link on nested activity routes", () => {
    vi.mocked(usePathname).mockReturnValue("/reports/activity/by-user");
    render(<GlobalReportsBackHeader />, { wrapper: Wrapper });

    const link = screen.getByRole("link", { name: "Reports" });
    expect(link).toHaveAttribute("href", "/reports");
  });

  it("renders a back link on nested inspection routes", () => {
    vi.mocked(usePathname).mockReturnValue("/reports/inspections/pass-fail");
    render(<GlobalReportsBackHeader />, { wrapper: Wrapper });

    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/reports");
  });
});

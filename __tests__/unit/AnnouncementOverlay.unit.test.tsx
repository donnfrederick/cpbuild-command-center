import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ComponentProps } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AnnouncementOverlay } from "@/components/announcements/AnnouncementOverlay";

vi.mock("@/hooks/use-is-browser", () => ({ useIsBrowser: () => true }));

vi.mock("@/hooks/use-announcement-viewport-mode", () => ({
  useAnnouncementViewportMode: () => "mobile",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

const messages = {
  admin: {
    announcements: {
      previewBanner: "Preview",
      dismiss: "Dismiss",
      defaultLinkLabel: "Learn more",
    },
  },
  common: { close: "Close" },
};

function renderOverlay(props: Partial<ComponentProps<typeof AnnouncementOverlay>> = {}) {
  const onDismiss = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AnnouncementOverlay
        content={{
          title: "Test title",
          bodyHtml: "<p>Body copy</p>",
          heroImageUrl: null,
          ctaLabel: "Open settings",
          ctaAction: "INTERNAL_LINK",
          ctaHref: "/settings",
        }}
        mode="live"
        onDismiss={onDismiss}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onDismiss };
}

describe("AnnouncementOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title and body", () => {
    renderOverlay();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Test title")).toBeInTheDocument();
    expect(screen.getByText("Body copy")).toBeInTheDocument();
  });

  it("calls onDismiss when dismiss button clicked", () => {
    const { onDismiss } = renderOverlay();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("shows preview banner in preview mode", () => {
    renderOverlay({ mode: "preview" });
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("renders CTA link in preview mode when href is set", () => {
    renderOverlay({ mode: "preview" });
    const link = screen.getByRole("link", { name: "Open settings" });
    expect(link).toHaveAttribute("href", "/settings");
  });
});

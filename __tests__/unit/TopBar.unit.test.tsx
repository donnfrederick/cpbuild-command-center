import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { TopBar } from "@/components/layout/TopBar";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/en",
}));

vi.mock("@/components/feedback/FeedbackButton", () => ({
  FeedbackButton: () => <button aria-label="Give Feedback">Feedback</button>,
}));

vi.mock("@/components/feedback/FeedbackModal", () => ({
  FeedbackModal: () => null,
}));

vi.mock("@/components/notifications/NotificationBell", () => ({
  NotificationBell: () => <button aria-label="Notifications">Bell</button>,
}));

vi.mock("@/components/layout/LocaleSwitcher", () => ({
  LocaleSwitcher: () => null,
}));

const messages = {
  projects: { accountSettings: "Account Settings" },
  auth: { logout: "Sign Out" },
  nav: { notifications: "Notifications" },
  tour: { takeTour: "Take a tour", takeTourAriaLabel: "Start site tour" },
  feedback: { buttonLabel: "Give Feedback" },
  common: { language: "Language" },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("TopBar", () => {
  describe("Feedback button", () => {
    it("renders the inline feedback button in the top bar", () => {
      render(
        <Wrapper>
          <TopBar />
        </Wrapper>
      );
      expect(screen.getByRole("button", { name: "Give Feedback" })).toBeTruthy();
    });
  });

  describe("Notification bell", () => {
    it("renders the notification bell on desktop", () => {
      render(
        <Wrapper>
          <TopBar />
        </Wrapper>
      );
      expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
    });
  });

  describe("Take a tour", () => {
    it("does not render the take-a-tour button while user tour UI is disabled", () => {
      render(
        <Wrapper>
          <TopBar />
        </Wrapper>
      );
      expect(screen.queryByRole("button", { name: "Start site tour" })).not.toBeInTheDocument();
    });
  });
});

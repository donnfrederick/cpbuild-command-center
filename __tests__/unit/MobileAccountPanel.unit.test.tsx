import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/components/feedback/FeedbackFormInline", () => ({
  FeedbackFormInline: () => <div data-testid="feedback-form" />,
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const map: Record<string, Record<string, string>> = {
      projects: { accountSettings: "Account settings" },
      auth: { signOut: "Sign out" },
      tour: { resumeTour: "Resume tour" },
      feedback: { buttonLabel: "Feedback" },
      notifications: { title: "Notifications" },
      common: { language: "Language", close: "Close" },
    };
    return map[namespace]?.[key] ?? `${namespace}.${key}`;
  },
  useLocale: () => "en",
}));

vi.mock("@/components/layout/LocaleSwitcher", () => ({
  LocaleSwitcher: () => <div data-testid="locale-switcher" />,
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/en/projects/p1/units",
}));

vi.mock("@/components/feedback/FeedbackRecordingContext", () => ({
  useFeedbackRecording: () => ({ isRecording: false }),
}));

import { MobileAccountPanel } from "@/components/layout/MobileAccountPanel";

describe("MobileAccountPanel profile settings", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );
  });

  it("opens profile sub-panel without save-to-photos control (camera-only preference)", async () => {
    const user = userEvent.setup();
    render(<MobileAccountPanel name="Justin Myers" role="Install Director" />);

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("button", { name: "Account settings" }));

    expect(screen.getByText("Justin Myers")).toBeInTheDocument();
    expect(screen.getByText("Install Director")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText(/save photos to device/i)).toBeNull();
  });
});

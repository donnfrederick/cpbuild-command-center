import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  getPathname: vi.fn(({ locale, href }: { locale: string; href: string }) => `/${locale}${href}`),
}));

import { getPathname } from "@/i18n/navigation";
import { buildFeedbackDetailAbsoluteUrl } from "@/lib/feedback-urls";

describe("buildFeedbackDetailAbsoluteUrl()", () => {
  beforeEach(() => {
    vi.mocked(getPathname).mockClear();
  });

  it("joins origin with locale-prefixed path from getPathname", () => {
    expect(buildFeedbackDetailAbsoluteUrl("https://app.example", "en", "abc123")).toBe(
      "https://app.example/en/feedback/abc123"
    );
    expect(getPathname).toHaveBeenCalledWith({ locale: "en", href: "/feedback/abc123" });
  });

  it("strips trailing slash from origin", () => {
    expect(buildFeedbackDetailAbsoluteUrl("https://app.example/", "es", "x")).toBe(
      "https://app.example/es/feedback/x"
    );
  });
});

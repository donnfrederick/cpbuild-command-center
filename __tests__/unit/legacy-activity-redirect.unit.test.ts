import { describe, it, expect, vi, beforeEach } from "vitest";

const redirect = vi.fn();
const getLocale = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirect(...args),
}));

vi.mock("next-intl/server", () => ({
  getLocale: () => getLocale(),
}));

describe("LegacyActivityRedirectPage", () => {
  beforeEach(() => {
    redirect.mockClear();
    getLocale.mockResolvedValue("en");
  });

  it("redirects legacy /activity to locale-prefixed /reports/activity", async () => {
    const { default: LegacyActivityRedirectPage } = await import(
      "@/app/[locale]/(dashboard)/activity/page"
    );
    await LegacyActivityRedirectPage();
    expect(redirect).toHaveBeenCalledWith("/en/reports/activity");
  });

  it("uses the active locale in the redirect target", async () => {
    vi.resetModules();
    getLocale.mockResolvedValue("es");
    const { default: LegacyActivityRedirectPage } = await import(
      "@/app/[locale]/(dashboard)/activity/page"
    );
    await LegacyActivityRedirectPage();
    expect(redirect).toHaveBeenCalledWith("/es/reports/activity");
  });
});

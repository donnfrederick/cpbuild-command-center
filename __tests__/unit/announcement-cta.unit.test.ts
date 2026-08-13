import { describe, it, expect } from "vitest";
import {
  effectiveAnnouncementCtaHref,
  normalizeAnnouncementCtaHref,
  resolveAnnouncementCtaAction,
  shouldShowAnnouncementLinkButton,
} from "@/lib/announcements/announcement-cta";

describe("announcement-cta", () => {
  it("resolveAnnouncementCtaAction returns INTERNAL_LINK when href is set", () => {
    expect(resolveAnnouncementCtaAction("/settings")).toBe("INTERNAL_LINK");
    expect(resolveAnnouncementCtaAction("settings")).toBe("INTERNAL_LINK");
  });

  it("resolveAnnouncementCtaAction returns DISMISS_ONLY when href is blank", () => {
    expect(resolveAnnouncementCtaAction(null)).toBe("DISMISS_ONLY");
    expect(resolveAnnouncementCtaAction("")).toBe("DISMISS_ONLY");
    expect(resolveAnnouncementCtaAction("   ")).toBe("DISMISS_ONLY");
  });

  it("normalizeAnnouncementCtaHref adds leading slash", () => {
    expect(normalizeAnnouncementCtaHref("settings")).toBe("/settings");
    expect(normalizeAnnouncementCtaHref("/settings")).toBe("/settings");
    expect(normalizeAnnouncementCtaHref("")).toBeNull();
  });

  it("effectiveAnnouncementCtaHref maps legacy MOBILE_ACCOUNT_PROFILE to href", () => {
    expect(effectiveAnnouncementCtaHref("MOBILE_ACCOUNT_PROFILE", null)).toBe("/settings");
    expect(effectiveAnnouncementCtaHref("MOBILE_ACCOUNT_PROFILE", "/profile")).toBe("/profile");
    expect(effectiveAnnouncementCtaHref("DISMISS_ONLY", "/settings")).toBeNull();
  });

  it("shouldShowAnnouncementLinkButton is true when href resolves", () => {
    expect(shouldShowAnnouncementLinkButton("INTERNAL_LINK", "/settings")).toBe(true);
    expect(shouldShowAnnouncementLinkButton("DISMISS_ONLY", null)).toBe(false);
  });
});

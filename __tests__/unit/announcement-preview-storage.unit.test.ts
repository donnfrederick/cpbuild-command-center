import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ANNOUNCEMENT_PREVIEW_OPEN_EVENT,
  clearAnnouncementPreviewPayload,
  notifyAnnouncementPreviewOpen,
  readAnnouncementPreviewPayload,
  writeAnnouncementPreviewPayload,
} from "@/lib/announcements/announcement-preview-storage";

describe("announcement preview sessionStorage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips preview payload", () => {
    writeAnnouncementPreviewPayload({
      titleEn: "EN",
      titleEs: "ES",
      bodyEn: "<p>a</p>",
      bodyEs: "<p>b</p>",
      heroImageUrlEn: null,
      heroImageUrlEs: null,
      ctaLabelEn: null,
      ctaLabelEs: null,
      ctaAction: "DISMISS_ONLY",
      ctaHref: null,
      locale: "en",
    });
    const read = readAnnouncementPreviewPayload();
    expect(read?.titleEn).toBe("EN");
    expect(read?.locale).toBe("en");
  });

  it("clear removes stored preview", () => {
    writeAnnouncementPreviewPayload({
      titleEn: "EN",
      titleEs: "ES",
      bodyEn: "<p>a</p>",
      bodyEs: "<p>b</p>",
      heroImageUrlEn: null,
      heroImageUrlEs: null,
      ctaLabelEn: null,
      ctaLabelEs: null,
      ctaAction: "DISMISS_ONLY",
      ctaHref: null,
      locale: "en",
    });
    clearAnnouncementPreviewPayload();
    expect(readAnnouncementPreviewPayload()).toBeNull();
  });

  it("notifyAnnouncementPreviewOpen dispatches open event", () => {
    const handler = vi.fn();
    window.addEventListener(ANNOUNCEMENT_PREVIEW_OPEN_EVENT, handler);
    notifyAnnouncementPreviewOpen();
    window.removeEventListener(ANNOUNCEMENT_PREVIEW_OPEN_EVENT, handler);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

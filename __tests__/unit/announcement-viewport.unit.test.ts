import { describe, it, expect } from "vitest";
import { getAnnouncementViewportMode } from "@/lib/announcements/announcement-viewport";

describe("getAnnouncementViewportMode()", () => {
  it("returns mobile at phone widths", () => {
    expect(getAnnouncementViewportMode(320)).toBe("mobile");
    expect(getAnnouncementViewportMode(767)).toBe("mobile");
  });

  it("returns tablet at mid widths", () => {
    expect(getAnnouncementViewportMode(768)).toBe("tablet");
    expect(getAnnouncementViewportMode(1023)).toBe("tablet");
  });

  it("returns desktop at large widths", () => {
    expect(getAnnouncementViewportMode(1024)).toBe("desktop");
    expect(getAnnouncementViewportMode(1280)).toBe("desktop");
  });
});

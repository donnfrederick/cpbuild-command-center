import { describe, it, expect, beforeEach } from "vitest";
import {
  notifyInspectionOverlayClosed,
  notifyInspectionOverlayOpened,
  isInspectionOverlayChromeSuppressed,
  resetInspectionOverlayChromeForTests,
} from "@/lib/inspections/inspection-overlay-chrome";

describe("inspection-overlay-chrome", () => {
  beforeEach(() => {
    resetInspectionOverlayChromeForTests();
  });

  it("starts with chrome visible (not suppressed)", () => {
    expect(isInspectionOverlayChromeSuppressed()).toBe(false);
  });

  it("suppresses chrome while overlay is open", () => {
    notifyInspectionOverlayOpened();
    expect(isInspectionOverlayChromeSuppressed()).toBe(true);
    notifyInspectionOverlayClosed();
    expect(isInspectionOverlayChromeSuppressed()).toBe(false);
  });

  it("handles nested overlays with a ref count", () => {
    notifyInspectionOverlayOpened();
    notifyInspectionOverlayOpened();
    notifyInspectionOverlayClosed();
    expect(isInspectionOverlayChromeSuppressed()).toBe(true);
    notifyInspectionOverlayClosed();
    expect(isInspectionOverlayChromeSuppressed()).toBe(false);
  });
});

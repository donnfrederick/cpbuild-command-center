import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CaptureLocationStrip } from "@/components/shared/CaptureLocationStrip";
import type { SerializedCaptureContext } from "@/lib/media/serialize-capture-context";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("CaptureLocationStrip", () => {
  it("shows distance and coordinates when GPS granted", () => {
    const captureContext: SerializedCaptureContext = {
      captureRecordedAt: "2026-07-24T12:00:00.000Z",
      gpsStatus: "granted",
      latitude: 40.7701,
      longitude: -111.888,
      accuracyMeters: 12,
      distanceFromProjectMeters: 128,
      projectSiteAddressAtCapture: "348 E South Temple",
      projectGeocodeAvailable: true,
      deviceType: "iPhone",
      browser: "Safari",
      appShell: "pwa_installed",
      captureMethod: "native_camera",
    };
    render(<CaptureLocationStrip captureContext={captureContext} />);
    expect(screen.getByText(/420 ft from project/)).toBeTruthy();
    expect(screen.getByText(/40\.7701, -111\.8880/)).toBeTruthy();
  });

  it("shows denial message when GPS denied", () => {
    const captureContext: SerializedCaptureContext = {
      captureRecordedAt: "2026-07-24T12:00:00.000Z",
      gpsStatus: "denied",
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      distanceFromProjectMeters: null,
      projectSiteAddressAtCapture: null,
      projectGeocodeAvailable: false,
      deviceType: "iPhone",
      browser: "Safari",
      appShell: "browser_tab",
      captureMethod: "native_camera",
    };
    render(<CaptureLocationStrip captureContext={captureContext} />);
    expect(screen.getByText("locationNotRecordedDenied")).toBeTruthy();
  });
});

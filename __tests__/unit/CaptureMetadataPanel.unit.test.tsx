import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CaptureMetadataPanel, hasCaptureMetadata } from "@/components/shared/CaptureMetadataPanel";
import type { SerializedCaptureContext } from "@/lib/media/serialize-capture-context";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const grantedContext: SerializedCaptureContext = {
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

describe("hasCaptureMetadata()", () => {
  it("returns false for legacy rows without captureRecordedAt", () => {
    expect(hasCaptureMetadata(undefined)).toBe(false);
  });

  it("returns true when captureRecordedAt is present", () => {
    expect(hasCaptureMetadata(grantedContext)).toBe(true);
  });
});

describe("CaptureMetadataPanel", () => {
  it("renders device and location sections", () => {
    render(<CaptureMetadataPanel captureContext={grantedContext} />);
    expect(screen.getByText("sectionLocation")).toBeTruthy();
    expect(screen.getByText("sectionDevice")).toBeTruthy();
    expect(screen.getByText("iPhone")).toBeTruthy();
    expect(screen.getByText("openInMaps")).toBeTruthy();
  });
});

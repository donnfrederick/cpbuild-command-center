import { describe, expect, it } from "vitest";
import { buildGpsWatermark } from "@/lib/build-gps-watermark";
import type { CaptureClientMetadata } from "@/lib/media/capture-context-schema";

const labels = {
  denied: "GPS: permission denied",
  timeout: "GPS: timed out",
  unavailable: "GPS: unavailable",
  noDistance: "GPS: distance unavailable",
};

const baseMeta: CaptureClientMetadata = {
  gpsStatus: "granted",
  captureRecordedAt: "2026-07-24T12:00:00.000Z",
  latitude: 40.77,
  longitude: -111.89,
  deviceType: "iPhone",
  browser: "Safari",
  appShell: "pwa_installed",
  captureMethod: "native_camera",
  userAgent: "test",
};

describe("buildGpsWatermark()", () => {
  it("returns failure line when GPS denied", () => {
    const result = buildGpsWatermark({ ...baseMeta, gpsStatus: "denied" }, null, labels);
    expect(result).toEqual({ kind: "failure", reason: "denied", line: labels.denied });
  });

  it("returns distance and project address when geocode available (no raw coords)", () => {
    const result = buildGpsWatermark(baseMeta, {
      siteLocation: "348 E South Temple",
      latitude: 40.7705,
      longitude: -111.887,
      available: true,
    }, labels);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.distanceLabel).toContain("ft from project");
      expect(result.distanceLabel).toContain("348 E South Temple");
      expect(result.coordLabel).toBe("");
      expect(result.distanceLabel).not.toMatch(/^40\.77/);
    }
  });

  it("does not burn raw lat/long when geocode is missing", () => {
    const result = buildGpsWatermark(baseMeta, null, labels);
    expect(result).toEqual({
      kind: "success",
      distanceLabel: labels.noDistance,
      coordLabel: "",
    });
  });
});

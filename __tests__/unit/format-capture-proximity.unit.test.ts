import { describe, expect, it } from "vitest";
import {
  formatCaptureCoordinates,
  formatDistanceFromProjectMeters,
} from "@/lib/geo/format-capture-proximity";

describe("formatDistanceFromProjectMeters()", () => {
  it("formats short imperial distances in feet", () => {
    expect(formatDistanceFromProjectMeters(128)).toBe("420 ft from project");
  });

  it("formats long imperial distances in miles", () => {
    expect(formatDistanceFromProjectMeters(16_093)).toMatch(/mi from project$/);
  });

  it("formats metric distances in meters", () => {
    expect(formatDistanceFromProjectMeters(450, { useImperial: false })).toBe("450 m from project");
  });
});

describe("formatCaptureCoordinates()", () => {
  it("formats four decimal places", () => {
    expect(formatCaptureCoordinates(40.770112, -111.888034)).toBe("40.7701, -111.8880");
  });
});

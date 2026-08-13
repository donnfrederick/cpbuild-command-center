import { describe, it, expect } from "vitest";
import { buildGoogleMapsSearchUrl } from "@/lib/maps-url";

describe("buildGoogleMapsSearchUrl()", () => {
  it("returns encoded Google Maps search URL for a non-empty address", () => {
    const url = buildGoogleMapsSearchUrl("123 Main St, Austin, TX");
    expect(url).toBe(
      "https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Austin%2C%20TX"
    );
  });

  it("returns null for empty string", () => {
    expect(buildGoogleMapsSearchUrl("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(buildGoogleMapsSearchUrl("   \t  ")).toBeNull();
  });

  it("encodes special characters in the address safely", () => {
    const url = buildGoogleMapsSearchUrl("100 Main & Oak #2");
    expect(url).toContain("query=100%20Main%20%26%20Oak%20%232");
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  });
});

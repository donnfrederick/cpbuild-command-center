import { describe, expect, it } from "vitest";
import { haversineDistanceMeters } from "@/lib/geo/haversine";

describe("haversineDistanceMeters()", () => {
  it("returns ~0 for identical coordinates", () => {
    expect(haversineDistanceMeters(40.77, -111.89, 40.77, -111.89)).toBeCloseTo(0, 5);
  });

  it("computes known Salt Lake City distance (~420 ft order of magnitude)", () => {
    const meters = haversineDistanceMeters(40.7701, -111.888, 40.7705, -111.887);
    expect(meters).toBeGreaterThan(30);
    expect(meters).toBeLessThan(200);
  });
});

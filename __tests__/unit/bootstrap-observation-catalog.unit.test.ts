import { describe, it, expect } from "vitest";
import { OBSERVATION_TYPE_CATALOG_DEFINITIONS } from "@/lib/observations/observation-catalog-definitions";

describe("bootstrap observation catalog definitions", () => {
  it("includes the four legacy observation types", () => {
    const codes = OBSERVATION_TYPE_CATALOG_DEFINITIONS.map((row) => row.code);
    expect(codes).toEqual(["QUALITY", "PROGRESS", "SAFETY", "OTHER"]);
  });

  it("assigns ascending sort orders", () => {
    const orders = OBSERVATION_TYPE_CATALOG_DEFINITIONS.map((row) => row.sortOrder);
    expect(orders).toEqual([10, 20, 30, 40]);
  });
});

import { describe, it, expect } from "vitest";
import {
  cardLocationBuilderFields,
  isDefinedLocationBuilderField,
  joinLocationBuilderMetaParts,
  labeledLocationBuilderMetaParts,
  sharedLocationBuilderFields,
} from "@/lib/location-builder-display";

describe("isDefinedLocationBuilderField", () => {
  it("rejects null, empty, whitespace, and zero", () => {
    expect(isDefinedLocationBuilderField(null)).toBe(false);
    expect(isDefinedLocationBuilderField("")).toBe(false);
    expect(isDefinedLocationBuilderField("  ")).toBe(false);
    expect(isDefinedLocationBuilderField("0")).toBe(false);
  });

  it("accepts meaningful values", () => {
    expect(isDefinedLocationBuilderField("2")).toBe(true);
    expect(isDefinedLocationBuilderField("850 SF")).toBe(true);
  });
});

describe("cardLocationBuilderFields", () => {
  it("reads buildPhase from card and area from card", () => {
    expect(
      cardLocationBuilderFields({ area: "850 SF", buildPhase: "2" }),
    ).toEqual({ buildPhase: "2", area: "850 SF" });
  });

  it("falls back to scope buildPhase when card field is empty", () => {
    expect(
      cardLocationBuilderFields({
        area: "0",
        buildPhase: "",
        scopes: [{ buildPhase: "Phase A" }],
      }),
    ).toEqual({ buildPhase: "Phase A", area: "" });
  });

  it("falls back to scope area when card field is empty", () => {
    expect(
      cardLocationBuilderFields({
        area: "",
        buildPhase: "2",
        scopes: [{ buildPhase: "", area: "Main Building" }],
      }),
    ).toEqual({ buildPhase: "2", area: "Main Building" });
  });
});

describe("sharedLocationBuilderFields", () => {
  it("returns shared values when every card matches", () => {
    const cards = [
      { area: "850 SF", buildPhase: "2" },
      { area: "850 SF", buildPhase: "2" },
    ];
    expect(sharedLocationBuilderFields(cards)).toEqual({
      buildPhase: "2",
      area: "850 SF",
    });
  });

  it("returns null for a field when values differ", () => {
    expect(
      sharedLocationBuilderFields([
        { area: "850 SF", buildPhase: "2" },
        { area: "900 SF", buildPhase: "2" },
      ]),
    ).toEqual({ buildPhase: "2", area: null });
  });

  it("returns null when any card lacks a defined value", () => {
    expect(
      sharedLocationBuilderFields([
        { area: "850 SF", buildPhase: "2" },
        { area: "850 SF", buildPhase: "" },
      ]),
    ).toEqual({ buildPhase: null, area: "850 SF" });
  });
});

describe("labeledLocationBuilderMetaParts", () => {
  const labels = {
    buildPhase: (v: string) => `Phase ${v}`,
    area: (v: string) => v,
  };

  it("includes both parts when shared", () => {
    expect(
      labeledLocationBuilderMetaParts({ buildPhase: "2", area: "850 SF" }, labels),
    ).toEqual(["Phase 2", "850 SF"]);
  });

  it("joins for header suffix", () => {
    const parts = labeledLocationBuilderMetaParts(
      { buildPhase: "2", area: "850 SF" },
      labels,
    );
    expect(joinLocationBuilderMetaParts(parts)).toBe("Phase 2 · 850 SF");
  });
});

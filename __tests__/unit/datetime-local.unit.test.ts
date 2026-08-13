import { describe, it, expect } from "vitest";
import { toDatetimeLocalValue } from "@/lib/datetime/datetime-local";

describe("toDatetimeLocalValue", () => {
  it("uses local calendar fields, not UTC ISO slice", () => {
    // Local Date constructor — stable in CI (UTC) and on dev laptops (MDT, etc.).
    const date = new Date(2026, 6, 17, 18, 30, 0, 0);
    expect(toDatetimeLocalValue(date)).toBe("2026-07-17T18:30");

    const pad = (n: number) => String(n).padStart(2, "0");
    const fromLocalGetters = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    expect(toDatetimeLocalValue(date)).toBe(fromLocalGetters);

    const utcIsoSlice = date.toISOString().slice(0, 16);
    if (utcIsoSlice !== fromLocalGetters) {
      expect(toDatetimeLocalValue(date)).not.toBe(utcIsoSlice);
    }
  });

  it("pads single-digit month, day, hour, and minute", () => {
    expect(toDatetimeLocalValue(new Date(2026, 0, 5, 9, 7))).toBe("2026-01-05T09:07");
  });
});

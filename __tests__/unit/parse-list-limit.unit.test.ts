import { describe, it, expect } from "vitest";
import { parseListLimit } from "@/lib/parse-list-limit";

describe("parseListLimit()", () => {
  it("returns undefined for missing or invalid values", () => {
    expect(parseListLimit(null)).toBeUndefined();
    expect(parseListLimit("")).toBeUndefined();
    expect(parseListLimit("0")).toBeUndefined();
    expect(parseListLimit("-1")).toBeUndefined();
    expect(parseListLimit("abc")).toBeUndefined();
    expect(parseListLimit("10abc")).toBeUndefined();
    expect(parseListLimit("1e2")).toBeUndefined();
  });

  it("parses positive integers and caps at 100", () => {
    expect(parseListLimit("1")).toBe(1);
    expect(parseListLimit("25")).toBe(25);
    expect(parseListLimit("100")).toBe(100);
    expect(parseListLimit("999")).toBe(100);
  });
});

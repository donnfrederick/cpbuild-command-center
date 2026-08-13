import { describe, it, expect } from "vitest";
import {
  parseScopeCodesFromStatusUpdateLabel,
  parseStatusDisplayFromStatusUpdateLabel,
  scopeCodesFromRefKeys,
} from "@/lib/media/album-scope-tags";

describe("parseScopeCodesFromStatusUpdateLabel()", () => {
  it("extracts scope code before middle dot separator", () => {
    expect(parseScopeCodesFromStatusUpdateLabel("CAB · Completed")).toEqual(["CAB"]);
  });

  it("returns empty array for null, empty, or missing separator", () => {
    expect(parseScopeCodesFromStatusUpdateLabel(null)).toEqual([]);
    expect(parseScopeCodesFromStatusUpdateLabel("")).toEqual([]);
    expect(parseScopeCodesFromStatusUpdateLabel("Completed")).toEqual([]);
  });
});

describe("parseStatusDisplayFromStatusUpdateLabel()", () => {
  it("extracts status label after middle dot separator", () => {
    expect(parseStatusDisplayFromStatusUpdateLabel("Cabinets · In Staging")).toBe("In Staging");
    expect(parseStatusDisplayFromStatusUpdateLabel("Cabinets · Install Complete-Unverified")).toBe(
      "Install Complete-Unverified",
    );
  });

  it("returns null for null, empty, or missing separator", () => {
    expect(parseStatusDisplayFromStatusUpdateLabel(null)).toBeNull();
    expect(parseStatusDisplayFromStatusUpdateLabel("")).toBeNull();
    expect(parseStatusDisplayFromStatusUpdateLabel("In Staging")).toBeNull();
  });
});

describe("scopeCodesFromRefKeys()", () => {
  it("maps ref keys to unique scope type codes", () => {
    const map = new Map([
      ["B|1|101|CAB", "CAB"],
      ["B|1|101|TIL", "TIL"],
    ]);
    expect(scopeCodesFromRefKeys(["B|1|101|CAB", "B|1|101|TIL", "B|1|101|CAB"], map)).toEqual([
      "CAB",
      "TIL",
    ]);
  });

  it("skips unknown ref keys", () => {
    const map = new Map([["known", "CAB"]]);
    expect(scopeCodesFromRefKeys(["unknown", "known"], map)).toEqual(["CAB"]);
  });
});

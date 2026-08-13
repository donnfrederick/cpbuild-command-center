import { describe, it, expect } from "vitest";
import {
  normalizePdfCoverTitleFromBody,
  PDF_COVER_TITLE_MAX_LEN,
} from "@/lib/pdf/normalize-cover-title-from-body";

describe("normalizePdfCoverTitleFromBody()", () => {
  it("returns undefined for non-strings", () => {
    expect(normalizePdfCoverTitleFromBody(undefined)).toBeUndefined();
    expect(normalizePdfCoverTitleFromBody(null)).toBeUndefined();
    expect(normalizePdfCoverTitleFromBody(42)).toBeUndefined();
    expect(normalizePdfCoverTitleFromBody({ x: 1 })).toBeUndefined();
  });

  it("returns undefined for whitespace-only strings", () => {
    expect(normalizePdfCoverTitleFromBody("   ")).toBeUndefined();
    expect(normalizePdfCoverTitleFromBody("\n\t")).toBeUndefined();
  });

  it("trims and returns non-empty titles", () => {
    expect(normalizePdfCoverTitleFromBody("  Hello  ")).toBe("Hello");
  });

  it("truncates beyond maxLen", () => {
    const long = "a".repeat(PDF_COVER_TITLE_MAX_LEN + 50);
    const out = normalizePdfCoverTitleFromBody(long);
    expect(out?.length).toBe(PDF_COVER_TITLE_MAX_LEN);
  });
});

import { describe, it, expect } from "vitest";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";

describe("formatPdfExportErrorToast()", () => {
  it("returns fallback for non-objects", () => {
    expect(formatPdfExportErrorToast(null, "X")).toBe("X");
    expect(formatPdfExportErrorToast(undefined, "X")).toBe("X");
    expect(formatPdfExportErrorToast("raw", "X")).toBe("X");
  });

  it("uses structured error field when present", () => {
    expect(
      formatPdfExportErrorToast({ error: "PDF generation failed." }, "fallback"),
    ).toBe("PDF generation failed.");
  });

  it("appends truncated details after em dash", () => {
    const long = "a".repeat(300);
    const out = formatPdfExportErrorToast(
      { error: "PDF generation failed.", details: long },
      "fallback",
    );
    expect(out.startsWith("PDF generation failed. — ")).toBe(true);
    expect(out.length).toBeLessThan(long.length + 50);
    expect(out.endsWith("…")).toBe(true);
  });
});

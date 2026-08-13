import { describe, it, expect } from "vitest";
import { classifyPdfGenerationFailure } from "@/lib/pdf/pdf-export-errors";

describe("classifyPdfGenerationFailure()", () => {
  it("tags our explicit resolver errors", () => {
    expect(
      classifyPdfGenerationFailure(
        "PDF export: No Chrome or Edge found. Install Chrome.",
      ),
    ).toBe("PDF_BROWSER_NOT_CONFIGURED");
  });

  it("tags ENOENT Puppeteer launches", () => {
    expect(
      classifyPdfGenerationFailure(
        "Failed to launch the browser process: spawn chromium ENOENT",
      ),
    ).toBe("PDF_BROWSER_LAUNCH_FAILED");
  });

  it("tags launcher guard errors without the PDF export: prefix", () => {
    expect(
      classifyPdfGenerationFailure(
        "PDF export refuses to spawn a non-.exe path on Windows (bash.exe).",
      ),
    ).toBe("PDF_BROWSER_NOT_CONFIGURED");
    expect(
      classifyPdfGenerationFailure("PDF internal error: executablePath empty after resolver."),
    ).toBe("PDF_BROWSER_NOT_CONFIGURED");
  });
});

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { mergePdfBuffers } from "@/lib/pdf/merge-pdf-buffers";

async function tinyPdf(pageLabel: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText(pageLabel, { x: 50, y: 100, size: 12 });
  return doc.save();
}

describe("mergePdfBuffers()", () => {
  it("returns the sole buffer unchanged", async () => {
    const single = await tinyPdf("only");
    const merged = await mergePdfBuffers([single]);
    expect(merged).toBe(single);
  });

  it("concatenates pages from multiple PDFs in order", async () => {
    const first = await tinyPdf("first");
    const second = await tinyPdf("second");
    const merged = await mergePdfBuffers([first, second]);
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(2);
  });

  it("throws when given no buffers", async () => {
    await expect(mergePdfBuffers([])).rejects.toThrow(/at least one PDF buffer/);
  });
});

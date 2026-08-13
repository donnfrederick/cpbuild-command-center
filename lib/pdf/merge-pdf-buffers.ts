import { PDFDocument } from "pdf-lib";

/**
 * Concatenate one or more PDF byte arrays into a single document (client-side merge
 * after batched observation export requests).
 */
export async function mergePdfBuffers(buffers: Uint8Array[]): Promise<Uint8Array> {
  if (buffers.length === 0) {
    throw new Error("mergePdfBuffers: at least one PDF buffer is required");
  }
  if (buffers.length === 1) {
    return buffers[0]!;
  }

  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const doc = await PDFDocument.load(buf);
    const copied = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of copied) {
      merged.addPage(page);
    }
  }
  return Uint8Array.from(await merged.save());
}

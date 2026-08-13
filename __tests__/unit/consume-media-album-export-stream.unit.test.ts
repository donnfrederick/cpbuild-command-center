import { describe, it, expect } from "vitest";
import { consumeMediaAlbumExportStream } from "@/lib/media/consume-media-album-export-stream";

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("consumeMediaAlbumExportStream()", () => {
  it("parses progress events and returns the final PDF blob", async () => {
    const pdfBytes = "%PDF-1.4";
    const progressEvents: number[] = [];

    const res = streamResponse([
      `${JSON.stringify({
        type: "progress",
        phase: "gathering",
        locationsCompleted: 1,
        locationsTotal: 2,
        itemsCollected: 3,
        itemsTotal: null,
        currentLocationLabel: "101",
        percent: 33,
      })}\n`,
      `${JSON.stringify({
        type: "progress",
        phase: "rendering",
        locationsCompleted: 2,
        locationsTotal: 2,
        itemsCollected: 5,
        itemsTotal: 5,
        currentLocationLabel: null,
        renderSubphase: "pdf",
        percent: 95,
      })}\n`,
      `${JSON.stringify({
        type: "complete",
        fileName: "media-demo.pdf",
        pdfBase64: btoa(pdfBytes),
      })}\n`,
    ]);

    const result = await consumeMediaAlbumExportStream(res, {
      onProgress: (snapshot) => progressEvents.push(snapshot.percent),
    });

    expect(progressEvents).toEqual([33, 95]);
    expect(result.fileName).toBe("media-demo.pdf");
    expect(result.itemsTotal).toBe(5);
    const text = await result.blob.text();
    expect(text).toBe(pdfBytes);
  });
});

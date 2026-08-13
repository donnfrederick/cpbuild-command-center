import type {
  MediaAlbumExportProgressSnapshot,
  MediaAlbumExportStreamEvent,
} from "@/lib/media/media-album-export-progress";

export interface ConsumeMediaAlbumExportStreamOptions {
  signal?: AbortSignal;
  onProgress?: (snapshot: MediaAlbumExportProgressSnapshot) => void;
}

export interface ConsumeMediaAlbumExportStreamResult {
  blob: Blob;
  fileName: string;
  itemsTotal: number;
  locationsExported: number;
}

export async function consumeMediaAlbumExportStream(
  response: Response,
  opts: ConsumeMediaAlbumExportStreamOptions = {},
): Promise<ConsumeMediaAlbumExportStreamResult> {
  if (!response.body) {
    throw new Error("Export stream missing body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fileName = `media-export-${Date.now()}.pdf`;
  let pdfBase64: string | null = null;
  let itemsTotal = 0;
  let locationsExported = 0;
  let lastProgress: MediaAlbumExportProgressSnapshot | null = null;

  try {
    for (;;) {
      if (opts.signal?.aborted) {
        await reader.cancel();
        throw new DOMException("Aborted", "AbortError");
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const event = JSON.parse(trimmed) as MediaAlbumExportStreamEvent;
        if (event.type === "progress") {
          lastProgress = event;
          opts.onProgress?.(event);
          if (event.itemsTotal != null) {
            itemsTotal = event.itemsTotal;
          }
          if (event.phase === "gathering" && event.locationsCompleted === event.locationsTotal) {
            locationsExported = event.locationsTotal;
          }
        } else if (event.type === "complete") {
          fileName = event.fileName;
          pdfBase64 = event.pdfBase64;
        } else if (event.type === "error") {
          const err = new Error(event.error) as Error & { code?: string };
          err.code = event.code;
          throw err;
        }
      }
    }

    if (buffer.trim()) {
      const event = JSON.parse(buffer.trim()) as MediaAlbumExportStreamEvent;
      if (event.type === "complete") {
        fileName = event.fileName;
        pdfBase64 = event.pdfBase64;
      } else if (event.type === "error") {
        const err = new Error(event.error) as Error & { code?: string };
        err.code = event.code;
        throw err;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!pdfBase64) {
    throw new Error("Export stream ended without a PDF");
  }

  if (lastProgress?.itemsTotal != null) {
    itemsTotal = lastProgress.itemsTotal;
  }

  const binary = atob(pdfBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return {
    blob: new Blob([bytes], { type: "application/pdf" }),
    fileName,
    itemsTotal,
    locationsExported,
  };
}

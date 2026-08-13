export type MediaAlbumExportPhase = "gathering" | "rendering";

export type MediaAlbumExportRenderSubphase = "images" | "pdf";

export interface MediaAlbumExportProgressSnapshot {
  phase: MediaAlbumExportPhase;
  locationsCompleted: number;
  locationsTotal: number;
  itemsCollected: number;
  itemsTotal: number | null;
  currentLocationLabel: string | null;
  renderSubphase?: MediaAlbumExportRenderSubphase;
  imagesLoaded?: number;
  imagesTotal?: number;
  percent: number;
}

/** Weight gathering at 65% and rendering (images + PDF) at 35%. */
export function computeMediaAlbumExportPercent(input: {
  phase: MediaAlbumExportPhase;
  locationsCompleted: number;
  locationsTotal: number;
  renderSubphase?: MediaAlbumExportRenderSubphase;
  imagesLoaded?: number;
  imagesTotal?: number;
}): number {
  const locationsTotal = Math.max(1, input.locationsTotal);

  if (input.phase === "gathering") {
    const ratio = Math.min(1, input.locationsCompleted / locationsTotal);
    return Math.min(65, Math.round(ratio * 65));
  }

  const imagesTotal = input.imagesTotal ?? 0;
  if (input.renderSubphase === "images" && imagesTotal > 0) {
    const imagesLoaded = Math.min(imagesTotal, input.imagesLoaded ?? 0);
    const ratio = imagesLoaded / imagesTotal;
    return Math.min(90, Math.round(65 + ratio * 25));
  }

  if (input.renderSubphase === "pdf") {
    return 95;
  }

  return 85;
}

export type MediaAlbumExportStreamEvent =
  | ({ type: "progress" } & MediaAlbumExportProgressSnapshot)
  | { type: "complete"; fileName: string; pdfBase64: string }
  | { type: "error"; error: string; code?: string };

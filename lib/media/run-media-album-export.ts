import type { PrismaClient } from "@prisma/client";
import { fetchAlbumItemsForUnitRef } from "@/lib/media/fetch-album-items-for-unit-ref";
import { filterAlbumItemsByMediaFilters } from "@/lib/media/media-filters";
import { ALBUM_SOURCE_TAG_KEYS } from "@/lib/media/media-filters";
import type { MediaAlbumExportFilters } from "@/lib/media/media-export-types";
import type { MediaExportLocationEntry } from "@/lib/media/media-export-types";
import {
  computeMediaAlbumExportPercent,
  type MediaAlbumExportProgressSnapshot,
} from "@/lib/media/media-album-export-progress";
import {
  MEDIA_ALBUM_PDF_FETCH_CONCURRENCY,
  MEDIA_ALBUM_PDF_MAX_ITEMS,
  MEDIA_ALBUM_PDF_MAX_LOCATIONS,
} from "@/lib/pdf/media-album-export-limits";
import { buildMediaAlbumPdf } from "@/lib/pdf/media-album-pdf";
import { enrichProjectById } from "@/lib/project-unifier-merge";
import type { AlbumSourceType } from "@/lib/media/album-types";

export class MediaAlbumExportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly maxBatchSize?: number,
  ) {
    super(message);
    this.name = "MediaAlbumExportError";
  }
}

export interface RunMediaAlbumExportOptions {
  db: PrismaClient;
  projectId: string;
  locations: MediaExportLocationEntry[];
  filters: MediaAlbumExportFilters;
  filterSummary: string;
  projectName?: string;
  sourceLabels?: Partial<Record<AlbumSourceType, string>>;
  standaloneSectionTitle?: string;
  customLocationBadge?: string;
  cookieHeader?: string;
  appOrigin: string;
  signal?: AbortSignal;
  onProgress?: (snapshot: MediaAlbumExportProgressSnapshot) => void;
}

export interface RunMediaAlbumExportResult {
  pdfBuffer: Buffer;
  fileName: string;
  itemsTotal: number;
  locationsExported: number;
}

async function mapWithConcurrencyProgress<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onItemComplete?: (completed: number, total: number, result: R) => void,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  let completed = 0;

  function throwIfAborted(): void {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  }

  async function worker(): Promise<void> {
    while (index < items.length) {
      throwIfAborted();
      const i = index++;
      results[i] = await fn(items[i]!, i);
      completed += 1;
      onItemComplete?.(completed, items.length, results[i]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function labelForUnitRef(
  unitRef: string,
  locations: MediaExportLocationEntry[],
): string {
  return locations.find((loc) => loc.unitRef === unitRef)?.label ?? unitRef;
}

function emitProgress(
  onProgress: RunMediaAlbumExportOptions["onProgress"],
  snapshot: Omit<MediaAlbumExportProgressSnapshot, "percent">,
): void {
  onProgress?.({
    ...snapshot,
    percent: computeMediaAlbumExportPercent(snapshot),
  });
}

export async function runMediaAlbumExport(
  opts: RunMediaAlbumExportOptions,
): Promise<RunMediaAlbumExportResult> {
  const {
    db,
    projectId,
    locations,
    filters,
    filterSummary,
    projectName: bodyProjectName,
    sourceLabels: rawSourceLabels,
    standaloneSectionTitle,
    customLocationBadge,
    cookieHeader,
    appOrigin,
    signal,
    onProgress,
  } = opts;

  const uniqueUnitRefs = [...new Set(locations.map((loc) => loc.unitRef))];
  if (uniqueUnitRefs.length > MEDIA_ALBUM_PDF_MAX_LOCATIONS) {
    throw new MediaAlbumExportError(
      `Too many locations for one export (max ${MEDIA_ALBUM_PDF_MAX_LOCATIONS}). Narrow your filters.`,
      400,
      "PDF_BATCH_TOO_LARGE",
      MEDIA_ALBUM_PDF_MAX_LOCATIONS,
    );
  }

  const locationsTotal = uniqueUnitRefs.length;
  let itemsCollected = 0;

  emitProgress(onProgress, {
    phase: "gathering",
    locationsCompleted: 0,
    locationsTotal,
    itemsCollected: 0,
    itemsTotal: null,
    currentLocationLabel: null,
  });

  let albumByUnitRef: Map<string, Awaited<ReturnType<typeof fetchAlbumItemsForUnitRef>>>;
  try {
    const pairs = await mapWithConcurrencyProgress(
      uniqueUnitRefs,
      MEDIA_ALBUM_PDF_FETCH_CONCURRENCY,
      async (unitRef) => {
        const items = await fetchAlbumItemsForUnitRef(db, projectId, unitRef);
        return [unitRef, filterAlbumItemsByMediaFilters(items, filters)] as const;
      },
      (completed, _total, pair) => {
        const [unitRef, items] = pair;
        itemsCollected += items.length;
        emitProgress(onProgress, {
          phase: "gathering",
          locationsCompleted: completed,
          locationsTotal,
          itemsCollected,
          itemsTotal: null,
          currentLocationLabel: labelForUnitRef(unitRef, locations),
        });
      },
      signal,
    );
    albumByUnitRef = new Map(pairs);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    console.error("[album/export-pdf] album fetch failed:", err);
    throw new MediaAlbumExportError("Failed to load media for export", 500);
  }

  const locationBlocks = locations
    .map((location) => ({
      location,
      items: albumByUnitRef.get(location.unitRef) ?? [],
    }))
    .filter((block) => block.items.length > 0);

  if (locationBlocks.length === 0) {
    throw new MediaAlbumExportError(
      "No media matches the current filters.",
      400,
      "PDF_NO_MATCHING_MEDIA",
    );
  }

  const itemsTotal = locationBlocks.reduce((sum, block) => sum + block.items.length, 0);
  if (itemsTotal > MEDIA_ALBUM_PDF_MAX_ITEMS) {
    throw new MediaAlbumExportError(
      `Too many photos for one export (${itemsTotal}; max ${MEDIA_ALBUM_PDF_MAX_ITEMS}). Narrow your filters.`,
      400,
      "PDF_BATCH_TOO_LARGE",
      MEDIA_ALBUM_PDF_MAX_ITEMS,
    );
  }

  emitProgress(onProgress, {
    phase: "gathering",
    locationsCompleted: locationsTotal,
    locationsTotal,
    itemsCollected: itemsTotal,
    itemsTotal,
    currentLocationLabel: null,
  });

  const enriched = await enrichProjectById(projectId);
  const projectName =
    bodyProjectName?.trim()
    || enriched?.projectName?.trim()
    || "Project";

  const defaultSourceLabels: Record<AlbumSourceType, string> = {
    observation: "Observation",
    observation_comment: "Obs. comment",
    issue: "Issue",
    issue_comment: "Issue comment",
    inspection: "Inspection",
    general: "General",
    status_update: "Status update",
  };

  const sourceLabels = { ...defaultSourceLabels };
  if (rawSourceLabels) {
    for (const key of ALBUM_SOURCE_TAG_KEYS) {
      const label = rawSourceLabels[key];
      if (typeof label === "string" && label.trim()) {
        sourceLabels[key] = label.trim();
      }
    }
  }

  emitProgress(onProgress, {
    phase: "rendering",
    locationsCompleted: locationsTotal,
    locationsTotal,
    itemsCollected: itemsTotal,
    itemsTotal,
    currentLocationLabel: null,
    renderSubphase: "images",
    imagesLoaded: 0,
    imagesTotal: 0,
  });

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await buildMediaAlbumPdf({
      projectName,
      filterSummary,
      exportedAt: new Date(),
      locations: locationBlocks,
      sourceLabels,
      standaloneSectionTitle,
      customLocationBadge,
      pdfImageFetch: { cookieHeader, appOrigin },
      onRenderProgress: (update) => {
        emitProgress(onProgress, {
          phase: "rendering",
          locationsCompleted: locationsTotal,
          locationsTotal,
          itemsCollected: itemsTotal,
          itemsTotal,
          currentLocationLabel: null,
          renderSubphase: update.subphase,
          imagesLoaded: update.imagesLoaded,
          imagesTotal: update.imagesTotal,
        });
      },
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw err;
  }

  emitProgress(onProgress, {
    phase: "rendering",
    locationsCompleted: locationsTotal,
    locationsTotal,
    itemsCollected: itemsTotal,
    itemsTotal,
    currentLocationLabel: null,
    renderSubphase: "pdf",
  });

  const safeName = projectName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40)
    || "project";
  const fileName = `media-${safeName}-${Date.now()}.pdf`;

  return {
    pdfBuffer,
    fileName,
    itemsTotal,
    locationsExported: locationBlocks.length,
  };
}

export function wantsMediaAlbumExportStream(req: Request): boolean {
  return req.headers.get("Accept") === "application/x-ndjson"
    || req.headers.get("X-Media-Export-Stream") === "1";
}

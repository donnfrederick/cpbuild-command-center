import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { absoluteAppOriginFromRequest } from "@/lib/field-media-local";
import { ALBUM_SOURCE_TAG_KEYS } from "@/lib/media/media-filters";
import { MEDIA_SOURCE_FILTER_KEYS } from "@/lib/media/media-filters";
import type { MediaExportLocationKind } from "@/lib/media/media-export-types";
import { MEDIA_ALBUM_PDF_MAX_LOCATIONS } from "@/lib/pdf/media-album-export-limits";
import { pdfGenerationFailedNextResponse } from "@/lib/pdf/pdf-export-errors";
import type { AlbumSourceType } from "@/lib/media/album-types";
import {
  MediaAlbumExportError,
  runMediaAlbumExport,
  wantsMediaAlbumExportStream,
} from "@/lib/media/run-media-album-export";
import type { MediaAlbumExportStreamEvent } from "@/lib/media/media-album-export-progress";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const LocationEntrySchema = z.object({
  unitRef: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["standalone_custom", "building_custom", "unit"] satisfies MediaExportLocationKind[]),
  buildingKey: z.string().nullable().optional(),
  levelKey: z.string().nullable().optional(),
  buildingLabel: z.string().nullable().optional(),
  levelLabel: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  buildPhase: z.string().nullable().optional(),
  detailLine: z.string().nullable().optional(),
});

const ExportBodySchema = z.object({
  locations: z.array(LocationEntrySchema).min(1).max(MEDIA_ALBUM_PDF_MAX_LOCATIONS),
  filters: z.object({
    mediaSourceTypes: z.array(z.enum(MEDIA_SOURCE_FILTER_KEYS)).default([]),
    albumSourceTags: z.array(z.enum(ALBUM_SOURCE_TAG_KEYS)).default([]),
  }),
  filterSummary: z.string().default(""),
  projectName: z.string().optional(),
  sourceLabels: z.record(z.string(), z.string()).optional(),
  standaloneSectionTitle: z.string().optional(),
  customLocationBadge: z.string().optional(),
});

function validationErrorResponse(parsed: z.ZodSafeParseError<unknown>): NextResponse {
  const tooManyLocations = parsed.error.issues.some(
    (issue) => issue.path.join(".") === "locations" && issue.code === "too_big",
  );
  if (tooManyLocations) {
    return NextResponse.json(
      {
        error: `Too many locations for one export (max ${MEDIA_ALBUM_PDF_MAX_LOCATIONS}). Narrow your filters.`,
        code: "PDF_BATCH_TOO_LARGE",
        maxBatchSize: MEDIA_ALBUM_PDF_MAX_LOCATIONS,
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
}

function exportErrorResponse(err: MediaAlbumExportError): NextResponse {
  return NextResponse.json(
    {
      error: err.message,
      code: err.code,
      maxBatchSize: err.maxBatchSize,
    },
    { status: err.status },
  );
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ExportBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return validationErrorResponse(parsed);
  }

  const {
    locations,
    filters,
    filterSummary,
    projectName,
    sourceLabels,
    standaloneSectionTitle,
    customLocationBadge,
  } = parsed.data;

  const cookieHeader = req.headers.get("cookie") ?? undefined;
  const appOrigin = absoluteAppOriginFromRequest(req);
  const streamRequested = wantsMediaAlbumExportStream(req);

  const exportOpts = {
    db,
    projectId,
    locations,
    filters,
    filterSummary,
    projectName,
    sourceLabels: sourceLabels as Partial<Record<AlbumSourceType, string>> | undefined,
    standaloneSectionTitle,
    customLocationBadge,
    cookieHeader,
    appOrigin,
    signal: req.signal,
  };

  if (streamRequested) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: MediaAlbumExportStreamEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        try {
          const result = await runMediaAlbumExport({
            ...exportOpts,
            onProgress: (snapshot) => emit({ type: "progress", ...snapshot }),
          });

          emit({
            type: "complete",
            fileName: result.fileName,
            pdfBase64: result.pdfBuffer.toString("base64"),
          });
          controller.close();
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            controller.close();
            return;
          }
          if (err instanceof MediaAlbumExportError) {
            emit({ type: "error", error: err.message, code: err.code });
            controller.close();
            return;
          }
          console.error("[album/export-pdf] stream failed:", err);
          emit({ type: "error", error: "PDF export failed.", code: "PDF_GENERATION_FAILED" });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const result = await runMediaAlbumExport(exportOpts);
    return new NextResponse(new Uint8Array(result.pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof MediaAlbumExportError) {
      return exportErrorResponse(err);
    }
    return pdfGenerationFailedNextResponse("[album/export-pdf]", err);
  }
}

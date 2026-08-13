import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { absoluteAppOriginFromRequest } from "@/lib/field-media-local";
import { buildObsPdf, type ObsForPdf } from "@/lib/pdf/observations-pdf";
import { OBSERVATIONS_PDF_EXPORT_BATCH_SIZE, uniqueObservationIdsInOrder } from "@/lib/pdf/observations-export-batch";
import {
  buildObservationsExportWhere,
  parseObservationsExportDatePreset,
} from "@/lib/pdf/observations-export-filters";
import { normalizePdfCoverTitleFromBody } from "@/lib/pdf/normalize-cover-title-from-body";
import {
  invalidFilterArrayResponse,
  invalidFilterEnumResponse,
  invalidFilterScalarResponse,
  parseOptionalBoolean,
  parseOptionalEnumStringArray,
  parseOptionalPositiveInt,
  parseOptionalStringArray,
} from "@/lib/pdf/parse-export-filter-body";
import { pdfGenerationFailedNextResponse } from "@/lib/pdf/pdf-export-errors";
import { enrichProjectById } from "@/lib/project-unifier-merge";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const rawBody = await req.json().catch(() => ({}));
  const body = typeof rawBody === "object" && rawBody !== null && !Array.isArray(rawBody)
    ? rawBody as Record<string, unknown>
    : {};
  const obsTypesParsed = parseOptionalStringArray(body.obsTypes, "obsTypes");
  if (!obsTypesParsed.ok) return invalidFilterArrayResponse(obsTypesParsed.field);
  const authorsParsed = parseOptionalStringArray(body.authors, "authors");
  if (!authorsParsed.ok) return invalidFilterArrayResponse(authorsParsed.field);
  const buildingsParsed = parseOptionalStringArray(body.buildings, "buildings");
  if (!buildingsParsed.ok) return invalidFilterArrayResponse(buildingsParsed.field);
  const levelsParsed = parseOptionalStringArray(body.levels, "levels");
  if (!levelsParsed.ok) return invalidFilterArrayResponse(levelsParsed.field);

  const typedBody = body as {
    observationIds?: string[];
    datePreset?: string;
    dateFrom?: string;
    dateTo?: string;
    sortOrder?: "newest" | "oldest";
    projectName?: string;
    filterSummary?: string;
  };
  const {
    observationIds: rawObservationIds,
    datePreset: rawDatePreset,
    dateFrom,
    dateTo,
    sortOrder = "newest",
    projectName = "Project",
    filterSummary = "",
  } = typedBody;
  const obsTypes = obsTypesParsed.value;
  const authors = authorsParsed.value;
  const buildings = buildingsParsed.value;
  const levels = levelsParsed.value;
  const datePreset = parseObservationsExportDatePreset(rawDatePreset);
  const bodyCoverTitle = typeof body.coverTitle === "string" ? body.coverTitle : undefined;

  const observationIds = Array.isArray(rawObservationIds)
    ? uniqueObservationIdsInOrder(rawObservationIds)
    : [];

  if (observationIds.length > OBSERVATIONS_PDF_EXPORT_BATCH_SIZE) {
    return NextResponse.json(
      {
        error: `Too many observations in one export request (max ${OBSERVATIONS_PDF_EXPORT_BATCH_SIZE}).`,
        code: "PDF_BATCH_TOO_LARGE",
        maxBatchSize: OBSERVATIONS_PDF_EXPORT_BATCH_SIZE,
      },
      { status: 400 },
    );
  }

  const includeCoverParsed = parseOptionalBoolean(body.includeCover, "includeCover", true);
  if (!includeCoverParsed.ok) {
    return invalidFilterScalarResponse(includeCoverParsed.field, "a boolean");
  }
  const coverCountParsed = parseOptionalPositiveInt(body.coverObservationCount, "coverObservationCount");
  if (!coverCountParsed.ok) {
    return invalidFilterScalarResponse(coverCountParsed.field, "a positive number");
  }
  const includeCover = includeCoverParsed.value;
  const coverObservationCount = coverCountParsed.value;

  const observations = await db.projectObservation.findMany({
    where: buildObservationsExportWhere({
      projectId,
      observationIds: observationIds.length > 0 ? observationIds : undefined,
      obsTypes: obsTypes.length > 0 ? obsTypes : undefined,
      authors: authors.length > 0 ? authors : undefined,
      buildings,
      levels,
      datePreset,
      dateFrom,
      dateTo,
    }),
    include: {
      author: { select: { id: true, name: true, email: true } },
      attachments: true,
      scopeTags: {
        include: {
          row: {
            select: {
              id: true,
              building: true,
              level: true,
              unit: true,
              scopeType: { select: { name: true } },
            },
          },
        },
      },
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, email: true } },
          attachments: {
            select: { id: true, mimeType: true, storageUrl: true, storageKey: true },
          },
        },
      },
    },
    orderBy: { createdAt: sortOrder === "newest" ? "desc" : "asc" },
  });

  if (observationIds.length > 0) {
    const orderIndex = new Map(observationIds.map((id, index) => [id, index]));
    observations.sort(
      (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0),
    );
  }

  if (observationIds.length > 0 && observations.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (observations.length === 0) {
    return NextResponse.json(
      { error: "No observations match the current filters." },
      { status: 404 },
    );
  }

  let resolvedProjectName = projectName;
  let projectAddress = "";
  try {
    const project = await enrichProjectById(projectId);
    resolvedProjectName =
      projectName !== "Project" ? projectName : (project?.projectName ?? projectName);
    projectAddress = project?.siteLocation ?? "";
  } catch {
    // Best-effort enrichment — export still succeeds with client-provided projectName.
  }

  const normalizedCoverTitle = normalizePdfCoverTitleFromBody(bodyCoverTitle);
  const coverTitle =
    normalizedCoverTitle !== undefined
      ? normalizedCoverTitle
      : observationIds.length === 1
        ? "Observation"
        : observationIds.length > 1
          ? `Observations (${observationIds.length})`
          : undefined;

  try {
    const pdfBuffer = await buildObsPdf({
      observations: observations.map((o) => ({
        ...(o as unknown as ObsForPdf),
        observationType: o.observationTypeCode,
      })),
      projectName: resolvedProjectName,
      projectAddress,
      filterSummary,
      exportedAt: new Date(),
      ...(coverTitle !== undefined ? { coverTitle } : {}),
      includeCover,
      ...(coverObservationCount !== undefined ? { coverObservationCount } : {}),
      preserveObservationOrder: observationIds.length > 0,
      pdfImageFetch: {
        cookieHeader: req.headers.get("cookie"),
        appOrigin: absoluteAppOriginFromRequest(req),
      },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="observations-${projectId}-${Date.now()}.pdf"`,
      },
    });
  } catch (err) {
    return pdfGenerationFailedNextResponse("[export-pdf/observations]", err);
  }
}

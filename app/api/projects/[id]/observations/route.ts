import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  enforceProductionFieldNotesMutation,
  enforceProjectReadVisibility,
} from "@/lib/production-project-access";
import { getActivityReplayMetadata } from "@/lib/activity-logger";
import { voidLogFieldActivity } from "@/lib/activity/log-field-activity";
import { filterObservationAttachmentHeads } from "@/lib/observation-attachments";
import {
  assertActiveObservationTypeCode,
  observationCatalogValidationStatus,
} from "@/lib/observations/observation-catalog";
import { serializeObservationRow } from "@/lib/observations/observation-api";
import { promoteUploadCaptureContextsFromAttachments } from "@/lib/field-media/promote-upload-capture-context";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import { attachmentFileSizeBytesSchema } from "@/lib/media-attachment-schemas";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
import { parseImageAnnotation } from "@/lib/image-annotation-schema";
import { scopeRefKeysFromRowIds } from "@/lib/field-notes/scope-ref-keys";
import {
  loadLocationBuilderTagOptions,
  normalizeLocationBuilderTagInput,
  validateLocationBuilderTags,
} from "@/lib/field-notes/location-builder-tags";
import { isProjectLevelUnitRef, PROJECT_LEVEL_UNIT_REF_OR } from "@/lib/field-notes-scope";
import { parseListLimit } from "@/lib/parse-list-limit";

const CreateObservationSchema = z.object({
  unitRef: z.string().optional(),
  projectRowIds: z.array(z.string()).max(20).default([]),
  subScopeInstanceId: z.string().optional(),
  title: z.string().default(""),
  description: z.string().default(""),
  observationType: z.string().min(1),
  attachmentKeys: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentUrls: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentMimeTypes: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentFileSizeBytes: attachmentFileSizeBytesSchema,
  attachmentCaptions: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  /** Layered annotation payload per attachment. Null entries mean no annotation. */
  attachmentImageAnnotations: z.array(z.unknown()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  buildPhaseTag: z.string().max(100).optional(),
  areaTag: z.string().max(100).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const { searchParams } = new URL(req.url);

  const typeFilter = searchParams.get("type");
  const unitRefFilter = searchParams.get("unitRef");
  const projectRowIdFilter = searchParams.get("projectRowId");
  const projectLevel = searchParams.get("projectLevel") === "true";
  const limit = parseListLimit(searchParams.get("limit"));

  const where = {
    projectId,
    ...(typeFilter ? { observationTypeCode: typeFilter } : {}),
    ...(projectLevel ? { OR: [...PROJECT_LEVEL_UNIT_REF_OR] } : {}),
    ...(unitRefFilter && !projectLevel ? { unitRef: unitRefFilter } : {}),
    ...(projectRowIdFilter
      ? { scopeTags: { some: { projectRowId: projectRowIdFilter } } }
      : {}),
  };

  const observationInclude = {
    author: { select: { id: true, name: true, email: true } },
    attachments: true,
    scopeTags: {
      include: { row: { select: { id: true, building: true, level: true, unit: true, scopeTypeId: true, scopeType: { select: { name: true } } } } },
    },
    _count: { select: { comments: true } },
  } as const;

  let observations;
  let totalCount: number | undefined;
  try {
    if (limit !== undefined) {
      const [rows, count] = await Promise.all([
        db.projectObservation.findMany({
          where,
          include: observationInclude,
          orderBy: { createdAt: "desc" },
          take: limit,
        }),
        db.projectObservation.count({ where }),
      ]);
      observations = rows;
      totalCount = count;
    } else {
      observations = await db.projectObservation.findMany({
        where,
        include: observationInclude,
        orderBy: { createdAt: "desc" },
      });
    }
  } catch (err) {
    console.error("[observations GET] Prisma error:", err);
    return NextResponse.json({ error: "Failed to fetch observations" }, { status: 500 });
  }

  const mapped = observations.map((o) =>
    serializeObservationRow({
      ...o,
      attachments: filterObservationAttachmentHeads(o.attachments),
    }),
  );

  return NextResponse.json({
    observations: mapped,
    ...(totalCount !== undefined ? { totalCount } : {}),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    session,
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  const body = await req.json().catch(() => null);
  const parsed = CreateObservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const {
    unitRef,
    projectRowIds,
    subScopeInstanceId,
    title,
    description,
    observationType,
    attachmentKeys,
    attachmentUrls,
    attachmentMimeTypes,
    attachmentFileSizeBytes,
    attachmentCaptions,
    attachmentImageAnnotations,
    buildPhaseTag,
    areaTag,
  } = parsed.data;

  const normalizedUnitRef = unitRef === "" ? null : unitRef ?? null;
  const tagOptions = await loadLocationBuilderTagOptions(db, projectId);
  const tagError = validateLocationBuilderTags(
    normalizedUnitRef,
    { buildPhaseTag, areaTag },
    tagOptions,
  );
  if (tagError) {
    return NextResponse.json({ error: tagError }, { status: 422 });
  }
  const normalizedTags = normalizeLocationBuilderTagInput({ buildPhaseTag, areaTag });

  // Validate any specified scope rows belong to this project
  if (projectRowIds.length > 0) {
    const rows = await db.projectRow.findMany({
      where: { id: { in: projectRowIds }, projectId },
      select: { id: true },
    });
    if (rows.length !== projectRowIds.length) {
      return NextResponse.json({ error: "One or more project rows not found" }, { status: 404 });
    }
  }

  const resolvedUserId = await resolveSessionToDbUserId(effective.user);
  if (!resolvedUserId) {
    return NextResponse.json({ error: "No users found in database" }, { status: 500 });
  }

  let scopeRefKeys: string[] = [];
  if (projectRowIds.length > 0) {
    try {
      scopeRefKeys = await scopeRefKeysFromRowIds(db, projectId, projectRowIds);
    } catch {
      return NextResponse.json({ error: "One or more project rows not found" }, { status: 404 });
    }
  }

  let observationTypeCode: string;
  try {
    const observationTypeRow = await assertActiveObservationTypeCode(observationType);
    observationTypeCode = observationTypeRow.code;
  } catch (err) {
    const status = observationCatalogValidationStatus(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid observation type" },
      { status },
    );
  }

  try {
    const observation = await db.$transaction(async (tx) => {
      const created = await tx.projectObservation.create({
        data: {
          projectId,
          unitRef: unitRef ?? undefined,
          subScopeInstanceId: subScopeInstanceId ?? undefined,
          title,
          description,
          observationTypeCode,
          authorId: resolvedUserId,
          scopeRefKeys,
          buildPhaseTag: isProjectLevelUnitRef(normalizedUnitRef)
            ? normalizedTags.buildPhaseTag
            : null,
          areaTag: isProjectLevelUnitRef(normalizedUnitRef) ? normalizedTags.areaTag : null,
          scopeTags: projectRowIds.length > 0
            ? { create: projectRowIds.map((rowId) => ({ projectRowId: rowId, id: `${Date.now()}-${rowId}` })) }
            : undefined,
          attachments: {
            create: attachmentKeys.map((key, i) => ({
              storageKey: key,
              storageUrl: attachmentUrls[i] ?? "",
              mimeType: attachmentMimeTypes[i] ?? "application/octet-stream",
              fileSizeBytes: attachmentFileSizeBytes[i] ?? null,
              caption: attachmentCaptions[i] ?? null,
              uploadedById: resolvedUserId,
              ...(attachmentImageAnnotations[i] != null ? { imageAnnotation: parseImageAnnotation(attachmentImageAnnotations[i]) ?? undefined } : {}),
            })),
          },
        },
        include: {
          author: { select: { id: true, name: true, email: true } },
          attachments: true,
          scopeTags: { include: { row: { select: { id: true, scopeType: { select: { name: true } } } } } },
        },
      });
      if (created.attachments.length > 0) {
        await promoteUploadCaptureContextsFromAttachments(tx, created.attachments);
      }
      return created;
    });
    voidLogFieldActivity(
      projectId,
      { user: effective.user },
      {
        eventType: "OBSERVATION_CREATED",
        observationId: observation.id,
        title: title || "",
        observationType: observationTypeCode,
        unitRef: unitRef ?? null,
        ...getActivityReplayMetadata(req.headers),
      },
      {
        requestBody: typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null,
        attachmentIds: observation.attachments.map((a) => a.id),
      },
    );

    return NextResponse.json(serializeObservationRow(observation), { status: 201 });
  } catch (err) {
    console.error("[observations POST] Prisma error:", err);
    return NextResponse.json({ error: "Failed to create observation" }, { status: 500 });
  }
}

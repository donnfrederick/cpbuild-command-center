import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  enforceProductionFieldNotesMutation,
  enforceProjectReadVisibility,
} from "@/lib/production-project-access";
import { type Prisma } from "@prisma/client";
import { getActivityReplayMetadata } from "@/lib/activity-logger";
import { voidLogFieldActivity } from "@/lib/activity/log-field-activity";
import {
  assertActiveObservationTypeCode,
  observationCatalogValidationStatus,
} from "@/lib/observations/observation-catalog";
import { serializeObservationRow } from "@/lib/observations/observation-api";
import { promoteUploadCaptureContextsForStorageKeys } from "@/lib/field-media/promote-upload-capture-context";
import { captureContextInclude } from "@/lib/media/serialize-capture-context";
import { mapMediaAttachmentsForApi } from "@/lib/media/map-attachment-for-api";
import { filterObservationAttachmentHeads, isObservationAttachmentHead } from "@/lib/observation-attachments";
import { parseImageAnnotation } from "@/lib/image-annotation-schema";
import { scopeRefKeysFromRowIds } from "@/lib/field-notes/scope-ref-keys";
import { normalizeFieldNotesUnitRef } from "@/lib/field-notes-location-ref";
import { scopeRowsMatchUnitRef } from "@/lib/field-notes/validate-scope-for-unit-ref";
import { isCustomSiteUnitRef } from "@/lib/custom-site-locations";

const PatchObservationSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  observationType: z.string().min(1).optional(),
  unitRef: z.string().nullable().optional(),
  scopeTagIds: z.array(z.string()).max(20).optional(),
  addAttachmentKeys: z.array(z.string()).max(10).optional(),
  addAttachmentUrls: z.array(z.string()).max(10).optional(),
  addAttachmentMimeTypes: z.array(z.string()).max(10).optional(),
  addAttachmentFileSizeBytes: z.array(z.number().int().nonnegative()).max(10).optional(),
  addAttachmentCaptions: z.array(z.string()).max(10).optional(),
  removeAttachmentIds: z.array(z.string()).max(20).optional(),
  updateAttachmentAnnotation: z
    .object({
      attachmentId: z.string(),
      imageAnnotation: z.unknown(),
    })
    .optional(),
});

const attachmentUploaderInclude = {
  uploadedBy: { select: { id: true, name: true, email: true } },
  lastMarkedBy: { select: { id: true, name: true, email: true } },
  ...captureContextInclude,
} as const;

type Params = { params: Promise<{ id: string; obsId: string }> };

async function resolveMutationUserId(effectiveUserId: string): Promise<string> {
  let resolvedUserId = effectiveUserId;
  const userExists = await db.user.findUnique({ where: { id: resolvedUserId }, select: { id: true } });
  if (!userExists) {
    const fallback = await db.user.findFirst({ select: { id: true } });
    if (!fallback) {
      throw new Error("NO_USERS");
    }
    resolvedUserId = fallback.id;
  }
  return resolvedUserId;
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, obsId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const obs = await db.projectObservation.findFirst({
    where: { id: obsId, projectId },
    include: {
      author: { select: { id: true, name: true, email: true } },
      attachments: { include: attachmentUploaderInclude },
      scopeTags: { include: { row: { select: { id: true, scopeType: { select: { name: true } } } } } },
      _count: { select: { comments: true } },
      comments: {
        include: {
          author: { select: { id: true, name: true, email: true } },
          attachments: { include: captureContextInclude },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!obs) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allAtt = obs.attachments;
  const heads = filterObservationAttachmentHeads(allAtt);

  return NextResponse.json(
    serializeObservationRow({
      ...obs,
      attachments: mapMediaAttachmentsForApi(heads),
      comments: obs.comments.map((c) => ({
        ...c,
        attachments: mapMediaAttachmentsForApi(c.attachments),
      })),
    }),
  );
}

/** Observation annotation updates require an online API round-trip (not queued offline). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, obsId } = await params;

  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    session,
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  const obs = await db.projectObservation.findFirst({ where: { id: obsId, projectId } });
  if (!obs) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAuthor = obs.authorId === effective.user.id;
  if (!isAuthor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let resolvedUserId: string;
  try {
    resolvedUserId = await resolveMutationUserId(effective.user.id);
  } catch (e) {
    if ((e as Error).message === "NO_USERS") {
      return NextResponse.json({ error: "No users found in database" }, { status: 500 });
    }
    throw e;
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchObservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const {
    unitRef: unitRefPatch,
    scopeTagIds,
    addAttachmentKeys,
    addAttachmentUrls,
    addAttachmentMimeTypes,
    addAttachmentFileSizeBytes,
    addAttachmentCaptions,
    removeAttachmentIds,
    updateAttachmentAnnotation,
    ...coreData
  } = parsed.data;

  const hasCore =
    coreData.title !== undefined ||
    coreData.description !== undefined ||
    coreData.observationType !== undefined;
  const hasUnitRef = unitRefPatch !== undefined;
  const hasScope = scopeTagIds !== undefined;
  const hasRemove = (removeAttachmentIds?.length ?? 0) > 0;
  const hasAdd = (addAttachmentKeys?.length ?? 0) > 0;
  const hasAnnotationUpdate = Boolean(updateAttachmentAnnotation);

  let annotationSanitized = null as ReturnType<typeof parseImageAnnotation>;
  if (hasAnnotationUpdate && updateAttachmentAnnotation) {
    annotationSanitized = parseImageAnnotation(updateAttachmentAnnotation.imageAnnotation);
    if (!annotationSanitized) {
      return NextResponse.json({ error: "Invalid annotation payload" }, { status: 422 });
    }
  }

  if (hasRemove) {
    for (const aid of removeAttachmentIds ?? []) {
      const row = await db.mediaAttachment.findFirst({
        where: { id: aid, observationId: obsId },
      });
      if (!row) {
        return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
      }
      const child = await db.mediaAttachment.findFirst({ where: { supersedesId: aid } });
      if (child) {
        return NextResponse.json(
          { error: "Remove the current version only; older versions are under the latest image." },
          { status: 409 }
        );
      }
    }
  }

  if (hasAnnotationUpdate && updateAttachmentAnnotation) {
    const allForObs = await db.mediaAttachment.findMany({
      where: { observationId: obsId },
      select: { id: true, supersedesId: true, mimeType: true },
    });
    const row = allForObs.find((a) => a.id === updateAttachmentAnnotation.attachmentId);
    if (!row) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }
    if (!row.mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "Annotation only applies to images" }, { status: 422 });
    }
    if (!isObservationAttachmentHead(updateAttachmentAnnotation.attachmentId, allForObs)) {
      return NextResponse.json(
        { error: "Can only edit markup on the current image version" },
        { status: 409 }
      );
    }
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  if (hasRemove) {
    ops.push(
      db.mediaAttachment.deleteMany({
        where: { id: { in: removeAttachmentIds ?? [] }, observationId: obsId },
      }),
    );
  }

  if (hasAnnotationUpdate && updateAttachmentAnnotation && annotationSanitized) {
    ops.push(
      db.mediaAttachment.update({
        where: { id: updateAttachmentAnnotation.attachmentId, observationId: obsId },
        data: {
          imageAnnotation: annotationSanitized,
          lastMarkedById: resolvedUserId,
          lastMarkedAt: new Date(),
        },
      }),
    );
  }

  if (hasAdd && addAttachmentKeys && addAttachmentKeys.length > 0) {
    ops.push(
      db.mediaAttachment.createMany({
        data: addAttachmentKeys.map((key, i) => ({
          observationId: obsId,
          storageKey: key,
          storageUrl: addAttachmentUrls?.[i] ?? "",
          mimeType: addAttachmentMimeTypes?.[i] ?? "application/octet-stream",
          fileSizeBytes: addAttachmentFileSizeBytes?.[i] ?? null,
          caption: addAttachmentCaptions?.[i] ?? null,
          uploadedById: resolvedUserId,
        })),
      }),
    );
  }

  let unitRefChanging = hasUnitRef;
  if (hasUnitRef && isCustomSiteUnitRef(obs.unitRef)) {
    const normalizedPatch = normalizeFieldNotesUnitRef(unitRefPatch);
    if (normalizedPatch !== obs.unitRef) {
      return NextResponse.json(
        { error: "Custom site location cannot be changed here" },
        { status: 422 },
      );
    }
    // Edit form echoes unchanged custom location — not a relocation.
    unitRefChanging = false;
  }

  const resolvedUnitRef = unitRefChanging ? normalizeFieldNotesUnitRef(unitRefPatch) : obs.unitRef;
  const effectiveScopeTagIds = hasScope
    ? (scopeTagIds ?? [])
    : unitRefChanging
      ? []
      : undefined;

  if (effectiveScopeTagIds !== undefined) {
    const scopeOk = await scopeRowsMatchUnitRef(db, projectId, resolvedUnitRef, effectiveScopeTagIds);
    if (!scopeOk) {
      return NextResponse.json(
        { error: "Scope tags must belong to the selected unit" },
        { status: 422 },
      );
    }
  }

  const obsUpdate: Prisma.ProjectObservationUpdateInput = {};
  if (coreData.title !== undefined) obsUpdate.title = coreData.title;
  if (coreData.description !== undefined) obsUpdate.description = coreData.description;
  if (coreData.observationType !== undefined) {
    try {
      const row = await assertActiveObservationTypeCode(coreData.observationType);
      obsUpdate.observationTypeCode = row.code;
    } catch (err) {
      const status = observationCatalogValidationStatus(err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid observation type" },
        { status },
      );
    }
  }
  if (unitRefChanging) obsUpdate.unitRef = resolvedUnitRef;
  if (effectiveScopeTagIds !== undefined) {
    let scopeRefKeysUpdate: string[] = [];
    try {
      scopeRefKeysUpdate = await scopeRefKeysFromRowIds(db, projectId, effectiveScopeTagIds);
    } catch {
      return NextResponse.json({ error: "One or more project rows not found" }, { status: 404 });
    }
    obsUpdate.scopeRefKeys = scopeRefKeysUpdate;
    obsUpdate.scopeTags = {
      deleteMany: {},
      create: effectiveScopeTagIds.map((rowId) => ({ projectRowId: rowId })),
    };
  }

  if (Object.keys(obsUpdate).length > 0) {
    ops.push(db.projectObservation.update({ where: { id: obsId }, data: obsUpdate }));
  }

  if (ops.length > 0) {
    try {
      await db.$transaction(ops);
    } catch (err) {
      console.error("[observations PATCH] Prisma error:", err);
      return NextResponse.json({ error: "Failed to update observation" }, { status: 500 });
    }
  }

  if (addAttachmentKeys?.length) {
    const newAttachments = await db.mediaAttachment.findMany({
      where: { observationId: obsId, storageKey: { in: addAttachmentKeys } },
      select: { id: true, storageKey: true },
    });
    await promoteUploadCaptureContextsForStorageKeys(newAttachments);
  }

  const updated = await db.projectObservation.findFirst({
    where: { id: obsId, projectId },
    include: {
      author: { select: { id: true, name: true, email: true } },
      attachments: { include: attachmentUploaderInclude },
      scopeTags: { include: { row: { select: { id: true, scopeType: { select: { name: true } } } } } },
      _count: { select: { comments: true } },
    },
  });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const heads = filterObservationAttachmentHeads(updated.attachments);

  const requestBody =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const titleStr = updated.title ?? "";
  const unitRef = updated.unitRef ?? null;
  const replayMeta = getActivityReplayMetadata(req.headers);
  const addedAttachmentIds =
    addAttachmentKeys && addAttachmentKeys.length > 0
      ? (
          await db.mediaAttachment.findMany({
            where: { observationId: obsId, storageKey: { in: addAttachmentKeys } },
            select: { id: true },
          })
        ).map((a) => a.id)
      : [];

  if (hasAnnotationUpdate && updateAttachmentAnnotation) {
    voidLogFieldActivity(
      projectId,
      { user: effective.user },
      {
        eventType: "OBSERVATION_ANNOTATION_UPDATED",
        observationId: obsId,
        title: titleStr,
        unitRef,
        attachmentId: updateAttachmentAnnotation.attachmentId,
        ...replayMeta,
      },
      { requestBody },
    );
  }

  if (hasCore || unitRefChanging || hasScope || hasRemove || hasAdd) {
    voidLogFieldActivity(
      projectId,
      { user: effective.user },
      {
        eventType: "OBSERVATION_UPDATED",
        observationId: obsId,
        title: titleStr,
        unitRef,
        ...replayMeta,
      },
      { requestBody, attachmentIds: addedAttachmentIds },
    );
  }

  return NextResponse.json({
    ...serializeObservationRow(updated),
    attachments: mapMediaAttachmentsForApi(heads),
  });
}

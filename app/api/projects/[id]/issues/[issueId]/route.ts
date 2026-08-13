import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getEffectiveSession, activityLogActorId, productionGuardSession, writeAuthorizationRole } from "@/lib/masquerade";
import { getSession } from "@/lib/dev-session";
import {
  enforceProductionFieldNotesMutation,
  enforceProjectReadVisibility,
} from "@/lib/production-project-access";
import { getActivityReplayMetadata, logActivity, resolveActorName } from "@/lib/activity-logger";
import { voidLogFieldActivity } from "@/lib/activity/log-field-activity";
import { filterObservationAttachmentHeads, isObservationAttachmentHead } from "@/lib/observation-attachments";
import { parseImageAnnotation } from "@/lib/image-annotation-schema";
import { scopeRefKeysFromRowIds } from "@/lib/field-notes/scope-ref-keys";
import { normalizeFieldNotesUnitRef } from "@/lib/field-notes-location-ref";
import { scopeRowsMatchUnitRef } from "@/lib/field-notes/validate-scope-for-unit-ref";
import { isCustomSiteUnitRef } from "@/lib/custom-site-locations";
import { isFieldLeadershipRole } from "@/lib/permissions";
import {
  assertActiveIssueTypeCode,
  assertActivePartyCodes,
  catalogValidationStatus,
  IssueCatalogValidationError,
} from "@/lib/issues/issue-catalog";
import {
  MAX_RESPONSIBLE_PARTIES_PER_ISSUE,
  resolveResponsiblePartiesInput,
} from "@/lib/issues/responsible-parties";
import { serializeIssueForApiClient } from "@/lib/issues/issue-api";
import { promoteUploadCaptureContextsForStorageKeys } from "@/lib/field-media/promote-upload-capture-context";
import { captureContextInclude } from "@/lib/media/serialize-capture-context";
import { mapMediaAttachmentsForApi } from "@/lib/media/map-attachment-for-api";

const PatchIssueSchema = z.object({
  shortDescription: z.string().min(1).max(500).optional(),
  notes: z.string().max(5000).nullable().optional(),
  issueType: z.string().min(1).optional(),
  /** @deprecated Prefer responsibleParties — kept for legacy clients */
  responsibleParty: z.string().min(1).optional(),
  responsibleParties: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_RESPONSIBLE_PARTIES_PER_ISSUE)
    .optional(),
  isBlockingWork: z.boolean().optional(),
  unitRef: z.string().nullable().optional(),
  scopeTagIds: z.array(z.string()).max(20).optional(),
  removeAttachmentIds: z.array(z.string()).max(50).optional(),
  addAttachmentKeys: z.array(z.string()).max(20).optional(),
  addAttachmentUrls: z.array(z.string()).max(20).optional(),
  addAttachmentMimeTypes: z.array(z.string()).max(20).optional(),
  addAttachmentFileSizeBytes: z.array(z.number().int().nonnegative()).max(20).optional(),
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

const issueDetailInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  resolvedBy: { select: { id: true, name: true, email: true } },
  attachments: { include: attachmentUploaderInclude },
  scopeTags: { include: { row: { select: { id: true, scopeType: { select: { name: true } } } } } },
  subScopeTags: {
    include: {
      subScopeInstance: {
        include: {
          subScope: { select: { name: true } },
          row: { select: { id: true, scopeType: { select: { name: true } } } },
        },
      },
    },
  },
  responsiblePartyTags: { select: { partyCode: true }, orderBy: { id: "asc" } },
  _count: { select: { comments: true } },
  comments: {
    include: {
      author: { select: { id: true, name: true, email: true } },
      attachments: { include: captureContextInclude },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

type Params = { params: Promise<{ id: string; issueId: string }> };

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

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, issueId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const issue = await db.projectIssue.findFirst({
    where: { id: issueId, projectId },
    include: issueDetailInclude,
  });

  if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bulkGroupCount = issue.bulkGroupId
    ? await db.projectIssue.count({ where: { bulkGroupId: issue.bulkGroupId, projectId, status: "OPEN" } })
    : null;

  const heads = filterObservationAttachmentHeads(issue.attachments);

  const serialized = serializeIssueForApiClient({
    ...issue,
    attachments: mapMediaAttachmentsForApi(heads),
    comments: issue.comments.map((c) => ({
      ...c,
      attachments: mapMediaAttachmentsForApi(c.attachments),
    })),
    bulkGroupCount,
  });

  return NextResponse.json(serialized);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, issueId } = await params;

  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    session,
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  const issue = await db.projectIssue.findFirst({ where: { id: issueId, projectId } });
  if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isCreator = issue.createdById === effective.user.id;
  // INSTALL_MANAGER is an operational role with full ownership of installation issues.
  // They must be able to edit any issue on their project (not just ones they created)
  // so they can manage field work, update details, and upload/view photos on all issues.
  const isPrivileged = ["ADMIN", "DEVELOPER", "DESIGNER", "INSTALL_MANAGER", "INSTALL_DIRECTOR"].includes(effective.user.role ?? "");
  if (!isCreator && !isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const {
    unitRef: unitRefPatch,
    scopeTagIds,
    removeAttachmentIds,
    addAttachmentKeys,
    addAttachmentUrls,
    addAttachmentMimeTypes,
    addAttachmentFileSizeBytes,
    updateAttachmentAnnotation,
    responsibleParties: responsiblePartiesPatch,
    responsibleParty: legacyResponsiblePartyPatch,
    ...coreData
  } = parsed.data;

  const hasAttachmentChanges = (removeAttachmentIds?.length ?? 0) > 0 || (addAttachmentKeys?.length ?? 0) > 0;
  const hasAnnotationUpdate = Boolean(updateAttachmentAnnotation);

  let annotationSanitized = null as ReturnType<typeof parseImageAnnotation>;
  if (hasAnnotationUpdate && updateAttachmentAnnotation) {
    annotationSanitized = parseImageAnnotation(updateAttachmentAnnotation.imageAnnotation);
    if (!annotationSanitized) {
      return NextResponse.json({ error: "Invalid annotation payload" }, { status: 422 });
    }
  }

  if (removeAttachmentIds?.length) {
    for (const aid of removeAttachmentIds) {
      const row = await db.mediaAttachment.findFirst({
        where: { id: aid, issueId },
      });
      if (!row) {
        return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
      }
      const child = await db.mediaAttachment.findFirst({ where: { supersedesId: aid } });
      if (child) {
        return NextResponse.json(
          { error: "Remove the current version only; older versions are under the latest image." },
          { status: 409 },
        );
      }
    }
  }

  if (hasAnnotationUpdate && updateAttachmentAnnotation) {
    const allForIssue = await db.mediaAttachment.findMany({
      where: { issueId },
      select: { id: true, supersedesId: true, mimeType: true },
    });
    const row = allForIssue.find((a) => a.id === updateAttachmentAnnotation.attachmentId);
    if (!row) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }
    if (!row.mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "Annotation only applies to images" }, { status: 422 });
    }
    if (!isObservationAttachmentHead(updateAttachmentAnnotation.attachmentId, allForIssue)) {
      return NextResponse.json(
        { error: "Can only edit markup on the current image version" },
        { status: 409 },
      );
    }
  }

  let resolvedUserId: string | null = null;
  if (hasAnnotationUpdate) {
    try {
      resolvedUserId = await resolveMutationUserId(effective.user.id);
    } catch (e) {
      if ((e as Error).message === "NO_USERS") {
        return NextResponse.json({ error: "No users found in database" }, { status: 500 });
      }
      throw e;
    }
  }

  if (unitRefPatch !== undefined && !isCreator) {
    return NextResponse.json({ error: "Only the creator can change issue location" }, { status: 403 });
  }

  let unitRefChanging = unitRefPatch !== undefined;
  if (unitRefPatch !== undefined && isCustomSiteUnitRef(issue.unitRef)) {
    const normalizedPatch = normalizeFieldNotesUnitRef(unitRefPatch);
    if (normalizedPatch !== issue.unitRef) {
      return NextResponse.json(
        { error: "Custom site location cannot be changed here" },
        { status: 422 },
      );
    }
    unitRefChanging = false;
  }

  const hasUnitRef = unitRefChanging;
  const resolvedUnitRef = hasUnitRef ? normalizeFieldNotesUnitRef(unitRefPatch) : issue.unitRef;
  const effectiveScopeTagIds = scopeTagIds !== undefined
    ? scopeTagIds
    : hasUnitRef
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

  let issueTypeCode: string | undefined;
  let partyCodes: string[] | undefined;
  try {
    if (coreData.issueType !== undefined) {
      const row = await assertActiveIssueTypeCode(coreData.issueType);
      issueTypeCode = row.code;
    }
    if (responsiblePartiesPatch !== undefined || legacyResponsiblePartyPatch !== undefined) {
      const input = resolveResponsiblePartiesInput({
        responsibleParties: responsiblePartiesPatch,
        responsibleParty: legacyResponsiblePartyPatch ?? issue.responsiblePartyCode,
      });
      partyCodes = await assertActivePartyCodes(input);
    }
  } catch (err) {
    if (err instanceof IssueCatalogValidationError) {
      return NextResponse.json({ error: err.message }, { status: catalogValidationStatus(err) });
    }
    if (err instanceof Error && err.message.includes("At least one responsible party")) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  const hasIssuePatch =
    hasAttachmentChanges ||
    scopeTagIds !== undefined ||
    hasUnitRef ||
    coreData.shortDescription !== undefined ||
    coreData.notes !== undefined ||
    coreData.issueType !== undefined ||
    partyCodes !== undefined ||
    coreData.isBlockingWork !== undefined;

  if (!hasIssuePatch && !hasAnnotationUpdate) {
    return NextResponse.json({ error: "No changes" }, { status: 422 });
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  if (hasAnnotationUpdate && updateAttachmentAnnotation && annotationSanitized && resolvedUserId) {
    ops.push(
      db.mediaAttachment.update({
        where: { id: updateAttachmentAnnotation.attachmentId, issueId },
        data: {
          imageAnnotation: annotationSanitized as unknown as Prisma.InputJsonValue,
          lastMarkedById: resolvedUserId,
          lastMarkedAt: new Date(),
        },
      }),
    );
  }

  if (hasIssuePatch) {
    let scopeRefKeysUpdate: string[] | undefined;
    if (effectiveScopeTagIds !== undefined) {
      try {
        scopeRefKeysUpdate = await scopeRefKeysFromRowIds(db, projectId, effectiveScopeTagIds);
      } catch {
        return NextResponse.json({ error: "One or more project rows not found" }, { status: 404 });
      }
    }

    ops.push(
      db.projectIssue.update({
        where: { id: issueId },
        data: {
          ...(coreData.shortDescription !== undefined
            ? { shortDescription: coreData.shortDescription }
            : {}),
          ...(coreData.notes !== undefined ? { notes: coreData.notes } : {}),
          ...(coreData.isBlockingWork !== undefined
            ? { isBlockingWork: coreData.isBlockingWork }
            : {}),
          ...(issueTypeCode !== undefined ? { issueTypeCode } : {}),
          ...(partyCodes !== undefined ? { responsiblePartyCode: partyCodes[0]! } : {}),
          ...(hasUnitRef ? { unitRef: resolvedUnitRef } : {}),
          ...(scopeRefKeysUpdate !== undefined ? { scopeRefKeys: scopeRefKeysUpdate } : {}),
          ...(effectiveScopeTagIds !== undefined
            ? {
                scopeTags: {
                  deleteMany: {},
                  create: effectiveScopeTagIds.map((rowId) => ({ projectRowId: rowId })),
                },
              }
            : {}),
          ...(hasAttachmentChanges
            ? {
                attachments: {
                  ...(removeAttachmentIds?.length
                    ? { deleteMany: { id: { in: removeAttachmentIds } } }
                    : {}),
                  ...(addAttachmentKeys?.length
                    ? {
                        create: addAttachmentKeys.map((key, i) => ({
                          storageKey: key,
                          storageUrl: addAttachmentUrls?.[i] ?? key,
                          mimeType: addAttachmentMimeTypes?.[i] ?? "application/octet-stream",
                          fileSizeBytes: addAttachmentFileSizeBytes?.[i] ?? 0,
                          uploadedById: effective.user.id,
                        })),
                      }
                    : {}),
                },
              }
            : {}),
        },
      }),
    );

    if (partyCodes !== undefined) {
      ops.push(db.issueResponsiblePartyTag.deleteMany({ where: { issueId } }));
      if (partyCodes.length > 0) {
        ops.push(
          db.issueResponsiblePartyTag.createMany({
            data: partyCodes.map((partyCode) => ({ issueId, partyCode })),
          }),
        );
      }
    }
  }

  if (ops.length > 0) {
    try {
      await db.$transaction(ops);
    } catch (err) {
      console.error("[issues PATCH] Prisma error:", err);
      return NextResponse.json({ error: "Failed to update issue" }, { status: 500 });
    }
  }

  if (addAttachmentKeys?.length) {
    const newAttachments = await db.mediaAttachment.findMany({
      where: { issueId, storageKey: { in: addAttachmentKeys } },
      select: { id: true, storageKey: true },
    });
    await promoteUploadCaptureContextsForStorageKeys(newAttachments);
  }

  const updated = await db.projectIssue.findFirst({
    where: { id: issueId, projectId },
    include: issueDetailInclude,
  });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const heads = filterObservationAttachmentHeads(updated.attachments);

  const requestBody =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const addedAttachmentIds =
    addAttachmentKeys && addAttachmentKeys.length > 0
      ? (
          await db.mediaAttachment.findMany({
            where: { issueId, storageKey: { in: addAttachmentKeys } },
            select: { id: true },
          })
        ).map((a) => a.id)
      : [];

  if (hasAnnotationUpdate && updateAttachmentAnnotation && resolvedUserId) {
    voidLogFieldActivity(
      projectId,
      { user: effective.user },
      {
        eventType: "ISSUE_ANNOTATION_UPDATED",
        issueId,
        shortDescription: updated.shortDescription,
        unitRef: updated.unitRef ?? null,
        attachmentId: updateAttachmentAnnotation.attachmentId,
      },
      { requestBody },
    );
  }

  if (hasIssuePatch) {
    const changedFields = [
      ...Object.keys(coreData).filter((key) => coreData[key as keyof typeof coreData] !== undefined),
      ...(partyCodes !== undefined ? ["responsibleParties"] : []),
      ...(scopeTagIds !== undefined || hasUnitRef ? ["scopeTags"] : []),
      ...(hasUnitRef ? ["unitRef"] : []),
      ...(hasAttachmentChanges ? ["attachments"] : []),
    ];
    voidLogFieldActivity(
      projectId,
      { user: effective.user },
      {
        eventType: "ISSUE_UPDATED",
        issueId,
        shortDescription: updated.shortDescription,
        unitRef: updated.unitRef ?? null,
        changedFields,
        ...getActivityReplayMetadata(req.headers),
      },
      { requestBody, attachmentIds: addedAttachmentIds },
    );
  }

  return NextResponse.json(
    serializeIssueForApiClient({
      ...updated,
      attachments: mapMediaAttachmentsForApi(heads),
    }),
  );
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFieldLeadershipRole(writeAuthorizationRole(effective))) {
    return NextResponse.json({ error: "Forbidden — field leadership only" }, { status: 403 });
  }

  const { id: projectId, issueId } = await params;
  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    productionGuardSession(effective),
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  const issue = await db.projectIssue.findFirst({
    where: { id: issueId, projectId },
    select: { id: true, shortDescription: true, unitRef: true },
  });
  if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.projectIssue.delete({ where: { id: issueId } });

  void (async () => {
    const actorId = activityLogActorId(effective);
    const userName = await resolveActorName(actorId);
    void logActivity(projectId, actorId, userName, {
      eventType: "ISSUE_DELETED",
      issueId,
      shortDescription: issue.shortDescription,
      unitRef: issue.unitRef ?? null,
    });
  })();

  return NextResponse.json({ deleted: true });
}

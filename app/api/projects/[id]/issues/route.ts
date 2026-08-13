import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  enforceProductionFieldNotesMutation,
  enforceProjectReadVisibility,
} from "@/lib/production-project-access";
import { extractMentionIds } from "@/lib/mention-utils";
import { sendMentionEmail } from "@/lib/email";
import { getActivityReplayMetadata } from "@/lib/activity-logger";
import { voidLogFieldActivity } from "@/lib/activity/log-field-activity";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import { attachmentFileSizeBytesSchema } from "@/lib/media-attachment-schemas";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
import {
  capMentionIdsForBroadcast,
  logMentionEmailActorThrottled,
  tryRecordMentionEmailBatch,
} from "@/lib/email-outbound-rate-limit";
import { parseImageAnnotation } from "@/lib/image-annotation-schema";
import { scopeRefKeysFromRowIds } from "@/lib/field-notes/scope-ref-keys";
import {
  loadLocationBuilderTagOptions,
  normalizeLocationBuilderTagInput,
  validateLocationBuilderTags,
} from "@/lib/field-notes/location-builder-tags";
import { isProjectLevelUnitRef, PROJECT_LEVEL_UNIT_REF_OR } from "@/lib/field-notes-scope";
import { parseListLimit } from "@/lib/parse-list-limit";
import {
  assertActiveIssueTypeCode,
  assertActivePartyCodes,
  catalogValidationStatus,
  IssueCatalogValidationError,
} from "@/lib/issues/issue-catalog";
import {
  MAX_RESPONSIBLE_PARTIES_PER_ISSUE,
  resolveResponsiblePartiesInput,
  syncIssueResponsiblePartyTags,
} from "@/lib/issues/responsible-parties";
import { serializeIssuesForApiClient, serializeIssueForApiClient } from "@/lib/issues/issue-api";
import { promoteUploadCaptureContextsFromAttachments } from "@/lib/field-media/promote-upload-capture-context";
import { serializeIssueResponsibleParties } from "@/lib/issues/serialize-issue-parties";
import {
  missingMaterialsPayloadSchema,
  validateMissingMaterialsForIssueType,
} from "@/lib/issues/missing-materials";

const CreateIssueSchema = z
  .object({
    unitRef: z.string().optional(),
    projectRowIds: z.array(z.string()).max(20).default([]),
    subScopeInstanceIds: z.array(z.string()).max(50).default([]),
    shortDescription: z.string().min(1).max(50),
    notes: z.string().max(2000).optional(),
    issueType: z.string().min(1),
    /** @deprecated Prefer responsibleParties — kept for legacy clients */
    responsibleParty: z.string().min(1).optional(),
    responsibleParties: z
      .array(z.string().min(1))
      .min(1)
      .max(MAX_RESPONSIBLE_PARTIES_PER_ISSUE)
      .optional(),
    isBlockingWork: z.boolean().default(false),
  attachmentKeys: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentUrls: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentMimeTypes: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  attachmentFileSizeBytes: attachmentFileSizeBytesSchema,
  attachmentCaptions: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  /** Layered annotation payload per attachment. Null entries mean no annotation. */
  attachmentImageAnnotations: z.array(z.unknown()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).default([]),
  buildPhaseTag: z.string().max(100).optional(),
  areaTag: z.string().max(100).optional(),
  })
  .merge(missingMaterialsPayloadSchema)
  .refine(
    (data) =>
      data.responsibleParty != null ||
      (data.responsibleParties != null && data.responsibleParties.length > 0),
    { message: "At least one responsible party is required", path: ["responsibleParties"] },
  )
  .superRefine((data, ctx) => {
    const error = validateMissingMaterialsForIssueType(data.issueType, {
      missingMaterialDescription: data.missingMaterialDescription,
      missingMaterialQuantity: data.missingMaterialQuantity,
    });
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error, path: ["missingMaterialDescription"] });
    }
  });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const { searchParams } = new URL(req.url);

  const statusFilter = searchParams.get("status");
  const typeFilter = searchParams.get("type");
  const responsiblePartyFilter = searchParams.get("responsibleParty");
  const unitRefFilter = searchParams.get("unitRef");
  const projectRowIdFilter = searchParams.get("projectRowId");
  const isBlockingWorkFilter = searchParams.get("isBlockingWork");
  const projectLevel = searchParams.get("projectLevel") === "true";
  const limit = parseListLimit(searchParams.get("limit"));

  const where = {
    projectId,
    ...(statusFilter === "open" ? { status: "OPEN" as const } : {}),
    ...(statusFilter === "resolved" ? { status: "RESOLVED" as const } : {}),
    ...(typeFilter ? { issueTypeCode: typeFilter } : {}),
    ...(responsiblePartyFilter
      ? {
          OR: [
            { responsiblePartyCode: responsiblePartyFilter },
            { responsiblePartyTags: { some: { partyCode: responsiblePartyFilter } } },
          ],
        }
      : {}),
    ...(projectLevel ? { OR: [...PROJECT_LEVEL_UNIT_REF_OR] } : {}),
    ...(unitRefFilter && !projectLevel ? { unitRef: unitRefFilter } : {}),
    ...(projectRowIdFilter
      ? { scopeTags: { some: { projectRowId: projectRowIdFilter } } }
      : {}),
    ...(isBlockingWorkFilter === "true" ? { isBlockingWork: true } : {}),
    ...(isBlockingWorkFilter === "false" ? { isBlockingWork: false } : {}),
  };

  const issueInclude = {
    createdBy: { select: { id: true, name: true, email: true } },
    resolvedBy: { select: { id: true, name: true, email: true } },
    attachments: true,
    scopeTags: {
      include: { row: { select: { id: true, building: true, level: true, unit: true, scopeTypeId: true, scopeType: { select: { name: true } } } } },
    },
    subScopeTags: {
      include: {
        subScopeInstance: {
          include: {
            subScope: { select: { id: true, name: true } },
            row: { select: { id: true, scopeType: { select: { name: true } } } },
          },
        },
      },
    },
    responsiblePartyTags: { select: { partyCode: true }, orderBy: { id: "asc" } },
    _count: { select: { comments: true } },
  } as const;

  let issues;
  let totalCount: number | undefined;
  try {
    if (limit !== undefined) {
      const [rows, count] = await Promise.all([
        db.projectIssue.findMany({
          where,
          include: issueInclude,
          orderBy: { createdAt: "desc" },
          take: limit,
        }),
        db.projectIssue.count({ where }),
      ]);
      issues = rows;
      totalCount = count;
    } else {
      issues = await db.projectIssue.findMany({
        where,
        include: issueInclude,
        orderBy: { createdAt: "desc" },
      });
    }
  } catch (err) {
    console.error("[issues GET] Prisma error:", err);
    return NextResponse.json({ error: "Failed to fetch issues" }, { status: 500 });
  }

  // Attach bulkGroupCount to each issue so the modal can show the group-resolve option.
  // One groupBy query instead of N+1 — only runs when there are bulk-group issues.
  const bulkGroupIds = [...new Set(issues.map((i) => i.bulkGroupId).filter((id): id is string => id !== null))];
  const bulkGroupCounts: Record<string, number> = {};
  if (bulkGroupIds.length > 0) {
    // Count only OPEN siblings — already-resolved units shouldn't inflate the number shown to the user.
    const counts = await db.projectIssue.groupBy({
      by: ["bulkGroupId"],
      where: { bulkGroupId: { in: bulkGroupIds }, projectId, status: "OPEN" },
      _count: { id: true },
    });
    for (const row of counts) {
      if (row.bulkGroupId) bulkGroupCounts[row.bulkGroupId] = row._count.id;
    }
  }

  const issuesWithCount = serializeIssuesForApiClient(
    issues.map((i) => ({
      ...i,
      bulkGroupCount: i.bulkGroupId ? (bulkGroupCounts[i.bulkGroupId] ?? null) : null,
    })),
  );

  return NextResponse.json({
    issues: issuesWithCount,
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
  const parsed = CreateIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const {
    unitRef,
    projectRowIds,
    subScopeInstanceIds,
    shortDescription,
    notes,
    issueType,
    responsibleParty: legacyResponsibleParty,
    responsibleParties: responsiblePartiesInput,
    isBlockingWork,
    attachmentKeys,
    attachmentUrls,
    attachmentMimeTypes,
    attachmentFileSizeBytes,
    attachmentCaptions,
    attachmentImageAnnotations,
    buildPhaseTag,
    areaTag,
    missingMaterialDescription,
    missingMaterialQuantity,
    missingMaterialUomCode,
  } = parsed.data;

  if (issueType === "MISSING_MATERIALS" && projectRowIds.length > 1) {
    return NextResponse.json(
      { error: "Missing Materials issues can only tag one scope per report" },
      { status: 422 },
    );
  }

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
  let scopeRowsForUom: Array<{ id: string; uom: { code: string } | null }> = [];
  if (projectRowIds.length > 0) {
    const rows = await db.projectRow.findMany({
      where: { id: { in: projectRowIds }, projectId },
      select: { id: true, uom: { select: { code: true } } },
    });
    if (rows.length !== projectRowIds.length) {
      return NextResponse.json({ error: "One or more project rows not found" }, { status: 404 });
    }
    scopeRowsForUom = rows;
  }

  // Validate any sub-scope instances belong to this project (via their parent row)
  if (subScopeInstanceIds.length > 0) {
    const instances = await db.projectSubScopeInstance.findMany({
      where: { id: { in: subScopeInstanceIds }, row: { projectId } },
      select: { id: true },
    });
    if (instances.length !== subScopeInstanceIds.length) {
      return NextResponse.json({ error: "One or more sub-scope instances not found" }, { status: 404 });
    }
  }

  let partyCodesInput: string[];
  try {
    partyCodesInput = resolveResponsiblePartiesInput({
      responsibleParties: responsiblePartiesInput,
      responsibleParty: legacyResponsibleParty,
    });
  } catch {
    return NextResponse.json(
      { error: "At least one responsible party is required" },
      { status: 422 },
    );
  }

  let issueTypeRow: { code: string; requiresVisual: boolean };
  let partyCodes: string[];
  try {
    issueTypeRow = await assertActiveIssueTypeCode(issueType);
    partyCodes = await assertActivePartyCodes(partyCodesInput);
  } catch (err) {
    if (err instanceof IssueCatalogValidationError) {
      return NextResponse.json({ error: err.message }, { status: catalogValidationStatus(err) });
    }
    throw err;
  }

  // Enforce visual evidence requirement from catalog
  if (issueTypeRow.requiresVisual) {
    const hasVisual = attachmentMimeTypes.some(
      (m) => m.startsWith("image/") || m.startsWith("video/"),
    );
    if (!hasVisual) {
      return NextResponse.json(
        { error: `Issue type ${issueType} requires at least one photo or video attachment.` },
        { status: 422 },
      );
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

  const resolvedMissingMaterialUomCode =
    issueTypeRow.code === "MISSING_MATERIALS"
      ? (
          missingMaterialUomCode?.trim()
          || scopeRowsForUom.find((row) => row.uom?.code)?.uom?.code
          || null
        )
      : null;

  try {
    const issue = await db.$transaction(async (tx) => {
      const created = await tx.projectIssue.create({
        data: {
          projectId,
          unitRef: unitRef ?? undefined,
          scopeRefKeys,
          shortDescription,
          notes: notes ?? null,
          issueTypeCode: issueTypeRow.code,
          responsiblePartyCode: partyCodes[0]!,
          isBlockingWork,
          createdById: resolvedUserId,
          missingMaterialDescription:
            issueTypeRow.code === "MISSING_MATERIALS" ? missingMaterialDescription?.trim() ?? null : null,
          missingMaterialQuantity:
            issueTypeRow.code === "MISSING_MATERIALS" ? missingMaterialQuantity ?? null : null,
          missingMaterialUomCode: resolvedMissingMaterialUomCode,
          buildPhaseTag: isProjectLevelUnitRef(normalizedUnitRef)
            ? normalizedTags.buildPhaseTag
            : null,
          areaTag: isProjectLevelUnitRef(normalizedUnitRef) ? normalizedTags.areaTag : null,
          scopeTags: projectRowIds.length > 0
            ? { create: projectRowIds.map((rowId) => ({ projectRowId: rowId, id: `${Date.now()}-${rowId}` })) }
            : undefined,
          subScopeTags: subScopeInstanceIds.length > 0
            ? { create: subScopeInstanceIds.map((ssId) => ({ subScopeInstanceId: ssId, id: `${Date.now()}-${ssId}` })) }
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
          attachments: true,
          createdBy: { select: { id: true, name: true, email: true } },
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
        },
      });
      await syncIssueResponsiblePartyTags(tx, created.id, partyCodes);
      if (created.attachments.length > 0) {
        await promoteUploadCaptureContextsFromAttachments(tx, created.attachments);
      }
      // Tags are written after create include — attach for accurate API serialization.
      return {
        ...created,
        responsiblePartyTags: partyCodes.map((partyCode) => ({ partyCode })),
      };
    });
    // Fire mention notifications for notes field (non-blocking)
    if (notes) {
      void (async () => {
        try {
          const mentionedIds = capMentionIdsForBroadcast(
            extractMentionIds(notes).filter((uid) => uid !== resolvedUserId),
            {
              source: "issue_notes",
              actorUserId: resolvedUserId,
              projectId,
              issueId: issue.id,
            }
          );
          if (mentionedIds.length === 0) return;

          const actorUser = await db.user.findUnique({
            where: { id: resolvedUserId },
            select: { name: true, email: true },
          });
          const actorName = actorUser?.name ?? actorUser?.email ?? "Someone";

          const mentionedUsers = await db.user.findMany({
            where: { id: { in: mentionedIds } },
            select: { id: true, name: true, email: true },
          });
          if (mentionedUsers.length === 0) return;

          const mentionRl = tryRecordMentionEmailBatch(resolvedUserId, mentionedUsers.length);
          if (!mentionRl.ok) {
            logMentionEmailActorThrottled("issue_notes", {
              actorUserId: resolvedUserId,
              denied: mentionRl,
              projectId,
              issueId: issue.id,
            });
            return;
          }

          await db.notification.createMany({
            data: mentionedUsers.map((u) => ({
              userId: u.id,
              type: "MENTIONED_IN_ISSUE_NOTES" as const,
              actorId: resolvedUserId,
              actorName,
              projectId,
              issueId: issue.id,
            })),
            skipDuplicates: true,
          });

          const APP_URL = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3002").replace(/\/$/, "");
          for (const u of mentionedUsers) {
            void sendMentionEmail({
              to: u.email,
              actorName,
              contextType: "issue_notes",
              contextTitle: notes.slice(0, 120),
              projectUrl: `${APP_URL}/en/projects/${projectId}/issues-log?openIssue=${issue.id}`,
            }).catch((err) => console.warn("[mention-email]", err));
          }
        } catch (err) {
          console.warn("[mention-notify issue notes]", err);
        }
      })();
    }

    voidLogFieldActivity(
      projectId,
      { user: effective.user },
      {
        eventType: "ISSUE_CREATED",
        issueId: issue.id,
        shortDescription,
        issueType: issueTypeRow.code,
        unitRef: unitRef ?? null,
        isBlockingWork,
        ...getActivityReplayMetadata(req.headers),
      },
      {
        requestBody: typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null,
        attachmentIds: issue.attachments.map((a) => a.id),
      },
    );

    return NextResponse.json(serializeIssueForApiClient(issue), { status: 201 });
  } catch (err) {
    console.error("[issues POST] Prisma error:", err);
    return NextResponse.json({ error: "Failed to create issue" }, { status: 500 });
  }
}

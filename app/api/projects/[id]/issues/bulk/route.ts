import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProductionFieldNotesMutation } from "@/lib/production-project-access";
import { logActivity, resolveActorName } from "@/lib/activity-logger";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
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
import { promoteUploadCaptureContextsForStorageKeys } from "@/lib/field-media/promote-upload-capture-context";

const BulkIssueUnitSchema = z.object({
  unitRef: z.string().min(1),
  /** IDs of ProjectRow records to tag on the issue for this unit. */
  scopeRowIds: z.array(z.string()).default([]),
});

const BulkIssueSchema = z
  .object({
    units: z.array(BulkIssueUnitSchema).min(1).max(200),
    shortDescription: z.string().min(1).max(50),
    notes: z.string().max(2000).optional(),
    issueType: z.string().min(1),
    responsibleParty: z.string().min(1).optional(),
    responsibleParties: z
      .array(z.string().min(1))
      .min(1)
      .max(MAX_RESPONSIBLE_PARTIES_PER_ISSUE)
      .optional(),
    isBlockingWork: z.boolean().default(false),
    // Media — uploaded once, linked to every issue created
    attachmentKeys: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).optional().default([]),
    attachmentUrls: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).optional().default([]),
    attachmentMimeTypes: z.array(z.string()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).optional().default([]),
    attachmentFileSizeBytes: z.array(z.number().int().nonnegative()).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).optional().default([]),
    attachmentCaptions: z.array(z.string().max(500)).max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY).optional().default([]),
  })
  .refine(
    (data) =>
      data.responsibleParty != null ||
      (data.responsibleParties != null && data.responsibleParties.length > 0),
    { message: "At least one responsible party is required", path: ["responsibleParties"] },
  );

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
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
  const parsed = BulkIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const {
    units,
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
  } = parsed.data;

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

  let issueTypeRow: { code: string };
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

  // Build attachment descriptors (zip the parallel arrays)
  const attachments = attachmentKeys.map((key, i) => ({
    storageKey: key,
    storageUrl: attachmentUrls[i] ?? "",
    mimeType: attachmentMimeTypes[i] ?? "application/octet-stream",
    fileSizeBytes: attachmentFileSizeBytes[i] ?? null,
    caption: attachmentCaptions[i] ?? "",
  }));

  const resolvedUserId = await resolveSessionToDbUserId(effective.user);
  if (!resolvedUserId) {
    return NextResponse.json({ error: "No users found in database" }, { status: 500 });
  }

  // Validate all referenced scope row IDs belong to this project
  const allScopeRowIds = [...new Set(units.flatMap((u) => u.scopeRowIds))];
  if (allScopeRowIds.length > 0) {
    const rows = await db.projectRow.findMany({
      where: { id: { in: allScopeRowIds }, projectId },
      select: { id: true },
    });
    if (rows.length !== allScopeRowIds.length) {
      return NextResponse.json({ error: "One or more scope rows not found in this project" }, { status: 404 });
    }
  }

  const bulkGroupId = randomUUID();

  try {
    // Build the array-form transaction (Railway/PgBouncer compatible — no interactive transactions)
    const issueCreates = units.map((unit) =>
      db.projectIssue.create({
        data: {
          projectId,
          unitRef: unit.unitRef,
          shortDescription,
          notes: notes ?? null,
          issueTypeCode: issueTypeRow.code,
          responsiblePartyCode: partyCodes[0]!,
          isBlockingWork,
          bulkGroupId,
          createdById: resolvedUserId,
          responsiblePartyTags: {
            create: partyCodes.map((partyCode) => ({ partyCode })),
          },
          scopeTags: unit.scopeRowIds.length > 0
            ? { create: unit.scopeRowIds.map((rowId) => ({ projectRowId: rowId })) }
            : undefined,
        },
        select: { id: true },
      })
    );

    const created = await db.$transaction(issueCreates);

    // Create MediaAttachment records for each issue — each file is uploaded once
    // but every issue gets its own MediaAttachment row pointing to the same storageKey.
    if (attachments.length > 0) {
      const attachmentCreates = created.flatMap((issue) =>
        attachments.map((a) =>
          db.mediaAttachment.create({
            data: {
              issueId: issue.id,
              storageKey: a.storageKey,
              storageUrl: a.storageUrl,
              mimeType: a.mimeType,
              fileSizeBytes: a.fileSizeBytes,
              caption: a.caption || null,
              uploadedById: resolvedUserId,
            },
          })
        )
      );
      await db.$transaction(attachmentCreates);
      const storageKeys = attachments.map((a) => a.storageKey);
      const promoted = await db.mediaAttachment.findMany({
        where: { storageKey: { in: storageKeys }, issueId: { in: created.map((c) => c.id) } },
        select: { id: true, storageKey: true },
      });
      await promoteUploadCaptureContextsForStorageKeys(promoted);
    }

    console.log(`[issues/bulk POST] Created ${created.length} issues (bulkGroupId=${bulkGroupId}) in project ${projectId}${attachments.length > 0 ? `, ${attachments.length} attachment(s) per issue` : ""}`);

    void (async () => {
      const userName = await resolveActorName(resolvedUserId);
      void logActivity(projectId, resolvedUserId, userName, {
        eventType: "ISSUE_BULK_CREATED",
        bulkGroupId,
        count: created.length,
        shortDescription,
        issueType: issueTypeRow.code,
        isBlockingWork,
      });
    })();

    return NextResponse.json({ created: created.length, bulkGroupId }, { status: 201 });
  } catch (err) {
    console.error("[issues/bulk POST] Prisma error:", err);
    return NextResponse.json({ error: "Failed to create bulk issues" }, { status: 500 });
  }
}

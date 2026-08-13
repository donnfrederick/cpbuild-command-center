import type { PrismaClient, MediaCaptureContext } from "@prisma/client";
import { filterObservationAttachmentHeads } from "@/lib/observation-attachments";
import type { AlbumItem, AlbumItemSource, AlbumSourceType } from "@/lib/media/album-types";
import {
  captureContextInclude,
  serializeCaptureContext,
  type SerializedCaptureContext,
} from "@/lib/media/serialize-capture-context";
import {
  buildScopeRefKeyToCodeMap,
  parseScopeCodesFromStatusUpdateLabel,
  scopeCodesFromRefKeys,
} from "@/lib/media/album-scope-tags";
import {
  extractCapturedMedia,
  isVisualMedia,
  visualMimeType,
} from "@/lib/media/album-visual";

const VALID_POST_SOURCE_TYPES = ["general", "status_update"] as const;

function optionalScopeCodes(codes: string[]): string[] | undefined {
  return codes.length > 0 ? codes : undefined;
}

/** MediaAttachment rows — may include optional 1:1 captureContext. */
const mediaAttachmentAlbumSelect = {
  id: true,
  storageUrl: true,
  mimeType: true,
  fileSizeBytes: true,
  caption: true,
  createdAt: true,
  ...captureContextInclude,
} as const;

/** InspectionDeficiencyMedia has no captureContext relation — do not reuse mediaAttachmentAlbumSelect. */
const inspectionDeficiencyMediaSelect = {
  id: true,
  storageUrl: true,
  mimeType: true,
  fileSizeBytes: true,
  caption: true,
  createdAt: true,
} as const;

type AlbumAttachmentRow = {
  id: string;
  storageUrl: string;
  mimeType: string;
  fileSizeBytes: number | null;
  caption: string | null;
  createdAt: Date;
  captureContext?: MediaCaptureContext | null;
  supersedesId?: string | null;
};

function captureContextForAlbum(
  attachment: { captureContext?: MediaCaptureContext | null },
): SerializedCaptureContext | undefined {
  return attachment.captureContext
    ? serializeCaptureContext(attachment.captureContext)
    : undefined;
}

function albumItemFromAttachment(
  attachment: AlbumAttachmentRow,
  source: AlbumItemSource,
): AlbumItem {
  return {
    id: attachment.id,
    storageUrl: attachment.storageUrl,
    mimeType: attachment.mimeType,
    fileSizeBytes: attachment.fileSizeBytes,
    caption: attachment.caption,
    createdAt: attachment.createdAt.toISOString(),
    source,
    captureContext: captureContextForAlbum(attachment),
  };
}

type DbClient = Pick<
  PrismaClient,
  | "projectObservation"
  | "observationComment"
  | "projectIssue"
  | "issueComment"
  | "mediaAttachment"
  | "projectRow"
  | "inspectionSubmission"
>;

/** Aggregates all visual album items for a single location (unitRef). */
export async function fetchAlbumItemsForUnitRef(
  db: DbClient,
  projectId: string,
  unitRef: string,
): Promise<AlbumItem[]> {
  const items: AlbumItem[] = [];
  const allScopeRefKeys: string[] = [];
  const observationScopeRefKeys = new Map<string, string[]>();
  const issueScopeRefKeys = new Map<string, string[]>();

  const observations = await db.projectObservation.findMany({
    where: { projectId, unitRef },
    select: {
      id: true,
      title: true,
      scopeRefKeys: true,
      attachments: {
        select: {
          ...mediaAttachmentAlbumSelect,
          supersedesId: true,
        },
      },
    },
  });
  for (const obs of observations) {
    observationScopeRefKeys.set(obs.id, obs.scopeRefKeys ?? []);
    allScopeRefKeys.push(...(obs.scopeRefKeys ?? []));
    for (const a of filterObservationAttachmentHeads(obs.attachments)) {
      if (!isVisualMedia(a.mimeType)) continue;
      items.push(albumItemFromAttachment(a, {
        type: "observation",
        label: obs.title || null,
        entityId: obs.id,
      }));
    }
  }

  const obsCmts = await db.observationComment.findMany({
    where: { observation: { projectId, unitRef } },
    select: {
      id: true,
      observation: { select: { id: true, title: true, scopeRefKeys: true } },
      attachments: {
        select: mediaAttachmentAlbumSelect,
      },
    },
  });
  for (const cmt of obsCmts) {
    observationScopeRefKeys.set(cmt.observation.id, cmt.observation.scopeRefKeys ?? []);
    allScopeRefKeys.push(...(cmt.observation.scopeRefKeys ?? []));
    for (const a of cmt.attachments) {
      if (!isVisualMedia(a.mimeType)) continue;
      items.push(albumItemFromAttachment(a, {
        type: "observation_comment",
        label: cmt.observation.title || null,
        entityId: cmt.observation.id,
      }));
    }
  }

  const issues = await db.projectIssue.findMany({
    where: { projectId, unitRef },
    select: {
      id: true,
      shortDescription: true,
      scopeRefKeys: true,
      attachments: {
        select: mediaAttachmentAlbumSelect,
      },
    },
  });
  for (const issue of issues) {
    issueScopeRefKeys.set(issue.id, issue.scopeRefKeys ?? []);
    allScopeRefKeys.push(...(issue.scopeRefKeys ?? []));
    for (const a of issue.attachments) {
      if (!isVisualMedia(a.mimeType)) continue;
      items.push(albumItemFromAttachment(a, {
        type: "issue",
        label: issue.shortDescription || null,
        entityId: issue.id,
      }));
    }
  }

  const issCmts = await db.issueComment.findMany({
    where: { issue: { projectId, unitRef } },
    select: {
      id: true,
      issue: { select: { id: true, shortDescription: true, scopeRefKeys: true } },
      attachments: {
        select: mediaAttachmentAlbumSelect,
      },
    },
  });
  for (const cmt of issCmts) {
    issueScopeRefKeys.set(cmt.issue.id, cmt.issue.scopeRefKeys ?? []);
    allScopeRefKeys.push(...(cmt.issue.scopeRefKeys ?? []));
    for (const a of cmt.attachments) {
      if (!isVisualMedia(a.mimeType)) continue;
      items.push(albumItemFromAttachment(a, {
        type: "issue_comment",
        label: cmt.issue.shortDescription || null,
        entityId: cmt.issue.id,
      }));
    }
  }

  const standalone = await db.mediaAttachment.findMany({
    where: { unitPhotoProjectId: projectId, unitPhotoUnitRef: unitRef },
    select: {
      ...mediaAttachmentAlbumSelect,
      unitPhotoSourceType: true,
      unitPhotoSourceLabel: true,
    },
    orderBy: { createdAt: "desc" },
  });
  for (const a of standalone) {
    if (!isVisualMedia(a.mimeType)) continue;
    const srcType: AlbumSourceType = (VALID_POST_SOURCE_TYPES as readonly string[]).includes(
      a.unitPhotoSourceType ?? "",
    )
      ? (a.unitPhotoSourceType as AlbumSourceType)
      : "general";
    const statusCodes =
      srcType === "status_update"
        ? parseScopeCodesFromStatusUpdateLabel(a.unitPhotoSourceLabel)
        : [];
    items.push(albumItemFromAttachment(a, {
      type: srcType,
      label: a.unitPhotoSourceLabel ?? null,
      entityId: null,
      scopeCodes: optionalScopeCodes(statusCodes),
    }));
  }

  const [building, level, unit] = unitRef.split("|");
  if (building !== undefined && level !== undefined && unit !== undefined) {
    const locationRows = await db.projectRow.findMany({
      where: { projectId, building, level, unit },
      select: { id: true, scopeType: { select: { code: true } } },
    });
    const rowIds = locationRows.map((row) => row.id);
    const rowIdToCode = new Map<string, string>();
    for (const row of locationRows) {
      const code = row.scopeType?.code?.trim();
      if (code) rowIdToCode.set(row.id, code);
    }

    if (rowIds.length > 0) {
      const submissions = await db.inspectionSubmission.findMany({
        where: {
          projectId,
          OR: [{ unitId: { in: rowIds } }, { scopeRowId: { in: rowIds } }],
        },
        select: {
          id: true,
          scopeRowId: true,
          unitId: true,
          submittedAt: true,
          form: { select: { name: true } },
          answers: {
            select: {
              id: true,
              rawAnswer: true,
              formVersionQuestion: { select: { title: true } },
              deficiencies: {
                select: {
                  id: true,
                  description: true,
                  media: {
                    select: inspectionDeficiencyMediaSelect,
                  },
                },
              },
            },
          },
        },
      });

      for (const submission of submissions) {
        const scopeRowId = submission.scopeRowId ?? submission.unitId;
        const sourceLabel = submission.form?.name ?? "Inspection";
        const inspectionCodes =
          scopeRowId && rowIdToCode.has(scopeRowId) ? [rowIdToCode.get(scopeRowId)!] : [];

        for (const answer of submission.answers) {
          const questionLabel = answer.formVersionQuestion?.title ?? sourceLabel;
          extractCapturedMedia(answer.rawAnswer).forEach((media, index) => {
            items.push({
              id: `inspection-answer-${answer.id}-${index}`,
              storageUrl: media.storageUrl,
              mimeType: media.mimeType,
              fileSizeBytes: media.fileSizeBytes,
              caption: null,
              createdAt: submission.submittedAt.toISOString(),
              source: {
                type: "inspection",
                label: questionLabel,
                entityId: submission.id,
                scopeCodes: optionalScopeCodes(inspectionCodes),
              },
            });
          });

          for (const deficiency of answer.deficiencies) {
            for (const media of deficiency.media) {
              const mimeType = visualMimeType(media.mimeType, media.storageUrl);
              if (!mimeType) continue;
              items.push(albumItemFromAttachment(
                { ...media, mimeType, caption: media.caption },
                {
                  type: "inspection",
                  label: deficiency.description || questionLabel,
                  entityId: submission.id,
                  scopeCodes: optionalScopeCodes(inspectionCodes),
                },
              ));
            }
          }
        }
      }
    }
  }

  const refKeyMap = await buildScopeRefKeyToCodeMap(db as PrismaClient, projectId, allScopeRefKeys);

  for (const item of items) {
    if (item.source.scopeCodes?.length) continue;

    if (item.source.type === "observation" || item.source.type === "observation_comment") {
      const entityId = item.source.entityId;
      if (!entityId) continue;
      const refKeys = observationScopeRefKeys.get(entityId) ?? [];
      item.source.scopeCodes = optionalScopeCodes(scopeCodesFromRefKeys(refKeys, refKeyMap));
    } else if (item.source.type === "issue" || item.source.type === "issue_comment") {
      const entityId = item.source.entityId;
      if (!entityId) continue;
      const refKeys = issueScopeRefKeys.get(entityId) ?? [];
      item.source.scopeCodes = optionalScopeCodes(scopeCodesFromRefKeys(refKeys, refKeyMap));
    }
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items;
}

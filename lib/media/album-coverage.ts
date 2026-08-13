import type { PrismaClient } from "@prisma/client";
import type { AlbumSourceType } from "@/lib/media/album-types";
import { extractCapturedMedia, VISUAL_MIME_WHERE, visualMimeType } from "@/lib/media/album-visual";

const VALID_STANDALONE_SOURCE_TYPES = ["general", "status_update"] as const;

function addUnitRefSource(
  map: Map<string, Set<AlbumSourceType>>,
  unitRef: string | null | undefined,
  sourceType: AlbumSourceType,
): void {
  const trimmed = unitRef?.trim();
  if (!trimmed) return;
  if (!map.has(trimmed)) map.set(trimmed, new Set());
  map.get(trimmed)!.add(sourceType);
}

function standaloneSourceType(raw: string | null | undefined): AlbumSourceType {
  if (raw && (VALID_STANDALONE_SOURCE_TYPES as readonly string[]).includes(raw)) {
    return raw as AlbumSourceType;
  }
  return "general";
}

export interface AlbumCoverageResult {
  unitRefs: string[];
  sourceTypesByUnitRef: Record<string, AlbumSourceType[]>;
}

/** Unit refs and album source types with at least one album-visible photo or video. */
export async function collectAlbumCoverage(
  db: PrismaClient,
  projectId: string,
): Promise<AlbumCoverageResult> {
  const sourceMap = new Map<string, Set<AlbumSourceType>>();

  const [
    standalone,
    observations,
    observationComments,
    issues,
    issueComments,
    locationRows,
    inspectionSubmissions,
  ] = await Promise.all([
    db.mediaAttachment.findMany({
      where: {
        unitPhotoProjectId: projectId,
        unitPhotoUnitRef: { not: null },
        ...VISUAL_MIME_WHERE,
      },
      select: { unitPhotoUnitRef: true, unitPhotoSourceType: true },
    }),
    db.projectObservation.findMany({
      where: {
        projectId,
        attachments: { some: VISUAL_MIME_WHERE },
      },
      select: { unitRef: true },
    }),
    db.observationComment.findMany({
      where: {
        observation: { projectId },
        attachments: { some: VISUAL_MIME_WHERE },
      },
      select: { observation: { select: { unitRef: true } } },
    }),
    db.projectIssue.findMany({
      where: {
        projectId,
        attachments: { some: VISUAL_MIME_WHERE },
      },
      select: { unitRef: true },
    }),
    db.issueComment.findMany({
      where: {
        issue: { projectId },
        attachments: { some: VISUAL_MIME_WHERE },
      },
      select: { issue: { select: { unitRef: true } } },
    }),
    db.projectRow.findMany({
      where: { projectId },
      select: { id: true, building: true, level: true, unit: true },
    }),
    db.inspectionSubmission.findMany({
      where: { projectId },
      select: {
        scopeRowId: true,
        unitId: true,
        answers: {
          select: {
            rawAnswer: true,
            deficiencies: {
              select: {
                media: {
                  select: { mimeType: true, storageUrl: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  for (const row of standalone) {
    addUnitRefSource(sourceMap, row.unitPhotoUnitRef, standaloneSourceType(row.unitPhotoSourceType));
  }
  for (const row of observations) addUnitRefSource(sourceMap, row.unitRef, "observation");
  for (const row of observationComments) {
    addUnitRefSource(sourceMap, row.observation.unitRef, "observation_comment");
  }
  for (const row of issues) addUnitRefSource(sourceMap, row.unitRef, "issue");
  for (const row of issueComments) addUnitRefSource(sourceMap, row.issue.unitRef, "issue_comment");

  const rowIdToUnitRef = new Map<string, string>();
  for (const row of locationRows) {
    rowIdToUnitRef.set(row.id, `${row.building}|${row.level}|${row.unit}`);
  }

  for (const submission of inspectionSubmissions) {
    const scopeRowId = submission.scopeRowId ?? submission.unitId;
    if (!scopeRowId) continue;
    const unitRef = rowIdToUnitRef.get(scopeRowId);
    if (!unitRef) continue;

    let hasVisual = false;
    for (const answer of submission.answers) {
      if (extractCapturedMedia(answer.rawAnswer).length > 0) {
        hasVisual = true;
        break;
      }
      for (const deficiency of answer.deficiencies) {
        for (const media of deficiency.media) {
          if (visualMimeType(media.mimeType, media.storageUrl)) {
            hasVisual = true;
            break;
          }
        }
        if (hasVisual) break;
      }
      if (hasVisual) break;
    }

    if (hasVisual) addUnitRefSource(sourceMap, unitRef, "inspection");
  }

  const unitRefs = [...sourceMap.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
  const sourceTypesByUnitRef = Object.fromEntries(
    [...sourceMap.entries()].map(([ref, types]) => [ref, [...types].sort()]),
  );

  return { unitRefs, sourceTypesByUnitRef };
}

/** Unit refs (`building|level|unit`) that have at least one album-visible photo or video. */
export async function collectUnitRefsWithAlbumMedia(
  db: PrismaClient,
  projectId: string,
): Promise<string[]> {
  const { unitRefs } = await collectAlbumCoverage(db, projectId);
  return unitRefs;
}

import type { IssueSummary, ObsSummary } from "@/components/projects/UnitCards";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { filterObservationAttachmentHeads } from "@/lib/observation-attachments";
import { buildInspectionRollup } from "@/lib/field-daily-report/build-project-snapshot";
import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";
import { serializeIssueResponsibleParties } from "@/lib/issues/serialize-issue-parties";

const issueInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  resolvedBy: { select: { id: true, name: true, email: true } },
  attachments: true,
  responsiblePartyTags: { select: { partyCode: true }, orderBy: { id: "asc" } },
  scopeTags: {
    include: {
      row: {
        select: {
          id: true,
          building: true,
          level: true,
          unit: true,
          scopeTypeId: true,
          scopeType: { select: { name: true } },
        },
      },
    },
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
  _count: { select: { comments: true } },
} as const;

const observationInclude = {
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
          scopeTypeId: true,
          scopeType: { select: { name: true } },
        },
      },
    },
  },
  _count: { select: { comments: true } },
} as const;

type IssueWithRelations = Prisma.ProjectIssueGetPayload<{ include: typeof issueInclude }>;
type ObservationWithRelations = Prisma.ProjectObservationGetPayload<{ include: typeof observationInclude }>;

function mapIssue(row: IssueWithRelations): IssueSummary {
  const serialized = serializeIssueResponsibleParties(row);
  return {
    id: row.id,
    issueType: serialized.issueTypeCode,
    responsibleParty: serialized.responsiblePartyCode,
    responsibleParties: serialized.responsibleParties,
    isBlockingWork: row.isBlockingWork,
    status: row.status,
    shortDescription: row.shortDescription,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolutionNote: row.resolutionNote,
    unitRef: row.unitRef,
    buildPhaseTag: row.buildPhaseTag,
    areaTag: row.areaTag,
    bulkGroupId: row.bulkGroupId,
    createdBy: row.createdBy,
    resolvedBy: row.resolvedBy,
    attachments: row.attachments.map((a) => ({
      id: a.id,
      storageKey: a.storageKey,
      storageUrl: a.storageUrl,
      mimeType: a.mimeType,
      fileSizeBytes: a.fileSizeBytes,
      caption: a.caption,
      transcriptStatus: a.transcriptStatus,
      transcriptOriginal: a.transcriptOriginal,
    })),
    scopeTags: row.scopeTags,
    subScopeTags: row.subScopeTags,
    _count: row._count,
  };
}

function mapObservation(row: ObservationWithRelations): ObsSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    observationType: row.observationTypeCode,
    unitRef: row.unitRef,
    buildPhaseTag: row.buildPhaseTag,
    areaTag: row.areaTag,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
    attachments: filterObservationAttachmentHeads(row.attachments).map((a) => ({
      id: a.id,
      storageKey: a.storageKey,
      storageUrl: a.storageUrl,
      mimeType: a.mimeType,
      fileSizeBytes: a.fileSizeBytes,
      caption: a.caption,
      transcriptStatus: a.transcriptStatus,
      transcriptOriginal: a.transcriptOriginal,
    })),
    scopeTags: row.scopeTags,
    _count: row._count,
  };
}

function normalizeInspections(snapshot: FieldDailyReportProjectSnapshot): FieldDailyReportProjectSnapshot {
  const legacy = snapshot.inspections as { summaryGroups?: unknown; items?: FieldDailyReportProjectSnapshot["issues"]["items"] };
  if (legacy.summaryGroups && Array.isArray(legacy.summaryGroups)) {
    return snapshot;
  }
  const items = legacy.items ?? [];
  return {
    ...snapshot,
    inspections: buildInspectionRollup(items),
  };
}

/** Attach live issue/observation records and normalize inspection rollups. */
export async function hydrateListedItemDetails(
  snapshot: FieldDailyReportProjectSnapshot,
): Promise<FieldDailyReportProjectSnapshot> {
  const next = normalizeInspections(snapshot);

  const issueIds = [
    ...new Set(
      next.issues.items
        .map((item) => item.issueId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const observationIds = [
    ...new Set(
      next.observations.items
        .map((item) => item.observationId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  if (issueIds.length === 0 && observationIds.length === 0) return next;

  const [issues, observations] = await Promise.all([
    issueIds.length
      ? db.projectIssue.findMany({ where: { id: { in: issueIds } }, include: issueInclude })
      : Promise.resolve([] as IssueWithRelations[]),
    observationIds.length
      ? db.projectObservation.findMany({ where: { id: { in: observationIds } }, include: observationInclude })
      : Promise.resolve([] as ObservationWithRelations[]),
  ]);

  const issueById = new Map(issues.map((row) => [row.id, mapIssue(row)] as const));
  const obsById = new Map(observations.map((row) => [row.id, mapObservation(row)] as const));

  return {
    ...next,
    issues: {
      items: next.issues.items.map((item) => {
        if (!item.issueId) return item;
        const issueRecord = issueById.get(item.issueId);
        return issueRecord
          ? { ...item, issueRecord, bodyText: issueRecord.notes?.trim() || item.bodyText }
          : item;
      }),
    },
    observations: {
      items: next.observations.items.map((item) => {
        if (!item.observationId) return item;
        const observationRecord = obsById.get(item.observationId);
        return observationRecord ? { ...item, observationRecord } : item;
      }),
    },
  };
}

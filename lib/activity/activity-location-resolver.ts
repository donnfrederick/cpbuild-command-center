import type { ActivityEventType, CaptureGpsStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ACTIVITY_GPS_TRACKING_EPOCH,
  type LocationOutcome,
  type SerializedActivityLocation,
  activityLocationSourceDbToClient,
  gpsStatusDbToClient,
} from "@/lib/activity/activity-location-schema";

export interface ActivityRowForLocation {
  id: string;
  projectId: string;
  eventType: ActivityEventType;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}

type LocationContextRow = {
  activityLogId: string;
  gpsStatus: CaptureGpsStatus;
  latitude: number | null;
  longitude: number | null;
  distanceFromProjectMeters: number | null;
  source: "ACTIVITY_CAPTURE" | "MEDIA_DERIVED" | "BACKFILL";
};

type MediaCaptureRow = {
  gpsStatus: CaptureGpsStatus;
  latitude: number | null;
  longitude: number | null;
  distanceFromProjectMeters: number | null;
};

function asRecord(value: Prisma.JsonValue | unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readId(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readRowId(metadata: Record<string, unknown>): string | null {
  return readId(metadata, "rowId") ?? readId(metadata, "scopeRowId");
}

export function collectAttachmentIdsForEvent(
  eventType: ActivityEventType,
  metadata: Record<string, unknown>,
): string[] {
  switch (eventType) {
    case "UNIT_PHOTO_UPLOADED":
    case "ISSUE_ANNOTATION_UPDATED":
    case "OBSERVATION_ANNOTATION_UPDATED": {
      const id = readId(metadata, "attachmentId") ?? readId(metadata, "newAttachmentId");
      return id ? [id] : [];
    }
    default:
      return [];
  }
}

export function collectEntityIdsForMediaLookup(
  events: ActivityRowForLocation[],
): {
  issueIds: Set<string>;
  observationIds: Set<string>;
  submissionIds: Set<string>;
  directAttachmentIds: Set<string>;
} {
  const issueIds = new Set<string>();
  const observationIds = new Set<string>();
  const submissionIds = new Set<string>();
  const directAttachmentIds = new Set<string>();

  for (const event of events) {
    const metadata = asRecord(event.metadata);
    if (!metadata) continue;
    switch (event.eventType) {
      case "ISSUE_CREATED":
      case "ISSUE_UPDATED":
      case "ISSUE_RESOLVED":
      case "ISSUE_REOPENED":
      case "ISSUE_BULK_CREATED": {
        const issueId = readId(metadata, "issueId");
        if (issueId) issueIds.add(issueId);
        break;
      }
      case "OBSERVATION_CREATED":
      case "OBSERVATION_UPDATED":
      case "OBSERVATION_BULK_CREATED": {
        const observationId = readId(metadata, "observationId");
        if (observationId) observationIds.add(observationId);
        break;
      }
      case "INSPECTION_SUBMITTED": {
        const submissionId = readId(metadata, "submissionId");
        if (submissionId) submissionIds.add(submissionId);
        break;
      }
      default: {
        for (const id of collectAttachmentIdsForEvent(event.eventType, metadata)) {
          directAttachmentIds.add(id);
        }
      }
    }
  }

  return { issueIds, observationIds, submissionIds, directAttachmentIds };
}

async function loadMediaCaptureByAttachmentIds(
  attachmentIds: string[],
): Promise<Map<string, MediaCaptureRow>> {
  if (attachmentIds.length === 0) return new Map();
  const rows = await db.mediaCaptureContext.findMany({
    where: { mediaAttachmentId: { in: attachmentIds } },
    select: {
      mediaAttachmentId: true,
      gpsStatus: true,
      latitude: true,
      longitude: true,
      distanceFromProjectMeters: true,
    },
  });
  return new Map(rows.map((r) => [r.mediaAttachmentId, r]));
}

async function resolveAttachmentIdsForEvent(
  event: ActivityRowForLocation,
  issueAttachmentIds: Map<string, string[]>,
  observationAttachmentIds: Map<string, string[]>,
  submissionAttachmentIds: Map<string, string[]>,
): Promise<string[]> {
  const metadata = asRecord(event.metadata);
  if (!metadata) return [];

  switch (event.eventType) {
    case "ISSUE_CREATED":
    case "ISSUE_UPDATED":
    case "ISSUE_RESOLVED":
    case "ISSUE_REOPENED": {
      const issueId = readId(metadata, "issueId");
      return issueId ? (issueAttachmentIds.get(issueId) ?? []) : [];
    }
    case "OBSERVATION_CREATED":
    case "OBSERVATION_UPDATED": {
      const observationId = readId(metadata, "observationId");
      return observationId ? (observationAttachmentIds.get(observationId) ?? []) : [];
    }
    case "INSPECTION_SUBMITTED": {
      const submissionId = readId(metadata, "submissionId");
      return submissionId ? (submissionAttachmentIds.get(submissionId) ?? []) : [];
    }
    default:
      return collectAttachmentIdsForEvent(event.eventType, metadata);
  }
}

function aggregateMediaCaptures(contexts: MediaCaptureRow[]): MediaCaptureRow | null {
  if (contexts.length === 0) return null;
  const granted = contexts.filter((c) => c.gpsStatus === "GRANTED" && c.latitude != null && c.longitude != null);
  if (granted.length > 0) {
    return {
      gpsStatus: "GRANTED",
      latitude: granted.reduce((s, c) => s + (c.latitude ?? 0), 0) / granted.length,
      longitude: granted.reduce((s, c) => s + (c.longitude ?? 0), 0) / granted.length,
      distanceFromProjectMeters:
        granted.find((c) => c.distanceFromProjectMeters != null)?.distanceFromProjectMeters ?? null,
    };
  }
  return contexts[0] ?? null;
}

function outcomeFromGpsStatus(status: CaptureGpsStatus): LocationOutcome {
  if (status === "GRANTED") return "on_map";
  if (status === "DENIED") return "denied";
  if (status === "TIMEOUT") return "timeout";
  return "unavailable";
}

function serializeFromContext(
  ctx: LocationContextRow | MediaCaptureRow,
  source?: SerializedActivityLocation["source"],
): SerializedActivityLocation {
  const granted = ctx.gpsStatus === "GRANTED" && ctx.latitude != null && ctx.longitude != null;
  return {
    outcome: granted ? "on_map" : outcomeFromGpsStatus(ctx.gpsStatus),
    gpsStatus: gpsStatusDbToClient(ctx.gpsStatus),
    latitude: ctx.latitude,
    longitude: ctx.longitude,
    distanceFromProjectMeters: ctx.distanceFromProjectMeters,
    ...(source ? { source } : {}),
  };
}

export async function buildMediaLookupMaps(
  events: ActivityRowForLocation[],
): Promise<{
  issueAttachmentIds: Map<string, string[]>;
  observationAttachmentIds: Map<string, string[]>;
  submissionAttachmentIds: Map<string, string[]>;
  mediaByAttachmentId: Map<string, MediaCaptureRow>;
}> {
  const { issueIds, observationIds, submissionIds, directAttachmentIds } =
    collectEntityIdsForMediaLookup(events);

  const [issueAttachments, observationAttachments, submissionMedia] = await Promise.all([
    issueIds.size > 0
      ? db.mediaAttachment.findMany({
          where: { issueId: { in: [...issueIds] } },
          select: { id: true, issueId: true },
        })
      : Promise.resolve([]),
    observationIds.size > 0
      ? db.mediaAttachment.findMany({
          where: { observationId: { in: [...observationIds] } },
          select: { id: true, observationId: true },
        })
      : Promise.resolve([]),
    submissionIds.size > 0
      ? db.inspectionAnswerMedia.findMany({
          where: {
            inspectionAnswer: { inspectionSubmissionId: { in: [...submissionIds] } },
          },
          select: {
            id: true,
            inspectionAnswer: { select: { inspectionSubmissionId: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const issueAttachmentIds = new Map<string, string[]>();
  for (const row of issueAttachments) {
    if (!row.issueId) continue;
    const list = issueAttachmentIds.get(row.issueId) ?? [];
    list.push(row.id);
    issueAttachmentIds.set(row.issueId, list);
  }

  const observationAttachmentIds = new Map<string, string[]>();
  for (const row of observationAttachments) {
    if (!row.observationId) continue;
    const list = observationAttachmentIds.get(row.observationId) ?? [];
    list.push(row.id);
    observationAttachmentIds.set(row.observationId, list);
  }

  const submissionAttachmentIds = new Map<string, string[]>();
  for (const row of submissionMedia) {
    const submissionId = row.inspectionAnswer.inspectionSubmissionId;
    const list = submissionAttachmentIds.get(submissionId) ?? [];
    list.push(row.id);
    submissionAttachmentIds.set(submissionId, list);
  }

  const allAttachmentIds = new Set(directAttachmentIds);
  for (const ids of issueAttachmentIds.values()) ids.forEach((id) => allAttachmentIds.add(id));
  for (const ids of observationAttachmentIds.values()) ids.forEach((id) => allAttachmentIds.add(id));
  for (const ids of submissionAttachmentIds.values()) ids.forEach((id) => allAttachmentIds.add(id));

  const mediaByAttachmentId = await loadMediaCaptureByAttachmentIds([...allAttachmentIds]);

  return {
    issueAttachmentIds,
    observationAttachmentIds,
    submissionAttachmentIds,
    mediaByAttachmentId,
  };
}

export async function resolveActivityLocationForEvent(
  event: ActivityRowForLocation,
  storedContext: LocationContextRow | null,
  mediaLookup: {
    issueAttachmentIds: Map<string, string[]>;
    observationAttachmentIds: Map<string, string[]>;
    submissionAttachmentIds: Map<string, string[]>;
    mediaByAttachmentId: Map<string, MediaCaptureRow>;
  },
): Promise<SerializedActivityLocation> {
  if (storedContext) {
    return serializeFromContext(storedContext, activityLocationSourceDbToClient(storedContext.source));
  }

  const attachmentIds = await resolveAttachmentIdsForEvent(
    event,
    mediaLookup.issueAttachmentIds,
    mediaLookup.observationAttachmentIds,
    mediaLookup.submissionAttachmentIds,
  );
  const mediaContexts = attachmentIds
    .map((id) => mediaLookup.mediaByAttachmentId.get(id))
    .filter((c): c is MediaCaptureRow => c != null);
  const aggregated = aggregateMediaCaptures(mediaContexts);

  if (aggregated) {
    if (aggregated.gpsStatus === "GRANTED" && aggregated.latitude != null && aggregated.longitude != null) {
      return serializeFromContext(aggregated, "media_derived");
    }
    return serializeFromContext(aggregated);
  }

  if (event.createdAt < ACTIVITY_GPS_TRACKING_EPOCH) {
    return { outcome: "legacy" };
  }

  return { outcome: "no_capture" };
}

export function readRowIdFromEvent(event: ActivityRowForLocation): string | null {
  const metadata = asRecord(event.metadata);
  return metadata ? readRowId(metadata) : null;
}

export { readRowId, asRecord, readId };

/**
 * Read-time hydration — attaches image previews to activity events that reference
 * field media (issues, observations, inspections, unit album uploads).
 *
 * Previews are merged into metadata under `mediaPreviews` at GET time only; they
 * are never persisted on the activity row.
 */

import type { ActivityEventType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  ACTIVITY_MEDIA_PREVIEW_LIMIT,
  ACTIVITY_MEDIA_PREVIEWS_KEY,
  type ActivityMediaPreview,
} from "@/lib/activity-media-previews";
import { filterObservationAttachmentHeads } from "@/lib/observation-attachments";

export type { ActivityMediaPreview } from "@/lib/activity-media-previews";
export {
  ACTIVITY_MEDIA_PREVIEW_LIMIT,
  ACTIVITY_MEDIA_PREVIEWS_KEY,
  readActivityMediaPreviews,
} from "@/lib/activity-media-previews";

interface ActivityWithMetadata {
  eventType: ActivityEventType;
  metadata: Prisma.JsonValue;
}

type AttachmentRow = {
  id: string;
  storageUrl: string;
  mimeType: string;
  issueId?: string | null;
  observationId?: string | null;
  supersedesId?: string | null;
};

type ObservationAttachmentRow = AttachmentRow & {
  observationId: string | null;
  supersedesId: string | null;
};

type InspectionMediaRow = {
  id: string;
  storageUrl: string;
  mimeType: string | null;
  inspectionAnswer: { inspectionSubmissionId: string };
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

function isImageMime(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType?.startsWith("image/"));
}

function toPreview(row: { id: string; storageUrl: string; mimeType: string | null | undefined }): ActivityMediaPreview | null {
  if (!isImageMime(row.mimeType)) return null;
  return {
    id: row.id,
    storageUrl: row.storageUrl,
    mimeType: row.mimeType ?? "image/jpeg",
  };
}

function dedupePreviews(previews: ActivityMediaPreview[]): ActivityMediaPreview[] {
  const seen = new Set<string>();
  const out: ActivityMediaPreview[] = [];
  for (const preview of previews) {
    if (seen.has(preview.id)) continue;
    seen.add(preview.id);
    out.push(preview);
    if (out.length >= ACTIVITY_MEDIA_PREVIEW_LIMIT) break;
  }
  return out;
}

export async function hydrateActivityMediaMetadata<T extends ActivityWithMetadata>(
  events: T[],
): Promise<T[]> {
  if (events.length === 0) return events;

  const issueIds = new Set<string>();
  const observationIds = new Set<string>();
  const attachmentIds = new Set<string>();
  const submissionIds = new Set<string>();

  for (const event of events) {
    const metadata = asRecord(event.metadata);
    if (!metadata) continue;

    switch (event.eventType) {
      case "ISSUE_CREATED":
      case "ISSUE_UPDATED":
      case "ISSUE_RESOLVED":
      case "ISSUE_REOPENED": {
        const issueId = readId(metadata, "issueId");
        if (issueId) issueIds.add(issueId);
        break;
      }
      case "OBSERVATION_CREATED":
      case "OBSERVATION_UPDATED": {
        const observationId = readId(metadata, "observationId");
        if (observationId) observationIds.add(observationId);
        break;
      }
      case "ISSUE_ANNOTATION_UPDATED":
      case "OBSERVATION_ANNOTATION_UPDATED": {
        const attachmentId = readId(metadata, "attachmentId");
        if (attachmentId) attachmentIds.add(attachmentId);
        break;
      }
      case "OBSERVATION_IMAGE_VERSION_ADDED": {
        const newAttachmentId = readId(metadata, "newAttachmentId");
        if (newAttachmentId) attachmentIds.add(newAttachmentId);
        break;
      }
      case "UNIT_PHOTO_UPLOADED": {
        const attachmentId = readId(metadata, "attachmentId");
        if (attachmentId) attachmentIds.add(attachmentId);
        break;
      }
      case "INSPECTION_SUBMITTED": {
        const submissionId = readId(metadata, "submissionId");
        if (submissionId) submissionIds.add(submissionId);
        break;
      }
      default:
        break;
    }
  }

  const [
    issueAttachments,
    observationAttachments,
    directAttachments,
    inspectionMedia,
  ] = await Promise.all([
    issueIds.size > 0
      ? db.mediaAttachment.findMany({
          where: { issueId: { in: [...issueIds] } },
          select: { id: true, storageUrl: true, mimeType: true, issueId: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([] as AttachmentRow[]),
    observationIds.size > 0
      ? db.mediaAttachment.findMany({
          where: { observationId: { in: [...observationIds] } },
          select: {
            id: true,
            storageUrl: true,
            mimeType: true,
            observationId: true,
            supersedesId: true,
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([] as ObservationAttachmentRow[]),
    attachmentIds.size > 0
      ? db.mediaAttachment.findMany({
          where: { id: { in: [...attachmentIds] } },
          select: { id: true, storageUrl: true, mimeType: true },
        })
      : Promise.resolve([] as AttachmentRow[]),
    submissionIds.size > 0
      ? db.inspectionAnswerMedia.findMany({
          where: {
            inspectionAnswer: { inspectionSubmissionId: { in: [...submissionIds] } },
          },
          select: {
            id: true,
            storageUrl: true,
            mimeType: true,
            inspectionAnswer: { select: { inspectionSubmissionId: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([] as InspectionMediaRow[]),
  ]);

  const issuePreviewsById = new Map<string, ActivityMediaPreview[]>();
  for (const issueId of issueIds) {
    const rows = issueAttachments.filter((row) => row.issueId === issueId);
    const previews = dedupePreviews(
      rows.map((row) => toPreview(row)).filter((row): row is ActivityMediaPreview => row !== null),
    );
    if (previews.length > 0) issuePreviewsById.set(issueId, previews);
  }

  const observationPreviewsById = new Map<string, ActivityMediaPreview[]>();
  for (const observationId of observationIds) {
    const rows = observationAttachments.filter((row) => row.observationId === observationId);
    const heads = filterObservationAttachmentHeads(rows);
    const previews = dedupePreviews(
      heads.map((row) => toPreview(row)).filter((row): row is ActivityMediaPreview => row !== null),
    );
    if (previews.length > 0) observationPreviewsById.set(observationId, previews);
  }

  const attachmentPreviewById = new Map<string, ActivityMediaPreview>();
  for (const row of directAttachments) {
    const preview = toPreview(row);
    if (preview) attachmentPreviewById.set(row.id, preview);
  }

  const inspectionPreviewsBySubmissionId = new Map<string, ActivityMediaPreview[]>();
  for (const submissionId of submissionIds) {
    const rows = inspectionMedia.filter(
      (row) => row.inspectionAnswer.inspectionSubmissionId === submissionId,
    );
    const previews = dedupePreviews(
      rows.map((row) => toPreview(row)).filter((row): row is ActivityMediaPreview => row !== null),
    );
    if (previews.length > 0) inspectionPreviewsBySubmissionId.set(submissionId, previews);
  }

  return events.map((event) => {
    const metadata = asRecord(event.metadata);
    if (!metadata) return event;

    let previews: ActivityMediaPreview[] = [];

    switch (event.eventType) {
      case "ISSUE_CREATED":
      case "ISSUE_UPDATED":
      case "ISSUE_RESOLVED":
      case "ISSUE_REOPENED": {
        const issueId = readId(metadata, "issueId");
        previews = issueId ? (issuePreviewsById.get(issueId) ?? []) : [];
        break;
      }
      case "OBSERVATION_CREATED":
      case "OBSERVATION_UPDATED": {
        const observationId = readId(metadata, "observationId");
        previews = observationId ? (observationPreviewsById.get(observationId) ?? []) : [];
        break;
      }
      case "ISSUE_ANNOTATION_UPDATED":
      case "OBSERVATION_ANNOTATION_UPDATED": {
        const attachmentId = readId(metadata, "attachmentId");
        previews = attachmentId && attachmentPreviewById.has(attachmentId)
          ? [attachmentPreviewById.get(attachmentId)!]
          : [];
        break;
      }
      case "OBSERVATION_IMAGE_VERSION_ADDED": {
        const newAttachmentId = readId(metadata, "newAttachmentId");
        previews = newAttachmentId && attachmentPreviewById.has(newAttachmentId)
          ? [attachmentPreviewById.get(newAttachmentId)!]
          : [];
        break;
      }
      case "UNIT_PHOTO_UPLOADED": {
        const attachmentId = readId(metadata, "attachmentId");
        previews = attachmentId && attachmentPreviewById.has(attachmentId)
          ? [attachmentPreviewById.get(attachmentId)!]
          : [];
        break;
      }
      case "INSPECTION_SUBMITTED": {
        const submissionId = readId(metadata, "submissionId");
        previews = submissionId ? (inspectionPreviewsBySubmissionId.get(submissionId) ?? []) : [];
        break;
      }
      default:
        break;
    }

    if (previews.length === 0) return event;

    return {
      ...event,
      metadata: {
        ...metadata,
        [ACTIVITY_MEDIA_PREVIEWS_KEY]: previews,
      },
    };
  });
}

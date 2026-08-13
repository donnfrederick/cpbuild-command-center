import "server-only";

import { db } from "@/lib/db";
import {
  buildInspectionSubmissionDetailBlocks,
  formatInspectionReportDetailsFromPayload,
} from "@/lib/field-daily-report/format-inspection-deficiency-summary";
import type {
  FieldDailyReportInspectionDetailBlock,
  FieldDailyReportProjectSnapshot,
  FieldDailyReportStatusUnitEntryAttachment,
} from "@/lib/field-daily-report/types";
import { hydrateInspectionSubmissionView } from "@/lib/inspections/hydrate-inspection-submission-view";
import type { FieldMediaReference } from "@/lib/field-media-resolve";
import { listInspectionPayloadImageRefs } from "@/lib/pdf/inspection-submission-pdf";

function toAttachments(
  submissionId: string,
  refs: FieldMediaReference[],
  caption?: string | null,
): FieldDailyReportStatusUnitEntryAttachment[] {
  return refs.map((ref, index) => ({
    id: ref.storageKey ?? `${submissionId}-${index}`,
    storageUrl: ref.storageUrl,
    storageKey: ref.storageKey,
    mimeType: ref.mimeType ?? "image/jpeg",
    caption: caption ?? null,
  }));
}

function mapDetailBlocks(
  submissionId: string,
  blocks: ReturnType<typeof buildInspectionSubmissionDetailBlocks>,
): FieldDailyReportInspectionDetailBlock[] {
  return blocks.map((block) => ({
    heading: block.heading,
    lines: block.lines,
    attachments: block.imageRefs.length
      ? toAttachments(submissionId, block.imageRefs, block.heading)
      : undefined,
  }));
}

function collectSubmissionIds(snapshot: FieldDailyReportProjectSnapshot): string[] {
  const ids = new Set<string>();
  for (const group of snapshot.inspections.summaryGroups) {
    for (const item of group.items) {
      if (item.submissionId) ids.add(item.submissionId);
    }
  }
  return [...ids];
}

const submissionSelect = {
  id: true,
  formId: true,
  formVersionId: true,
  source: true,
  payload: true,
  templateSnapshot: true,
  outcome: true,
  form: {
    select: {
      id: true,
      name: true,
      category: true,
      level: true,
      purpose: true,
      scopeTypeCodes: true,
      description: true,
    },
  },
} as const;

/** Attach failed-item summary text and embedded photos to inspection listed items. */
export async function hydrateInspectionSubmissionDetails(
  snapshot: FieldDailyReportProjectSnapshot,
): Promise<FieldDailyReportProjectSnapshot> {
  const submissionIds = collectSubmissionIds(snapshot);
  if (submissionIds.length === 0) return snapshot;

  const submissions = await db.inspectionSubmission.findMany({
    where: { id: { in: submissionIds } },
    select: submissionSelect,
  });

  const hydratedById = new Map(
    await Promise.all(
      submissions.map(async (submission) => {
        const hydrated = await hydrateInspectionSubmissionView(submission);
        return [submission.id, hydrated] as const;
      }),
    ),
  );

  return {
    ...snapshot,
    inspections: {
      summaryGroups: snapshot.inspections.summaryGroups.map((group) => ({
        ...group,
        items: group.items.map((item) => {
          if (!item.submissionId) return item;
          const hydrated = hydratedById.get(item.submissionId);
          if (!hydrated) return item;

          const detailBlocks = buildInspectionSubmissionDetailBlocks(
            hydrated.templateSnapshot,
            hydrated.payload,
          );
          const deficiencySummary = formatInspectionReportDetailsFromPayload(
            hydrated.templateSnapshot,
            hydrated.payload,
          );
          const imageRefs = listInspectionPayloadImageRefs(hydrated.payload);
          const attachments = toAttachments(item.submissionId, imageRefs);

          return {
            ...item,
            bodyText: deficiencySummary || item.bodyText,
            attachments: attachments.length > 0 ? attachments : item.attachments,
            inspectionDetailBlocks:
              detailBlocks.length > 0
                ? mapDetailBlocks(item.submissionId, detailBlocks)
                : item.inspectionDetailBlocks,
          };
        }),
      })),
    },
  };
}

export { submissionSelect as fieldDailyInspectionSubmissionSelect };

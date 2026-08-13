import "server-only";

import { formatFieldDailyReportGeneratedAt } from "@/lib/field-daily-report/hub-history";
import {
  buildHubActivityPreviewCounts,
  formatHubActivityPreviewLine,
  type HubActivityPreviewLabelStrings,
} from "@/lib/field-daily-report/hub-activity-preview";
import type { FieldDailyReportExportMediaContext } from "@/lib/field-daily-report/pdf-export-media";
import {
  issueImagesFromSnapshotItem,
  observationImagesFromSnapshotItem,
  statusPhotosForUnitEntry,
  statusImagesForPdfEntry,
} from "@/lib/field-daily-report/pdf-export-media";
import type {
  FieldDailyReportPdfLabels,
  FieldDailyReportPdfMediaRef,
  FieldDailyReportPdfPayload,
  FieldDailyReportPdfProjectEntry,
  FieldDailyReportPdfSection,
} from "@/lib/field-daily-report/pdf-export-types";
import {
  buildIssuePdfDetailLines,
  buildObservationPdfDetailLines,
} from "@/lib/field-daily-report/pdf-export-list-details";
import {
  inspectionOutcomePdfBadgeStyle,
  scopeStatusPdfBadgeStyle,
} from "@/lib/field-daily-report/pdf-export-colors";
import { snapshotHasFieldActivity } from "@/lib/field-daily-report/snapshot-activity";
import {
  formatWorkforceManpowerForPdf,
  isDailyManpowerMissing,
  legacyWorkforceCommentBody,
  resolveDailyManpower,
} from "@/lib/field-daily-report/workforce-manpower";
import { formatFieldDailyReportDateLabel } from "@/lib/field-daily-report/timezone";
import type {
  FieldDailyReportCommentDto,
  FieldDailyReportProjectDto,
  FieldDailyReportSectionKey,
  FieldDailyReportStatusUnitEntry,
} from "@/lib/field-daily-report/types";

export type {
  FieldDailyReportPdfGroup,
  FieldDailyReportPdfGroupLine,
  FieldDailyReportPdfLabels,
  FieldDailyReportPdfListItem,
  FieldDailyReportPdfMediaRef,
  FieldDailyReportPdfPayload,
  FieldDailyReportPdfProjectEntry,
  FieldDailyReportPdfSection,
} from "@/lib/field-daily-report/pdf-export-types";
export { fieldDailyReportPdfFilename } from "@/lib/field-daily-report/pdf-export-filename";

function commentFor(
  comments: FieldDailyReportCommentDto[],
  sectionKey: FieldDailyReportSectionKey,
  itemKey = "",
): string {
  return comments.find((c) => c.sectionKey === sectionKey && c.itemKey === itemKey)?.body?.trim() ?? "";
}

function formatProgressDetail(
  project: FieldDailyReportProjectDto,
  labels: FieldDailyReportPdfLabels,
): { delta?: string; pct?: string } | undefined {
  const { progress } = project.snapshot;
  if (typeof progress.pctComplete !== "number") return undefined;
  const detail: { delta?: string; pct?: string } = {
    pct: labels.progressCurrentPct.replace("{pct}", String(progress.pctComplete)),
  };
  if (typeof progress.pctCompleteDelta === "number" && progress.pctCompleteDelta !== 0) {
    detail.delta = labels.progressDeltaOnly.replace("{delta}", String(progress.pctCompleteDelta));
  }
  return detail;
}

function formatUnitEntryLine(
  entry: FieldDailyReportStatusUnitEntry,
  projectLevelLabel: string,
  options?: { includeSubcontractor?: boolean },
): string {
  const parts: string[] = [];
  parts.push(entry.locationLabel?.trim() || projectLevelLabel);
  if (options?.includeSubcontractor !== false) {
    parts.push(entry.subcontractorLabel?.trim() || "Unassigned");
  }
  if (entry.scopeName?.trim()) {
    parts.push(entry.scopeName.trim());
  }
  return parts.join(" · ");
}

function formatGroupHeading(base: string, unitCount: number, formatUnitCount?: (count: number) => string): string {
  if (unitCount <= 0) return base;
  const countLabel = formatUnitCount ? formatUnitCount(unitCount) : String(unitCount);
  return `${base} — ${countLabel}`;
}

function mergePdfMediaRefs(
  ...groups: Array<FieldDailyReportPdfMediaRef[] | undefined>
): FieldDailyReportPdfMediaRef[] {
  const seen = new Set<string>();
  const merged: FieldDailyReportPdfMediaRef[] = [];
  for (const group of groups) {
    for (const ref of group ?? []) {
      const key = ref.storageKey?.trim() || ref.storageUrl;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(ref);
    }
  }
  return merged;
}

function buildWorkforceSection(
  project: FieldDailyReportProjectDto,
  labels: FieldDailyReportPdfLabels,
): FieldDailyReportPdfSection {
  const legacyBody = legacyWorkforceCommentBody(project.comments);
  const count = resolveDailyManpower(project.dailyManpower, legacyBody);
  return {
    title: labels.sectionWorkforce,
    detailLines:
      count !== null
        ? [formatWorkforceManpowerForPdf(labels.workforceManpowerSummary, count)]
        : [labels.missingDailyManpowerAlert],
    groups: [],
    items: [],
  };
}

function buildProjectSections(
  project: FieldDailyReportProjectDto,
  labels: FieldDailyReportPdfLabels,
  formatUnitCount?: BuildFieldDailyReportPdfPayloadInput["formatUnitCount"],
  media?: FieldDailyReportExportMediaContext,
): FieldDailyReportPdfSection[] {
  const snap = project.snapshot;
  const sections: FieldDailyReportPdfSection[] = [];

  const pushSection = (section: FieldDailyReportPdfSection | null) => {
    if (!section) return;
    if (
      section.groups.length === 0 &&
      section.items.length === 0 &&
      !section.note &&
      !(section.detailLines?.length ?? 0) &&
      !section.progressDetail?.delta &&
      !section.progressDetail?.pct
    ) {
      return;
    }
    sections.push(section);
  };

  const progressDetail = formatProgressDetail(project, labels);
  if (progressDetail || commentFor(project.comments, "progress")) {
    pushSection({
      title: labels.sectionProgress,
      progressDetail,
      note: commentFor(project.comments, "progress") || undefined,
      groups: [],
      items: [],
    });
  }

  if (snap.statusUpdates.summaryGroups.length > 0) {
    pushSection({
      title: labels.sectionStatus,
      note: commentFor(project.comments, "statusUpdates") || undefined,
      groups: snap.statusUpdates.summaryGroups.map((group) => {
        const entries = group.unitEntries ?? [];
        return {
          heading: formatGroupHeading(group.statusLabel, entries.length, formatUnitCount),
          headingStyle: scopeStatusPdfBadgeStyle(group.scopeStage, group.scopeStatus),
          lines: entries.map((entry) => ({
            text: formatUnitEntryLine(entry, labels.locationProjectLevel),
            images: media
              ? statusImagesForPdfEntry(media.statusPhotoRows, entry, {
                  statusLabel: group.statusLabel,
                  scopeStage: group.scopeStage ? String(group.scopeStage) : undefined,
                  scopeStatus: group.scopeStatus ? String(group.scopeStatus) : undefined,
                })
              : entry.statusUpdateAttachments?.length
                ? entry.statusUpdateAttachments.map((a) => ({
                    storageUrl: a.storageUrl,
                    storageKey: a.storageKey,
                    mimeType: a.mimeType,
                    caption: a.caption,
                  }))
                : undefined,
          })),
        };
      }),
      items: [],
    });
  }

  if ((snap.subcontractors?.summaryGroups.length ?? 0) > 0) {
    pushSection({
      title: labels.sectionSubcontractors,
      note: commentFor(project.comments, "subcontractors") || undefined,
      groups: (snap.subcontractors?.summaryGroups ?? []).map((group) => ({
        heading: formatGroupHeading(group.subcontractorLabel, group.unitEntries.length, formatUnitCount),
        lines: group.unitEntries.map((entry) => ({
          text: formatUnitEntryLine(entry, labels.locationProjectLevel),
        })),
      })),
      items: [],
    });
  }

  if (snap.inspections.summaryGroups.length > 0) {
    pushSection({
      title: labels.sectionInspections,
      note: commentFor(project.comments, "inspections") || undefined,
      groups: snap.inspections.summaryGroups.map((group) => ({
        heading: formatGroupHeading(group.outcome, group.items.length, formatUnitCount),
        headingStyle: inspectionOutcomePdfBadgeStyle(group.outcome),
        lines: group.items.map((item) => {
          const location = item.locationLabel?.trim();
          const headline = item.headline?.trim() || labels.locationProjectLevel;
          const body = item.bodyText?.trim();
          const parts = [headline];
          if (location) parts.push(location);
          if (item.badge?.trim()) parts.push(item.badge.trim());

          const mapAttachments = (
            attachments: NonNullable<typeof item.attachments>,
          ): FieldDailyReportPdfMediaRef[] =>
            attachments.map((ref) => ({
              storageUrl: ref.storageUrl,
              storageKey: ref.storageKey,
              mimeType: ref.mimeType,
              caption: ref.caption,
            }));

          const detailBlocks = item.inspectionDetailBlocks?.length
            ? item.inspectionDetailBlocks.map((block) => ({
                heading: block.heading,
                lines: block.lines,
                images: block.attachments?.length
                  ? mapAttachments(block.attachments).map((ref) => ({
                      ...ref,
                      caption:
                        ref.caption?.trim().toLowerCase() === block.heading.trim().toLowerCase()
                          ? null
                          : ref.caption,
                    }))
                  : undefined,
              }))
            : undefined;

          const imagesFromItem = item.attachments?.map((ref) => ({
            storageUrl: ref.storageUrl,
            storageKey: ref.storageKey,
            mimeType: ref.mimeType,
            caption: ref.caption,
          }));
          const imagesFromMedia =
            item.submissionId && media
              ? media.inspectionImagesBySubmissionId.get(item.submissionId)
              : undefined;
          const images = detailBlocks?.length
            ? undefined
            : mergePdfMediaRefs(imagesFromItem, imagesFromMedia);

          return {
            text: parts.join(" — "),
            detailBlocks,
            detailLines:
              !detailBlocks?.length && body
                ? body.split("\n").map((line) => line.trim()).filter(Boolean)
                : undefined,
            images: images && images.length > 0 ? images : undefined,
          };
        }),
      })),
      items: [],
    });
  }

  if (snap.issues.items.length > 0) {
    pushSection({
      title: labels.sectionIssues,
      note: commentFor(project.comments, "issues") || undefined,
      groups: [],
      items: snap.issues.items.map((item) => {
        const detailLines = item.issueRecord
          ? buildIssuePdfDetailLines(item.issueRecord)
          : [item.badge, item.bodyText?.trim(), item.subline].filter(
              (line): line is string => Boolean(line?.trim()),
            );
        return {
          headline: item.headline,
          location: item.locationLabel,
          subline: item.issueRecord
            ? undefined
            : [item.badge, item.bodyText?.trim()].filter(Boolean).join(" · ") || undefined,
          detailLines: detailLines.length > 0 ? detailLines : undefined,
          images: media ? issueImagesFromSnapshotItem(item) : undefined,
        };
      }),
    });
  }

  if (snap.observations.items.length > 0) {
    pushSection({
      title: labels.sectionObservations,
      note: commentFor(project.comments, "observations") || undefined,
      groups: [],
      items: snap.observations.items.map((item) => {
        const detailLines = item.observationRecord
          ? buildObservationPdfDetailLines(item.observationRecord)
          : [item.bodyText?.trim(), item.subline].filter(
              (line): line is string => Boolean(line?.trim()),
            );
        return {
          headline: item.headline,
          location: item.locationLabel,
          subline: item.observationRecord ? undefined : item.bodyText?.trim() || undefined,
          detailLines: detailLines.length > 0 ? detailLines : undefined,
          images: media ? observationImagesFromSnapshotItem(item) : undefined,
        };
      }),
    });
  }

  pushSection(buildWorkforceSection(project, labels));

  const otherNote = commentFor(project.comments, "other");
  if (otherNote) {
    pushSection({
      title: labels.sectionOther,
      note: otherNote,
      groups: [],
      items: [],
    });
  }

  return sections;
}

function buildActivitySummary(
  counts: ReturnType<typeof buildHubActivityPreviewCounts>,
  labels: FieldDailyReportPdfLabels,
  formatPreviewLabel?: BuildFieldDailyReportPdfPayloadInput["formatPreviewLabel"],
): string {
  if (formatPreviewLabel) {
    const parts = [
      formatPreviewLabel("statusChanges", counts.statusChanges),
      formatPreviewLabel("inspections", counts.inspections),
    ];
    if (counts.issuesReported > 0) {
      parts.push(formatPreviewLabel("issuesReported", counts.issuesReported));
    }
    if (counts.otherActivity > 0) {
      parts.push(formatPreviewLabel("otherActivity", counts.otherActivity));
    }
    return parts.join(" · ");
  }
  return formatHubActivityPreviewLine(counts, labels.previewLabels);
}

function mapProjectEntry(
  project: FieldDailyReportProjectDto,
  labels: FieldDailyReportPdfLabels,
  locale: string,
  reportDateDisplay: string,
  exportedAtLabel: string,
  formatPreviewLabel?: BuildFieldDailyReportPdfPayloadInput["formatPreviewLabel"],
  formatUnitCount?: BuildFieldDailyReportPdfPayloadInput["formatUnitCount"],
  media?: FieldDailyReportExportMediaContext,
  activitySummaryOverride?: string,
): FieldDailyReportPdfProjectEntry {
  const counts = buildHubActivityPreviewCounts(project.snapshot);
  const hasFieldActivity = snapshotHasFieldActivity(project.snapshot);
  const legacyWorkforceBody = legacyWorkforceCommentBody(project.comments);
  const workforceMissing = isDailyManpowerMissing(project.dailyManpower, legacyWorkforceBody);
  const dailyManpowerCount = resolveDailyManpower(project.dailyManpower, legacyWorkforceBody);
  const generatedAtLabel = project.generatedAt
    ? `${labels.generatedAt} ${formatFieldDailyReportGeneratedAt(project.generatedAt, locale)}`
    : undefined;

  return {
    projectName: project.projectName,
    activitySummary:
      activitySummaryOverride ?? buildActivitySummary(counts, labels, formatPreviewLabel),
    hasFieldActivity,
    reportDateDisplay,
    exportedAtLabel: `${labels.exportedAtHeading}: ${exportedAtLabel}`,
    generatedAtLabel,
    progressNote: undefined,
    workforceManpowerHeaderLabel:
      dailyManpowerCount !== null
        ? formatWorkforceManpowerForPdf(labels.workforceDailyManpowerHeader, dailyManpowerCount)
        : workforceMissing
          ? labels.missingDailyManpowerAlert
          : undefined,
    workforceManpowerHeaderIsMissing: workforceMissing && dailyManpowerCount === null,
    missingDataAlerts: undefined,
    sections: hasFieldActivity
      ? buildProjectSections(project, labels, formatUnitCount, media)
      : [buildWorkforceSection(project, labels)],
    otherNote: hasFieldActivity ? undefined : commentFor(project.comments, "other") || undefined,
  };
}

export interface BuildFieldDailyReportPdfPayloadInput {
  reportDate: string;
  locale: string;
  labels: FieldDailyReportPdfLabels;
  projects: FieldDailyReportProjectDto[];
  filterSummary: string;
  exportedAt?: Date;
  formatPreviewLabel?: (
    key: keyof HubActivityPreviewLabelStrings,
    count: number,
  ) => string;
  formatUnitCount?: (count: number) => string;
  /** When set, embeds photo refs in the matching report sections. */
  media?: FieldDailyReportExportMediaContext;
  /** Pre-localized activity summary line (one project export). */
  activitySummary?: string;
}
export function buildFieldDailyReportPdfPayload(
  input: BuildFieldDailyReportPdfPayloadInput,
): FieldDailyReportPdfPayload {
  const exportedAt = input.exportedAt ?? new Date();
  const reportDateDisplay = formatFieldDailyReportDateLabel(input.reportDate, input.locale);
  const exportedAtDisplay = exportedAt.toLocaleString(input.locale, {
    dateStyle: "long",
    timeStyle: "short",
  });
  return {
    locale: input.locale,
    exportedAt: exportedAt.toISOString(),
    reportDate: input.reportDate,
    reportDateDisplay,
    filterSummary: input.filterSummary,
    labels: input.labels,
    projects: input.projects.map((project) =>
      mapProjectEntry(
        project,
        input.labels,
        input.locale,
        reportDateDisplay,
        exportedAtDisplay,
        input.formatPreviewLabel,
        input.formatUnitCount,
        input.media,
        input.activitySummary,
      ),
    ),
  };
}

import type { Prisma, PrismaClient } from "@prisma/client";
import type { FormLevel, FormTemplate, InspectionCategory } from "@/components/forms/formTypes";
import { db } from "@/lib/db";
import { loadFormVersionSectionsFromReporting } from "@/lib/inspections/form-reporting-structure";
import {
  isInspectionPayloadStub,
  isInspectionTemplateSnapshotStub,
} from "@/lib/inspections/inspection-submission-stubs";
import { resolveGridSubmissionCategory } from "@/lib/inspections/resolve-grid-submission-category";
import { categoryFromSubmissionSnapshot } from "@/lib/inspections/inspection-type-codes";
import { mergeInspectionAutoAppendix } from "@/lib/inspections/inspection-auto-appendix";

export { isInspectionPayloadStub, isInspectionTemplateSnapshotStub } from "@/lib/inspections/inspection-submission-stubs";

type PrismaReadClient = Pick<
  PrismaClient,
  | "inspectionAnswer"
  | "inspectionFormSection"
  | "inspectionFormQuestion"
  | "inspectionFormVersionSection"
  | "inspectionFormVersionQuestion"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export interface SubmissionViewInput {
  id: string;
  formId: string | null;
  formVersionId: string | null;
  templateSnapshot: unknown;
  payload: unknown;
  source: "FORM" | "BACKFILL";
  form?: {
    id: string;
    name: string;
    category: string;
    level: string;
    scopeTypeCodes: string[];
    description: string | null;
  } | null;
}

interface HydratedSubmissionView {
  templateSnapshot: unknown;
  payload: Record<string, unknown>;
}

function mediaItemFromRow(row: {
  storageUrl: string;
  storageKey: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  localUrl: string | null;
  caption: string | null;
  imageAnnotation: Prisma.JsonValue | null;
}): Record<string, unknown> {
  return {
    storageUrl: row.storageUrl,
    ...(row.storageKey ? { storageKey: row.storageKey } : {}),
    ...(row.mimeType ? { mimeType: row.mimeType } : {}),
    ...(row.fileSizeBytes != null ? { fileSizeBytes: row.fileSizeBytes } : {}),
    ...(row.localUrl ? { localUrl: row.localUrl } : {}),
    ...(row.caption ? { caption: row.caption } : {}),
    ...(row.imageAnnotation != null ? { imageAnnotation: row.imageAnnotation } : {}),
  };
}

function capturedFileHasRemoteUrl(item: unknown): boolean {
  if (!isRecord(item)) return false;
  const url =
    (typeof item.storageUrl === "string" && item.storageUrl.trim()) ||
    (typeof item.serverUrl === "string" && item.serverUrl.trim()) ||
    (typeof item.url === "string" && item.url.trim()) ||
    "";
  return url.length > 0;
}

function mergeRelationalMediaIntoPayload(
  payload: Record<string, unknown>,
  answerMedia: Array<Parameters<typeof mediaItemFromRow>[0]>,
): Record<string, unknown> {
  if (answerMedia.length === 0) return payload;
  const existing = Array.isArray(payload.capturedFiles) ? payload.capturedFiles : [];
  if (existing.some(capturedFileHasRemoteUrl)) return payload;
  return { ...payload, capturedFiles: answerMedia.map(mediaItemFromRow) };
}

function answerPayloadFromRow(answer: {
  questionId: string;
  choiceValue: string | null;
  choicesValue: string[];
  textValue: string | null;
  numberValue: Prisma.Decimal | null;
  ratingValue: number | null;
  rawAnswer: Prisma.JsonValue;
  answerMedia: Array<{
    storageUrl: string;
    storageKey: string | null;
    mimeType: string | null;
    fileSizeBytes: number | null;
    localUrl: string | null;
    caption: string | null;
    imageAnnotation: Prisma.JsonValue | null;
  }>;
  deficiencies: Array<{
    sourceDeficiencyId: string;
    description: string;
    severity: string | null;
    count: number;
    media: Array<{
      storageUrl: string;
      storageKey: string | null;
      mimeType: string | null;
      fileSizeBytes: number | null;
      localUrl: string | null;
      caption: string | null;
      imageAnnotation: Prisma.JsonValue | null;
    }>;
  }>;
}): Record<string, unknown> {
  if (!isInspectionPayloadStub(answer.rawAnswer)) {
    return mergeRelationalMediaIntoPayload(
      answer.rawAnswer as Record<string, unknown>,
      answer.answerMedia,
    );
  }

  const payload: Record<string, unknown> = {};
  if (answer.choiceValue) payload.choice = answer.choiceValue;
  if (answer.choicesValue.length > 0) payload.choices = answer.choicesValue;
  if (answer.textValue) payload.text = answer.textValue;
  if (answer.numberValue != null) payload.number = String(answer.numberValue);
  if (answer.ratingValue != null) payload.rating = answer.ratingValue;

  if (answer.answerMedia.length > 0) {
    payload.capturedFiles = answer.answerMedia.map(mediaItemFromRow);
  }

  if (answer.deficiencies.length > 0) {
    payload.deficiencies = answer.deficiencies.map((deficiency) => ({
      id: deficiency.sourceDeficiencyId,
      description: deficiency.description,
      ...(deficiency.severity ? { severity: deficiency.severity } : {}),
      count: deficiency.count,
      ...(deficiency.media.length > 0
        ? { capturedFiles: deficiency.media.map(mediaItemFromRow) }
        : {}),
    }));
  }

  return payload;
}

/**
 * Rebuild templateSnapshot and payload from relational rows when JSON columns
 * hold stubs (new submissions after the relational cutover).
 */
export async function hydrateInspectionSubmissionView(
  submission: SubmissionViewInput,
  client: PrismaReadClient = db
): Promise<HydratedSubmissionView> {
  const needsTemplate = isInspectionTemplateSnapshotStub(submission.templateSnapshot);
  const needsPayload = isInspectionPayloadStub(submission.payload);

  if (!needsTemplate && !needsPayload) {
    const payload = isRecord(submission.payload) ? submission.payload : {};
    return {
      templateSnapshot: submission.templateSnapshot,
      payload: mergeInspectionAutoAppendix(payload, submission.payload),
    };
  }

  if (submission.source === "BACKFILL" || !submission.formVersionId) {
    const payload = isRecord(submission.payload) ? submission.payload : {};
    return {
      templateSnapshot: submission.templateSnapshot,
      payload: mergeInspectionAutoAppendix(payload, submission.payload),
    };
  }

  const answers = needsPayload
    ? await client.inspectionAnswer.findMany({
        where: { inspectionSubmissionId: submission.id },
        include: {
          answerMedia: true,
          deficiencies: { include: { media: true } },
        },
      })
    : [];

  let templateSnapshot: unknown = submission.templateSnapshot;
  if (needsTemplate) {
    const sections = await loadFormVersionSectionsFromReporting(submission.formVersionId, client);
    const form = submission.form;
    const stubCategory = categoryFromSubmissionSnapshot(submission.templateSnapshot);
    const category = (
      stubCategory === "CALIBRATION_INSPECTION"
        ? "CALIBRATION_INSPECTION"
        : (resolveGridSubmissionCategory(submission.templateSnapshot, form?.category) ??
          form?.category ??
          "OTHER")
    ) as InspectionCategory;

    const template: FormTemplate = {
      id: form?.id ?? submission.formId,
      name: form?.name ?? "Inspection",
      description: form?.description ?? "",
      status: "published",
      level: (form?.level ?? "scope") as FormLevel,
      scopeTypeCodes: form?.scopeTypeCodes ?? [],
      category,
      sections,
      latestVersionId: submission.formVersionId,
    };
    templateSnapshot = template;
  }

  let payload: Record<string, unknown> = {};
  if (needsPayload) {
    for (const answer of answers) {
      payload[answer.questionId] = answerPayloadFromRow(answer);
    }
  } else if (isRecord(submission.payload)) {
    payload = submission.payload;
  }

  return {
    templateSnapshot,
    payload: mergeInspectionAutoAppendix(payload, submission.payload),
  };
}

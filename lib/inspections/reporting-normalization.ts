import type { Prisma, PrismaClient } from "@prisma/client";
import {
  inferFieldMediaMimeType,
  storageKeyFromFieldMediaUrl,
} from "@/lib/pdf/field-media-mime-infer";
import { AUTO_MEDIA_KEY, AUTO_NOTES_KEY } from "@/components/forms/formTypes";
import type { FormQuestion } from "@/components/forms/formTypes";
import {
  followUpPayloadKey,
  getChoiceFollowUps,
  type ChoiceFollowUpTrigger,
} from "@/lib/forms/choice-follow-ups";
import { db } from "@/lib/db";

type PrismaWriteClient = PrismaClient | Prisma.TransactionClient;

/** Stored on new inspection submissions while relational rows are authoritative. */
export const INSPECTION_JSON_STUB: Prisma.InputJsonValue = {};

export function buildInspectionCategoryStub(category: string): Prisma.InputJsonValue {
  return { category };
}

export class MissingFormVersionQuestionError extends Error {
  constructor(questionId: string) {
    super(`Missing formVersionQuestionId for question "${questionId}"`);
    this.name = "MissingFormVersionQuestionError";
  }
}

interface SyncFormStructureInput {
  formId: string;
  sections: unknown;
}

interface SyncFormVersionStructureInput {
  formVersionId: string;
  sections: unknown;
}

interface ReplaceInspectionAnswersInput {
  inspectionSubmissionId: string;
  formVersionId?: string | null;
  templateSnapshot: unknown;
  payload: unknown;
}

interface NormalizedSection {
  sourceSectionId: string;
  title: string;
  description: string | null;
  displayOrder: number;
  questions: NormalizedQuestion[];
}

interface NormalizedQuestion {
  sourceQuestionId: string;
  sourceSectionId: string;
  title: string;
  description: string | null;
  responseType: string;
  options: Prisma.InputJsonValue | null;
  required: boolean;
  photoRequired: boolean;
  deficiencyPhotoRequired: boolean;
  deficiencyDescriptionEnabled: boolean | null;
  isFailFollowUp: boolean;
  sourceParentQuestionId: string | null;
  parentQuestionTitle: string | null;
  displayOrder: number;
  rawQuestion: Prisma.InputJsonValue;
}

interface QuestionMetadata extends NormalizedQuestion {
  sectionTitle: string | null;
}

interface ExtractedInspectionAnswer {
  questionId: string;
  questionTitle: string;
  sectionId: string | null;
  sectionTitle: string | null;
  responseType: string;
  isFailFollowUp: boolean;
  sourceParentQuestionId: string | null;
  parentQuestionTitle: string | null;
  choiceValue: string | null;
  choicesValue: string[];
  textValue: string | null;
  numberValue: string | null;
  ratingValue: number | null;
  rawAnswer: Prisma.InputJsonValue;
  isFailed: boolean;
  isNotApplicable: boolean;
  hasDeficiencies: boolean;
  deficiencyCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sectionsFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.sections)) return value.sections;
  return [];
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return {};
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value) || isRecord(value)) return value as Prisma.InputJsonValue;
  return {};
}

function numberStringOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim().length > 0 && Number.isFinite(Number(value))) {
    return value;
  }
  return null;
}

function intOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function deficiencyCountFrom(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.reduce((sum, item) => {
    if (!isRecord(item)) return sum;
    const rawCount = typeof item.count === "number" && Number.isFinite(item.count) ? item.count : 1;
    return sum + Math.max(1, Math.trunc(rawCount));
  }, 0);
}

function normalizeQuestion(
  rawQuestion: unknown,
  section: Pick<NormalizedSection, "sourceSectionId">,
  displayOrder: number,
  followUpParent?: {
    sourceQuestionId: string;
    title: string;
    trigger?: ChoiceFollowUpTrigger;
  }
): NormalizedQuestion | null {
  if (!isRecord(rawQuestion)) return null;

  const rawQuestionId = stringOrNull(rawQuestion.id);
  const sourceQuestionId = followUpParent
    ? followUpPayloadKey(followUpParent.sourceQuestionId, followUpParent.trigger ?? "fail")
    : rawQuestionId;
  if (!sourceQuestionId) return null;

  return {
    sourceQuestionId,
    sourceSectionId: section.sourceSectionId,
    title: stringOrFallback(rawQuestion.title, sourceQuestionId),
    description: stringOrNull(rawQuestion.description),
    responseType: stringOrFallback(rawQuestion.responseType, "UNKNOWN"),
    options: Array.isArray(rawQuestion.options) ? rawQuestion.options as Prisma.InputJsonValue : null,
    required: booleanOrDefault(rawQuestion.required, false),
    photoRequired: booleanOrDefault(rawQuestion.photoRequired, false),
    deficiencyPhotoRequired: booleanOrDefault(rawQuestion.deficiencyPhotoRequired, false),
    deficiencyDescriptionEnabled:
      typeof rawQuestion.deficiencyDescriptionEnabled === "boolean"
        ? rawQuestion.deficiencyDescriptionEnabled
        : null,
    isFailFollowUp: Boolean(followUpParent),
    sourceParentQuestionId: followUpParent?.sourceQuestionId ?? null,
    parentQuestionTitle: followUpParent?.title ?? null,
    displayOrder,
    rawQuestion: jsonValue(rawQuestion),
  };
}

export function normalizeFormSections(sectionsInput: unknown): NormalizedSection[] {
  return sectionsFrom(sectionsInput).map((rawSection, sectionIndex) => {
    const sectionRecord = isRecord(rawSection) ? rawSection : {};
    const sourceSectionId = stringOrFallback(sectionRecord.id, `section-${sectionIndex + 1}`);
    const questions: NormalizedQuestion[] = [];
    const normalizedSection: NormalizedSection = {
      sourceSectionId,
      title: stringOrFallback(sectionRecord.title, `Section ${sectionIndex + 1}`),
      description: stringOrNull(sectionRecord.description),
      displayOrder: sectionIndex,
      questions,
    };

    if (Array.isArray(sectionRecord.questions)) {
      sectionRecord.questions.forEach((rawQuestion, questionIndex) => {
        const question = normalizeQuestion(rawQuestion, normalizedSection, questionIndex);
        if (!question) return;
        questions.push(question);

        if (isRecord(rawQuestion)) {
          const followUps = getChoiceFollowUps(rawQuestion as unknown as FormQuestion);
          let followUpOffset = 0;
          for (const trigger of ["yes", "no", "na", "pass", "fail"] as const) {
            const followUpRaw = followUps[trigger];
            if (!followUpRaw || !isRecord(followUpRaw)) continue;
            const followUp = normalizeQuestion(
              followUpRaw,
              normalizedSection,
              questionIndex + 10_000 + followUpOffset,
              {
                sourceQuestionId: question.sourceQuestionId,
                title: question.title,
                trigger,
              },
            );
            followUpOffset += 1;
            if (followUp) questions.push(followUp);
          }
        }
      });
    }

    return normalizedSection;
  });
}

export async function syncFormReportingStructure(
  input: SyncFormStructureInput,
  client: PrismaWriteClient = db
): Promise<number> {
  const sections = normalizeFormSections(input.sections);
  await client.inspectionFormSection.deleteMany({ where: { formId: input.formId } });

  let questionCount = 0;
  for (const section of sections) {
    const createdSection = await client.inspectionFormSection.create({
      data: {
        formId: input.formId,
        sourceSectionId: section.sourceSectionId,
        title: section.title,
        description: section.description,
        displayOrder: section.displayOrder,
      },
      select: { id: true },
    });

    for (const question of section.questions) {
      await client.inspectionFormQuestion.create({
        data: {
          formId: input.formId,
          sectionId: createdSection.id,
          sourceQuestionId: question.sourceQuestionId,
          sourceSectionId: question.sourceSectionId,
          title: question.title,
          description: question.description,
          responseType: question.responseType,
          options: question.options ?? undefined,
          required: question.required,
          photoRequired: question.photoRequired,
          deficiencyPhotoRequired: question.deficiencyPhotoRequired,
          deficiencyDescriptionEnabled: question.deficiencyDescriptionEnabled,
          isFailFollowUp: question.isFailFollowUp,
          sourceParentQuestionId: question.sourceParentQuestionId,
          parentQuestionTitle: question.parentQuestionTitle,
          displayOrder: question.displayOrder,
          rawQuestion: question.rawQuestion,
        },
      });
      questionCount++;
    }
  }

  return questionCount;
}

export async function syncFormVersionReportingStructure(
  input: SyncFormVersionStructureInput,
  client: PrismaWriteClient = db
): Promise<number> {
  const sections = normalizeFormSections(input.sections);
  await client.inspectionFormVersionSection.deleteMany({
    where: { formVersionId: input.formVersionId },
  });

  let questionCount = 0;
  for (const section of sections) {
    const createdSection = await client.inspectionFormVersionSection.create({
      data: {
        formVersionId: input.formVersionId,
        sourceSectionId: section.sourceSectionId,
        title: section.title,
        description: section.description,
        displayOrder: section.displayOrder,
      },
      select: { id: true },
    });

    for (const question of section.questions) {
      await client.inspectionFormVersionQuestion.create({
        data: {
          formVersionId: input.formVersionId,
          sectionId: createdSection.id,
          sourceQuestionId: question.sourceQuestionId,
          sourceSectionId: question.sourceSectionId,
          title: question.title,
          description: question.description,
          responseType: question.responseType,
          options: question.options ?? undefined,
          required: question.required,
          photoRequired: question.photoRequired,
          deficiencyPhotoRequired: question.deficiencyPhotoRequired,
          deficiencyDescriptionEnabled: question.deficiencyDescriptionEnabled,
          isFailFollowUp: question.isFailFollowUp,
          sourceParentQuestionId: question.sourceParentQuestionId,
          parentQuestionTitle: question.parentQuestionTitle,
          displayOrder: question.displayOrder,
          rawQuestion: question.rawQuestion,
        },
      });
      questionCount++;
    }
  }

  return questionCount;
}

function questionMetadataById(templateSnapshot: unknown): Map<string, QuestionMetadata> {
  const metadata = new Map<string, QuestionMetadata>();

  for (const section of normalizeFormSections(templateSnapshot)) {
    for (const question of section.questions) {
      metadata.set(question.sourceQuestionId, {
        ...question,
        sectionTitle: section.title,
      });
    }
  }

  return metadata;
}

export function extractInspectionAnswers(input: ReplaceInspectionAnswersInput): ExtractedInspectionAnswer[] {
  if (!isRecord(input.payload)) return [];

  const metadata = questionMetadataById(input.templateSnapshot);
  return Object.entries(input.payload)
    .filter(([questionId]) => questionId !== AUTO_NOTES_KEY && questionId !== AUTO_MEDIA_KEY)
    .map(([questionId, rawAnswer]) => {
    const answerRecord = isRecord(rawAnswer) ? rawAnswer : {};
    const question = metadata.get(questionId);
    const choiceValue = stringOrNull(answerRecord.choice);
    const choiceLower = choiceValue?.toLowerCase() ?? null;
    const deficiencyCount = deficiencyCountFrom(answerRecord.deficiencies);

    return {
      questionId,
      questionTitle: question?.title ?? questionId,
      sectionId: question?.sourceSectionId ?? null,
      sectionTitle: question?.sectionTitle ?? null,
      responseType: question?.responseType ?? "UNKNOWN",
      // Legacy submissions store follow-up answers under `${parentQuestionId}__followup`
      // or `${parentQuestionId}__followup__{trigger}` for multi-trigger follow-ups.
      isFailFollowUp:
        question?.isFailFollowUp ??
        (questionId.endsWith("__followup") || questionId.includes("__followup__")),
      sourceParentQuestionId: question?.sourceParentQuestionId ?? null,
      parentQuestionTitle: question?.parentQuestionTitle ?? null,
      choiceValue,
      choicesValue: Array.isArray(answerRecord.choices)
        ? answerRecord.choices.filter((choice): choice is string => typeof choice === "string")
        : [],
      textValue: stringOrNull(answerRecord.text) ?? (typeof rawAnswer === "string" ? rawAnswer : null),
      numberValue: numberStringOrNull(answerRecord.number),
      ratingValue: intOrNull(answerRecord.rating),
      rawAnswer: jsonValue(rawAnswer),
      isFailed: choiceLower === "fail" || choiceLower === "no",
      isNotApplicable: choiceLower === "na" || choiceLower === "n/a",
      hasDeficiencies: deficiencyCount > 0,
      deficiencyCount,
    };
  });
}

interface ExtractedAnswerMedia {
  storageUrl: string;
  storageKey: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  localUrl: string | null;
  caption: string | null;
  imageAnnotation: Prisma.InputJsonValue | null;
}

function extractAnswerMedia(rawAnswer: unknown): ExtractedAnswerMedia[] {
  if (!isRecord(rawAnswer) || !Array.isArray(rawAnswer.capturedFiles)) return [];
  const media: ExtractedAnswerMedia[] = [];
  for (const item of rawAnswer.capturedFiles) {
    if (!isRecord(item)) continue;
    const storageUrl =
      stringOrNull(item.storageUrl) ??
      stringOrNull(item.serverUrl) ??
      stringOrNull(item.url);
    if (!storageUrl) continue;
    const storageKey = stringOrNull(item.storageKey) ?? storageKeyFromFieldMediaUrl(storageUrl);
    media.push({
      storageUrl,
      storageKey,
      mimeType:
        stringOrNull(item.mimeType) ??
        inferFieldMediaMimeType({ storageUrl, storageKey, mimeType: null }),
      fileSizeBytes:
        typeof item.fileSizeBytes === "number" && Number.isFinite(item.fileSizeBytes)
          ? Math.trunc(item.fileSizeBytes)
          : null,
      localUrl: stringOrNull(item.localUrl),
      caption: stringOrNull(item.caption),
      imageAnnotation: isRecord(item.imageAnnotation) || Array.isArray(item.imageAnnotation)
        ? (item.imageAnnotation as Prisma.InputJsonValue)
        : null,
    });
  }
  return media;
}

export async function replaceInspectionAnswerMedia(
  input: {
    answerIdByQuestionId: Map<string, string>;
    payload: unknown;
  },
  client: PrismaWriteClient = db
): Promise<void> {
  if (!isRecord(input.payload)) return;

  for (const [questionId, answerId] of input.answerIdByQuestionId) {
    const rawAnswer = input.payload[questionId];
    const mediaItems = extractAnswerMedia(rawAnswer);
    if (mediaItems.length === 0) continue;

    try {
      await client.inspectionAnswerMedia.deleteMany({ where: { inspectionAnswerId: answerId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("inspection_answer_media") || !message.includes("does not exist")) {
        throw error;
      }
      // Table not migrated yet — skip media rows until inspection_answer_media exists.
      continue;
    }

    for (const media of mediaItems) {
      await client.inspectionAnswerMedia.create({
        data: {
          inspectionAnswerId: answerId,
          storageUrl: media.storageUrl,
          storageKey: media.storageKey,
          mimeType: media.mimeType,
          fileSizeBytes: media.fileSizeBytes,
          localUrl: media.localUrl,
          caption: media.caption,
          imageAnnotation: media.imageAnnotation ?? undefined,
        },
      });
    }
  }
}

export async function replaceInspectionAnswers(
  input: ReplaceInspectionAnswersInput,
  client: PrismaWriteClient = db
): Promise<Map<string, string>> {
  const answers = extractInspectionAnswers(input);
  const versionQuestions = input.formVersionId
    ? await client.inspectionFormVersionQuestion.findMany({
        where: { formVersionId: input.formVersionId },
        select: { id: true, sourceQuestionId: true },
      })
    : [];
  const versionQuestionIdBySourceId = new Map(
    versionQuestions.map((question) => [question.sourceQuestionId, question.id])
  );

  await client.inspectionAnswer.deleteMany({
    where: { inspectionSubmissionId: input.inspectionSubmissionId },
  });

  const answerIdByQuestionId = new Map<string, string>();
  for (const answer of answers) {
    const formVersionQuestionId = input.formVersionId
      ? versionQuestionIdBySourceId.get(answer.questionId)
      : undefined;
    if (input.formVersionId && !formVersionQuestionId) {
      throw new MissingFormVersionQuestionError(answer.questionId);
    }

    const created = await client.inspectionAnswer.create({
      data: {
        inspectionSubmissionId: input.inspectionSubmissionId,
        formVersionQuestionId: formVersionQuestionId!,
        questionId: answer.questionId,
        choiceValue: answer.choiceValue,
        choicesValue: answer.choicesValue,
        textValue: answer.textValue,
        numberValue: answer.numberValue,
        ratingValue: answer.ratingValue,
        rawAnswer: answer.rawAnswer,
        isFailed: answer.isFailed,
        isNotApplicable: answer.isNotApplicable,
        hasDeficiencies: answer.hasDeficiencies,
        deficiencyCount: answer.deficiencyCount,
      },
      select: { id: true, questionId: true },
    });
    answerIdByQuestionId.set(created.questionId, created.id);
  }

  await replaceInspectionAnswerMedia(
    { answerIdByQuestionId, payload: input.payload },
    client
  );

  return answerIdByQuestionId;
}

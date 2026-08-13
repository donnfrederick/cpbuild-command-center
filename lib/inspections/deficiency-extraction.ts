import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

type PrismaWriteClient = PrismaClient | Prisma.TransactionClient;

interface ExtractionInput {
  inspectionSubmissionId: string;
  templateSnapshot: unknown;
  payload: unknown;
}

interface ReplaceInspectionDeficienciesInput extends ExtractionInput {
  answerIdByQuestionId: Map<string, string>;
}

export interface ExtractedInspectionDeficiencyMedia {
  storageUrl: string;
  storageKey: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  localUrl: string | null;
  caption: string | null;
  imageAnnotation: Prisma.InputJsonValue | null;
}

export interface ExtractedInspectionDeficiency {
  questionId: string;
  questionTitle: string;
  sourceDeficiencyId: string;
  description: string;
  severity: string | null;
  count: number;
  media: ExtractedInspectionDeficiencyMedia[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function intOrDefault(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

function jsonOrNull(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value) || isRecord(value)) return value as Prisma.InputJsonValue;
  return null;
}

function buildQuestionTitleMap(templateSnapshot: unknown): Map<string, string> {
  const titles = new Map<string, string>();
  if (!isRecord(templateSnapshot) || !Array.isArray(templateSnapshot.sections)) return titles;

  for (const section of templateSnapshot.sections) {
    if (!isRecord(section) || !Array.isArray(section.questions)) continue;
    for (const question of section.questions) {
      if (!isRecord(question)) continue;
      const id = stringOrNull(question.id);
      if (!id) continue;
      const title = stringOrNull(question.title) ?? id;
      titles.set(id, title);
    }
  }

  return titles;
}

function storageKeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const key = parsed.searchParams.get("key");
    if (key) return decodeURIComponent(key);

    const marker = "/field-media/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      return `field-media/${parsed.pathname.slice(markerIndex + marker.length)}`;
    }
  } catch {
    const marker = "field-media/";
    const markerIndex = url.indexOf(marker);
    if (markerIndex >= 0) return url.slice(markerIndex).split(/[?#]/)[0] ?? null;
  }
  return null;
}

function extractMedia(value: unknown): ExtractedInspectionDeficiencyMedia[] {
  if (!Array.isArray(value)) return [];
  const media: ExtractedInspectionDeficiencyMedia[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;
    const serverUrl = stringOrNull(item.serverUrl);
    const storageUrl = stringOrNull(item.storageUrl) ?? serverUrl ?? stringOrNull(item.localUrl);
    if (!storageUrl) continue;

    media.push({
      storageUrl,
      storageKey: stringOrNull(item.storageKey) ?? storageKeyFromUrl(storageUrl),
      mimeType: stringOrNull(item.mimeType),
      fileSizeBytes: intOrDefault(item.fileSizeBytes, 0) || null,
      localUrl: stringOrNull(item.localUrl),
      caption: stringOrNull(item.caption),
      imageAnnotation: jsonOrNull(item.imageAnnotation),
    });
  }

  return media;
}

export function extractInspectionDeficiencies(input: ExtractionInput): ExtractedInspectionDeficiency[] {
  if (!isRecord(input.payload)) return [];

  const questionTitles = buildQuestionTitleMap(input.templateSnapshot);
  const deficiencies: ExtractedInspectionDeficiency[] = [];

  for (const [questionId, answer] of Object.entries(input.payload)) {
    if (!isRecord(answer)) continue;
    const choice = stringOrNull(answer.choice)?.toLowerCase();
    if (choice !== "fail") continue;
    if (!Array.isArray(answer.deficiencies)) continue;

    answer.deficiencies.forEach((rawDeficiency, index) => {
      if (!isRecord(rawDeficiency)) return;
      const sourceDeficiencyId = stringOrNull(rawDeficiency.id) ?? `legacy-${questionId}-${index + 1}`;
      deficiencies.push({
        questionId,
        questionTitle: questionTitles.get(questionId) ?? questionId,
        sourceDeficiencyId,
        description: stringOrNull(rawDeficiency.description) ?? "",
        severity: stringOrNull(rawDeficiency.severity),
        count: intOrDefault(rawDeficiency.count, 1),
        media: extractMedia(rawDeficiency.capturedFiles),
      });
    });
  }

  return deficiencies;
}

export async function replaceInspectionDeficiencies(
  input: ReplaceInspectionDeficienciesInput,
  client: PrismaWriteClient = db
): Promise<number> {
  const deficiencies = extractInspectionDeficiencies(input);

  await client.inspectionDeficiency.deleteMany({
    where: {
      inspectionAnswer: {
        inspectionSubmissionId: input.inspectionSubmissionId,
      },
    },
  });

  let createdCount = 0;
  for (const deficiency of deficiencies) {
    const inspectionAnswerId = input.answerIdByQuestionId.get(deficiency.questionId);
    if (!inspectionAnswerId) continue;

    await client.inspectionDeficiency.create({
      data: {
        inspectionAnswerId,
        sourceDeficiencyId: deficiency.sourceDeficiencyId,
        description: deficiency.description,
        severity: deficiency.severity,
        count: deficiency.count,
        media: {
          create: deficiency.media.map((media) => ({
            storageUrl: media.storageUrl,
            storageKey: media.storageKey,
            mimeType: media.mimeType,
            fileSizeBytes: media.fileSizeBytes,
            localUrl: media.localUrl,
            caption: media.caption,
            imageAnnotation: media.imageAnnotation ?? undefined,
          })),
        },
      },
    });
    createdCount++;
  }

  return createdCount;
}

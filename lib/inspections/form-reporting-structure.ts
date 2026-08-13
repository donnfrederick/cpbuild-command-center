import type { Prisma, PrismaClient } from "@prisma/client";
import type { FormQuestion, FormSection, FormTemplate } from "@/components/forms/formTypes";
import {
  normalizeFormQuestion,
  rebuildChoiceFollowUpsFromMirrorRows,
} from "@/lib/forms/choice-follow-ups";
import { db } from "@/lib/db";

type PrismaReadClient = Pick<
  PrismaClient,
  | "inspectionFormSection"
  | "inspectionFormQuestion"
  | "inspectionFormVersionSection"
  | "inspectionFormVersionQuestion"
>;

type PrismaWriteClient = PrismaReadClient | Prisma.TransactionClient;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionsFromJson(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function questionFromRow(row: {
  sourceQuestionId: string;
  title: string;
  description: string | null;
  responseType: string;
  options: Prisma.JsonValue | null;
  required: boolean;
  photoRequired: boolean;
  deficiencyPhotoRequired: boolean;
  deficiencyDescriptionEnabled: boolean | null;
  rawQuestion: Prisma.JsonValue;
}): FormQuestion {
  const raw = row.rawQuestion;
  if (isRecord(raw) && typeof raw.id === "string") {
    return raw as unknown as FormQuestion;
  }

  return {
    id: row.sourceQuestionId,
    title: row.title,
    description: row.description ?? "",
    responseType: row.responseType as FormQuestion["responseType"],
    required: row.required,
    photoRequired: row.photoRequired,
    deficiencyPhotoRequired: row.deficiencyPhotoRequired,
    deficiencyDescriptionEnabled: row.deficiencyDescriptionEnabled ?? undefined,
    options: optionsFromJson(row.options),
  };
}

type MirroredSectionRow = {
  sourceSectionId: string;
  title: string;
  description: string | null;
  questions: Array<{
    sourceQuestionId: string;
    title: string;
    description: string | null;
    responseType: string;
    options: Prisma.JsonValue | null;
    required: boolean;
    photoRequired: boolean;
    deficiencyPhotoRequired: boolean;
    deficiencyDescriptionEnabled: boolean | null;
    rawQuestion: Prisma.JsonValue;
    isFailFollowUp: boolean;
    sourceParentQuestionId: string | null;
  }>;
};

function mirroredSectionRowsToFormSections(rows: MirroredSectionRow[]): FormSection[] {
  return rows.map((section) => {
    const parentQuestions = section.questions.filter((q) => !q.isFailFollowUp);
    const followUpsByParent = new Map<string, (typeof section.questions)[number][]>();
    for (const q of section.questions) {
      if (q.isFailFollowUp && q.sourceParentQuestionId) {
        const list = followUpsByParent.get(q.sourceParentQuestionId) ?? [];
        list.push(q);
        followUpsByParent.set(q.sourceParentQuestionId, list);
      }
    }

    return {
      id: section.sourceSectionId,
      title: section.title,
      description: section.description ?? undefined,
      questions: parentQuestions.map((q) => {
        const followUpRows = followUpsByParent.get(q.sourceQuestionId) ?? [];
        const choiceFollowUps = rebuildChoiceFollowUpsFromMirrorRows(
          q.sourceQuestionId,
          followUpRows.map((row) => ({
            sourceQuestionId: row.sourceQuestionId,
            rawQuestion: row.rawQuestion,
          })),
        );
        const base = questionFromRow(q);
        if (Object.keys(choiceFollowUps).length === 0) {
          return base;
        }
        return normalizeFormQuestion({ ...base, choiceFollowUps });
      }),
    };
  });
}

/**
 * Load draft form structure from relational mirror tables.
 * Returns empty array when no rows exist (caller may fall back to legacy JSON).
 */
export async function loadFormSectionsFromReporting(
  formId: string,
  client: PrismaReadClient = db
): Promise<FormSection[]> {
  const map = await loadFormSectionsFromReportingBatch([formId], client);
  return map.get(formId) ?? [];
}

/** Batch-load draft sections for many forms (two queries total, not N+1). */
export async function loadFormSectionsFromReportingBatch(
  formIds: string[],
  client: PrismaReadClient = db
): Promise<Map<string, FormSection[]>> {
  const result = new Map<string, FormSection[]>();
  if (formIds.length === 0) return result;

  const sections = await client.inspectionFormSection.findMany({
    where: { formId: { in: formIds } },
    orderBy: [{ formId: "asc" }, { displayOrder: "asc" }],
    include: {
      questions: { orderBy: { displayOrder: "asc" } },
    },
  });

  const byFormId = new Map<string, MirroredSectionRow[]>();
  for (const section of sections) {
    const list = byFormId.get(section.formId) ?? [];
    list.push(section);
    byFormId.set(section.formId, list);
  }

  for (const formId of formIds) {
    const rows = byFormId.get(formId) ?? [];
    result.set(formId, rows.length > 0 ? mirroredSectionRowsToFormSections(rows) : []);
  }

  return result;
}

/** Load published version structure from relational mirror tables. */
export async function loadFormVersionSectionsFromReporting(
  formVersionId: string,
  client: PrismaReadClient = db
): Promise<FormSection[]> {
  const map = await loadFormVersionSectionsFromReportingBatch([formVersionId], client);
  return map.get(formVersionId) ?? [];
}

/** Batch-load published version sections for many form versions (two queries total). */
export async function loadFormVersionSectionsFromReportingBatch(
  formVersionIds: string[],
  client: PrismaReadClient = db
): Promise<Map<string, FormSection[]>> {
  const result = new Map<string, FormSection[]>();
  if (formVersionIds.length === 0) return result;

  const sections = await client.inspectionFormVersionSection.findMany({
    where: { formVersionId: { in: formVersionIds } },
    orderBy: [{ formVersionId: "asc" }, { displayOrder: "asc" }],
    include: {
      questions: { orderBy: { displayOrder: "asc" } },
    },
  });

  const byVersionId = new Map<string, MirroredSectionRow[]>();
  for (const section of sections) {
    const list = byVersionId.get(section.formVersionId) ?? [];
    list.push(section);
    byVersionId.set(section.formVersionId, list);
  }

  for (const formVersionId of formVersionIds) {
    const rows = byVersionId.get(formVersionId) ?? [];
    result.set(formVersionId, rows.length > 0 ? mirroredSectionRowsToFormSections(rows) : []);
  }

  return result;
}

/** Count draft questions in relational mirror (excludes fail-follow-up rows). */
export async function countFormDraftQuestions(
  formId: string,
  client: PrismaReadClient = db
): Promise<number> {
  return client.inspectionFormQuestion.count({
    where: { formId, isFailFollowUp: false },
  });
}

/** Count version mirror questions after publish — gate for fail-loudly check. */
export async function countFormVersionQuestions(
  formVersionId: string,
  client: PrismaReadClient = db
): Promise<number> {
  return client.inspectionFormVersionQuestion.count({
    where: { formVersionId, isFailFollowUp: false },
  });
}

/**
 * Copy draft relational structure into an immutable version mirror.
 * Used on publish/save-version instead of re-parsing JSON.
 */
export async function copyFormDraftToVersionReporting(
  formId: string,
  formVersionId: string,
  client: PrismaWriteClient = db
): Promise<number> {
  const draftSections = await client.inspectionFormSection.findMany({
    where: { formId },
    orderBy: { displayOrder: "asc" },
    include: {
      questions: { orderBy: { displayOrder: "asc" } },
    },
  });

  await client.inspectionFormVersionSection.deleteMany({ where: { formVersionId } });

  let questionCount = 0;
  for (const section of draftSections) {
    const versionSection = await client.inspectionFormVersionSection.create({
      data: {
        formVersionId,
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
          formVersionId,
          sectionId: versionSection.id,
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
          rawQuestion: question.rawQuestion as Prisma.InputJsonValue,
        },
      });
      if (!question.isFailFollowUp) questionCount += 1;
    }
  }

  return questionCount;
}

/** Empty JSON stub stored on forms/form_versions while relational mirrors are authoritative. */
export const FORM_JSON_STUB: Prisma.InputJsonValue = {};

export interface FormRowForTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  level: string;
  scopeTypeCodes: string[];
}

/** Assemble a FormTemplate from relational version mirrors only (no JSON sections column). */
export async function buildFormTemplateFromVersion(
  form: FormRowForTemplate,
  formVersion: { id: string; versionNumber: number },
  client: PrismaReadClient = db
): Promise<FormTemplate | null> {
  const sections = await loadFormVersionSectionsFromReporting(formVersion.id, client);
  if (sections.length === 0) return null;

  return {
    id: form.id,
    name: form.name,
    description: form.description ?? "",
    status: "published",
    level: form.level as FormTemplate["level"],
    category: form.category as FormTemplate["category"],
    scopeTypeCodes: form.scopeTypeCodes,
    sections,
    versionNumber: formVersion.versionNumber,
    latestVersionId: formVersion.id,
  };
}

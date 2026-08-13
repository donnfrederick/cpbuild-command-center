import { db } from "@/lib/db";
import type { FormTemplate, InspectionCategory } from "@/components/forms/formTypes";
import {
  buildFormTemplateFromVersion,
  countFormVersionQuestions,
} from "@/lib/inspections/form-reporting-structure";

export interface PublishedClearForm {
  formId: string;
  formVersionId: string;
  versionNumber: number;
  template: FormTemplate;
}

interface ScopeTypeRowShape {
  code: string;
  canonicalScopeType?: { code: string } | null;
}

/** Matches ScopeInspectionSheet — canonical code first, legacy ScopeType.code fallback. */
export function scopeCodeFromScopeType(scopeType: ScopeTypeRowShape | null | undefined): string | null {
  if (!scopeType) return null;
  return scopeType.canonicalScopeType?.code ?? scopeType.code ?? null;
}

export function formMatchesScopeCode(form: PublishedClearForm, scopeCode: string): boolean {
  return form.template.scopeTypeCodes.includes(scopeCode);
}

export function findClearFormsForScopeCode(
  forms: PublishedClearForm[],
  scopeCode: string
): PublishedClearForm[] {
  return forms.filter((f) => formMatchesScopeCode(f, scopeCode));
}

/**
 * Published scope-level CLEAR_INSPECTION forms loaded from relational version mirrors.
 * Skips forms with no mirror rows — never reads form_versions.sections JSON.
 */
export async function loadPublishedClearInspectionForms(): Promise<PublishedClearForm[]> {
  const forms = await db.form.findMany({
    where: {
      status: "PUBLISHED",
      level: "scope",
      category: "CLEAR_INSPECTION",
    },
    orderBy: { updatedAt: "desc" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true, versionNumber: true },
      },
    },
  });

  const published: PublishedClearForm[] = [];

  for (const form of forms) {
    const latestVersion = form.versions[0];
    if (!latestVersion) continue;

    const questionCount = await countFormVersionQuestions(latestVersion.id);
    if (questionCount === 0) continue;

    const template = await buildFormTemplateFromVersion(form, latestVersion);
    if (!template) continue;

    published.push({
      formId: form.id,
      formVersionId: latestVersion.id,
      versionNumber: latestVersion.versionNumber,
      template,
    });
  }

  return published;
}

/** Rebuild a published clear form from a prior submission's formVersionId (relational only). */
export async function loadPublishedClearFormForSubmission(input: {
  formId: string;
  formVersionId: string;
  categoryOverride?: InspectionCategory;
}): Promise<PublishedClearForm | null> {
  const form = await db.form.findUnique({
    where: { id: input.formId },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      level: true,
      scopeTypeCodes: true,
    },
  });
  const formVersion = await db.formVersion.findUnique({
    where: { id: input.formVersionId },
    select: { id: true, versionNumber: true },
  });
  if (!form || !formVersion) return null;

  const questionCount = await countFormVersionQuestions(formVersion.id);
  if (questionCount === 0) return null;

  const template = await buildFormTemplateFromVersion(form, formVersion);
  if (!template) return null;

  if (input.categoryOverride) {
    template.category = input.categoryOverride;
  }

  return {
    formId: form.id,
    formVersionId: formVersion.id,
    versionNumber: formVersion.versionNumber,
    template,
  };
}

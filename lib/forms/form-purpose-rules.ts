import type {
  FormPurpose,
  FormQuestion,
  FormTemplate,
  ResponseType,
} from "@/components/forms/formTypes";
import {
  ALL_RESPONSE_TYPES,
  normalizeFormPurpose,
} from "@/components/forms/formTypes";
import { getChoiceFollowUps } from "@/lib/forms/choice-follow-ups";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";

const PASS_FAIL_TYPES: ResponseType[] = ["PASS_FAIL", "PASS_FAIL_DEFICIENCIES"];

export function isDocumentationForm(
  template: Pick<FormTemplate, "formPurpose"> | null | undefined,
): boolean {
  return normalizeFormPurpose(template?.formPurpose) === "documentation";
}

/**
 * Legacy submissions captured before `formPurpose` existed on snapshots.
 * When the linked form is now Documentation, merge purpose for display/outcome UI.
 */
export function enrichSubmissionTemplateSnapshot(
  snapshot: FormTemplate | null | undefined,
  linkedFormPurpose?: string | null,
): FormTemplate | undefined {
  if (!snapshot) return undefined;
  if (isDocumentationForm(snapshot)) return snapshot;
  if (normalizeFormPurpose(linkedFormPurpose as FormPurpose | undefined) === "documentation") {
    return { ...snapshot, formPurpose: "documentation" };
  }
  return snapshot;
}

export function isDocumentationSubmission(
  sub: Pick<InspectionSubmission, "templateSnapshot" | "formPurpose">,
): boolean {
  if (isDocumentationForm(sub.templateSnapshot)) return true;
  return normalizeFormPurpose(sub.formPurpose) === "documentation";
}

export function responseTypesForPurpose(purpose: FormPurpose): ResponseType[] {
  if (purpose === "documentation") {
    return ALL_RESPONSE_TYPES.filter((t) => !PASS_FAIL_TYPES.includes(t));
  }
  return ALL_RESPONSE_TYPES;
}

function questionTree(q: FormQuestion): FormQuestion[] {
  const nested = Object.values(getChoiceFollowUps(q)).filter(
    (fq): fq is FormQuestion => Boolean(fq),
  );
  return [q, ...nested.flatMap(questionTree)];
}

/** True when any question (including follow-ups) uses pass/fail response types. */
export function formContainsPassFailQuestions(template: FormTemplate): boolean {
  for (const section of template.sections) {
    for (const q of section.questions) {
      for (const node of questionTree(q)) {
        if (PASS_FAIL_TYPES.includes(node.responseType)) return true;
      }
    }
  }
  return false;
}

export function validateDocumentationFormForPublish(
  template: FormTemplate,
): string | null {
  if (!isDocumentationForm(template)) return null;
  if (formContainsPassFailQuestions(template)) {
    return "documentationFormHasPassFailQuestions";
  }
  return null;
}

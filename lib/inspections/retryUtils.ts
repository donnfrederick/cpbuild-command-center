/**
 * Utilities for building a "retry" form template from a previously failed
 * inspection. The retry template reorders questions so that every question
 * the inspector answered with a failure is promoted to a synthetic
 * "Deficiencies to Address" section at the top of the form, making it
 * quick to close out each deficiency without scrolling through the full form.
 *
 * The original questions are preserved in their original sections below
 * (minus the ones promoted, so nothing appears twice). Empty sections
 * are dropped from the result.
 */

import type { FormTemplate, FormQuestion } from "@/components/forms/formTypes";
import type { AnswerState } from "@/components/forms/FormFillClient";

export type AnswersMap = Record<string, AnswerState>;

/**
 * Returns true when a previous answer represents a failure.
 *
 * FormFillClient stores choice values in lowercase ("pass", "fail",
 * "na", "yes", "no") — match against those, not display labels.
 *
 * Deficiencies alone are NOT sufficient to classify an answer as failed when
 * the choice is explicitly "pass" or "yes" — a user may have toggled to Fail,
 * added deficiencies, then switched back to Pass before submitting, leaving a
 * stale deficiencies array behind.
 */
function isFailedAnswer(answer: AnswerState | undefined): boolean {
  if (!answer) return false;
  if (answer.choice === "fail" || answer.choice === "no") return true;
  // Only treat orphaned deficiencies as a failure when there is no explicit pass.
  if (answer.choice !== "pass" && answer.choice !== "yes" && answer.deficiencies && answer.deficiencies.length > 0) return true;
  return false;
}

/**
 * Builds a retry `FormTemplate` from the original template and the answers
 * recorded in the previous (failed) submission.
 *
 * - Failed questions are extracted and placed in a new "Deficiencies to
 *   Address" section at index 0.
 * - Remaining questions stay in their original sections (in original order).
 * - Sections that become empty after extraction are removed.
 *
 * Answer keys (question IDs) are identical in both sections, so `initialAnswers`
 * seeded from the previous payload will pre-fill correctly everywhere.
 */
export interface RetryTemplateResult {
  template: FormTemplate;
  /** Maps each failed question ID → the original section title it came from. */
  questionSectionMap: Record<string, string>;
}

export function buildRetryTemplate(
  template: FormTemplate,
  previousAnswers: AnswersMap,
): RetryTemplateResult {
  // Collect all failed question IDs in the order they appear in the form.
  const failedIds = new Set<string>();
  const failedQuestions: FormQuestion[] = [];
  const questionSectionMap: Record<string, string> = {};

  for (const section of (template.sections ?? [])) {
    for (const q of section.questions) {
      if (isFailedAnswer(previousAnswers[q.id])) {
        failedIds.add(q.id);
        failedQuestions.push(q);
        questionSectionMap[q.id] = section.title || "Untitled section";
      }
    }
  }

  // If nothing failed, return the template unchanged (caller should handle
  // this as a "no deficiencies" case, but the retry form still works).
  if (failedQuestions.length === 0) {
    return { template, questionSectionMap };
  }

  // Build the synthetic deficiencies section.
  const deficiencySection = {
    id: "retry-deficiencies",
    title: "Deficiencies to Address",
    questions: failedQuestions,
  };

  // Strip failed questions out of their original sections.
  // If a section was itself the synthetic "retry-deficiencies" from a previous
  // retry, rename it so it no longer collides with the new deficiencySection
  // that is about to be prepended. This prevents React duplicate-key warnings
  // when a prior deficiency is resolved and a new one appears in the same retry.
  const remainingSections = template.sections
    .map((section) => ({
      ...section,
      id: section.id === "retry-deficiencies" ? "retry-previously-addressed" : section.id,
      questions: section.questions.filter((q) => !failedIds.has(q.id)),
    }))
    .filter((section) => section.questions.length > 0);

  return {
    template: { ...template, sections: [deficiencySection, ...remainingSections] },
    questionSectionMap,
  };
}

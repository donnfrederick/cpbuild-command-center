import type { FormQuestion, FormTemplate } from "@/components/forms/formTypes";
import type { AnswersMap } from "@/components/forms/FormFillClient";
import { activeFollowUpEntries } from "@/lib/forms/choice-follow-ups";

function seedRequiredNumberIfEmpty(
  question: FormQuestion,
  answers: AnswersMap,
  answerKey: string,
): void {
  if (!question.required || question.responseType !== "NUMBER") return;
  const current = answers[answerKey]?.number;
  if (current != null && current.trim().length > 0) return;
  answers[answerKey] = { ...answers[answerKey], number: "0" };
}

/**
 * Pre-fills required NUMBER questions with "0" for Clear Inspection forms
 * so inspectors are not blocked waiting to type a value.
 */
export function applyClearInspectionNumberDefaults(
  template: FormTemplate,
  answers: AnswersMap,
): AnswersMap {
  if (template.category !== "CLEAR_INSPECTION") {
    return answers;
  }

  const result: AnswersMap = { ...answers };

  for (const section of template.sections) {
    for (const question of section.questions) {
      seedRequiredNumberIfEmpty(question, result, question.id);

      const parentChoice = result[question.id]?.choice;
      for (const { followUp, payloadKey } of activeFollowUpEntries(
        question,
        parentChoice,
      )) {
        seedRequiredNumberIfEmpty(followUp, result, payloadKey);
      }
    }
  }

  return result;
}

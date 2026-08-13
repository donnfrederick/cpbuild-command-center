import type { FormQuestion, FormSection, FormTemplate } from "@/components/forms/formTypes";
import type { AnswerState } from "@/components/forms/FormFillClient";
import {
  activeFollowUpEntries,
  readFollowUpAnswer,
} from "@/lib/forms/choice-follow-ups";

/** Mirrors FormFillClient — whether a single question has a substantive answer. */
export function isQuestionAnswered(
  question: FormQuestion,
  answer: AnswerState | undefined
): boolean {
  if (!answer) return false;
  switch (question.responseType) {
    case "PASS_FAIL":
    case "PASS_FAIL_DEFICIENCIES":
    case "YES_NO":
    case "MULTIPLE_CHOICE":
      return Boolean(answer.choice);
    case "CHECKBOXES":
      return (answer.choices?.length ?? 0) > 0;
    case "SHORT_ANSWER":
    case "PARAGRAPH":
      return Boolean(answer.text && answer.text.trim().length > 0);
    case "NUMBER":
      return Boolean(answer.number && answer.number.trim().length > 0);
    case "RATING":
      return answer.rating != null && answer.rating > 0;
    default:
      return false;
  }
}

export interface IncompleteDeficiency {
  questionId: string;
  deficiencyId: string;
  missingDescription: boolean;
  missingSeverity: boolean;
  missingPhoto: boolean;
}

/** Mirrors FormFillClient deficiency gate for fail answers. */
export function findIncompleteDeficiencies(
  sections: FormSection[],
  answers: Record<string, AnswerState>
): IncompleteDeficiency[] {
  const incomplete: IncompleteDeficiency[] = [];
  for (const section of sections) {
    for (const question of section.questions) {
      if (question.responseType !== "PASS_FAIL_DEFICIENCIES") continue;
      const answer = answers[question.id];
      if (answer?.choice !== "fail") continue;
      for (const deficiency of answer.deficiencies ?? []) {
        const missingDescription = false;
        const missingSeverity = !deficiency.severity;
        const missingPhoto =
          (question.deficiencyPhotoRequired ?? false) &&
          !(deficiency.capturedFiles?.length);
        if (missingDescription || missingSeverity || missingPhoto) {
          incomplete.push({
            questionId: question.id,
            deficiencyId: deficiency.id,
            missingDescription,
            missingSeverity,
            missingPhoto,
          });
        }
      }
    }
  }
  return incomplete;
}

export interface UnansweredRequiredQuestion {
  questionId: string;
  title: string;
}

export function findUnansweredRequiredQuestions(
  sections: FormSection[],
  answers: Record<string, AnswerState>
): UnansweredRequiredQuestion[] {
  const unanswered: UnansweredRequiredQuestion[] = [];
  for (const section of sections) {
    for (const question of section.questions) {
      if (!question.required) continue;
      if (!isQuestionAnswered(question, answers[question.id])) {
        unanswered.push({ questionId: question.id, title: question.title });
      }
    }
  }
  return unanswered;
}

export function findIncompleteRequiredFollowUps(
  sections: FormSection[],
  answers: Record<string, AnswerState>
): UnansweredRequiredQuestion[] {
  const incomplete: UnansweredRequiredQuestion[] = [];
  for (const section of sections) {
    for (const question of section.questions) {
      if (question.responseType !== "PASS_FAIL" && question.responseType !== "YES_NO") {
        continue;
      }
      const parentChoice = answers[question.id]?.choice;
      for (const { trigger, followUp, payloadKey } of activeFollowUpEntries(
        question,
        parentChoice,
      )) {
        if (!followUp.required) continue;
        const followUpAnswer =
          readFollowUpAnswer(answers, question.id, trigger) ??
          answers[payloadKey];
        if (!isQuestionAnswered(followUp, followUpAnswer)) {
          incomplete.push({ questionId: payloadKey, title: followUp.title });
        }
      }
    }
  }
  return incomplete;
}

export function assertSubmissionAnswersComplete(
  template: FormTemplate,
  answers: Record<string, AnswerState>
): void {
  const unanswered = findUnansweredRequiredQuestions(template.sections, answers);
  if (unanswered.length > 0) {
    const titles = unanswered.map((q) => q.title).join(", ");
    throw new Error(`Seed payload missing required answers: ${titles}`);
  }

  const incompleteDefs = findIncompleteDeficiencies(template.sections, answers);
  if (incompleteDefs.length > 0) {
    throw new Error(
      `Seed payload has ${incompleteDefs.length} incompletely documented deficiency(ies)`
    );
  }

  const incompleteFollowUps = findIncompleteRequiredFollowUps(template.sections, answers);
  if (incompleteFollowUps.length > 0) {
    const titles = incompleteFollowUps.map((q) => q.title).join(", ");
    throw new Error(`Seed payload missing required fail follow-up answers: ${titles}`);
  }
}

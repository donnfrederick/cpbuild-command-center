import type { FormQuestion, Deficiency } from "@/components/forms/formTypes";
import type { AnswerState, AnswersMap } from "@/components/forms/FormFillClient";
import {
  getChoiceFollowUps,
  readFollowUpAnswer,
} from "@/lib/forms/choice-follow-ups";

export interface RetryItem {
  key: string;
  deficiency?: Deficiency;
}

/** Stable per-item key — never treat empty-string ids as present. */
export function retryItemKey(questionId: string, suffix: string): string {
  return `${questionId}::${suffix}`;
}

/** PASS_FAIL questions may store deficiencies on a nested failFollowUp answer. */
export function getRetryAnswerForQuestion(
  question: FormQuestion,
  previousAnswers: AnswersMap,
): AnswerState | undefined {
  const answer = previousAnswers[question.id];
  const followUpAnswer =
    readFollowUpAnswer(previousAnswers, question.id, "fail") ??
    previousAnswers[`${question.id}__followup`];
  const followUpDefs = followUpAnswer?.deficiencies ?? [];

  if (followUpDefs.length > 0) {
    return {
      ...(answer ?? {}),
      choice: answer?.choice ?? followUpAnswer?.choice ?? "fail",
      deficiencies: followUpDefs,
    };
  }

  return answer;
}

/** Question whose deficiency field settings apply during retry resolution. */
export function getRetryDeficiencyQuestion(question: FormQuestion): FormQuestion {
  const followUp = getChoiceFollowUps(question).fail;
  if (
    question.responseType === "PASS_FAIL" &&
    followUp &&
    "id" in followUp &&
    followUp.responseType === "PASS_FAIL_DEFICIENCIES"
  ) {
    return followUp;
  }
  return question;
}

export function usesFollowUpDeficiencyStorage(
  question: FormQuestion,
  previousAnswers: AnswersMap,
): boolean {
  const failAnswer = readFollowUpAnswer(previousAnswers, question.id, "fail");
  return (
    question.responseType === "PASS_FAIL" &&
    (failAnswer?.deficiencies?.length ?? 0) > 0
  );
}

/** Coerce stored occurrence counts to a finite integer ≥ 1. */
export function normalizeOccurrenceCount(count?: number): number {
  const parsed = Number(count);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.trunc(parsed);
}

/**
 * Keep grouped deficiencies as one retry row each — preserve `count` so the
 * UI shows ×N occurrences without duplicating resolve / still-failing actions.
 */
export function normalizeDeficienciesForRetry(defs: Deficiency[]): Deficiency[] {
  return defs.map((def, defIndex) => {
    const baseId =
      typeof def.id === "string" && def.id.trim().length > 0
        ? def.id.trim()
        : `idx-${defIndex}`;
    return {
      ...def,
      id: baseId,
      count: normalizeOccurrenceCount(def.count),
    };
  });
}

/** @deprecated Use normalizeDeficienciesForRetry — expansion removed (group by deficiency, not occurrence). */
export function expandDeficienciesForRetry(defs: Deficiency[]): Deficiency[] {
  return normalizeDeficienciesForRetry(defs);
}

export function hasRetryDeficiencyCards(
  question: FormQuestion,
  previousAnswers: AnswersMap,
): boolean {
  const previousAnswer = getRetryAnswerForQuestion(question, previousAnswers);
  const prevDefs = previousAnswer?.deficiencies ?? [];
  if (prevDefs.length === 0) return false;

  const defQuestion = getRetryDeficiencyQuestion(question);
  return (
    defQuestion.responseType === "PASS_FAIL_DEFICIENCIES" ||
    usesFollowUpDeficiencyStorage(question, previousAnswers)
  );
}

export function getRetryItems(
  question: FormQuestion,
  previousAnswers: AnswersMap,
): RetryItem[] {
  const previousAnswer = getRetryAnswerForQuestion(question, previousAnswers);
  const prevDefs = previousAnswer?.deficiencies ?? [];

  if (hasRetryDeficiencyCards(question, previousAnswers)) {
    return normalizeDeficienciesForRetry(prevDefs).map((def, i) => ({
      key: retryItemKey(
        question.id,
        typeof def.id === "string" && def.id.length > 0 ? def.id : `idx-${i}`,
      ),
      deficiency: def,
    }));
  }

  return [{ key: retryItemKey(question.id, "__question__") }];
}

export function countRetryItems(
  questions: FormQuestion[],
  previousAnswers: AnswersMap,
): number {
  return questions.reduce(
    (total, q) => total + getRetryItems(q, previousAnswers).length,
    0,
  );
}

/** Sum of occurrence counts across all retry deficiency rows (for reporting). */
export function countRetryOccurrences(
  questions: FormQuestion[],
  previousAnswers: AnswersMap,
): number {
  return questions.reduce((total, q) => {
    const previousAnswer = getRetryAnswerForQuestion(q, previousAnswers);
    const defs = previousAnswer?.deficiencies ?? [];
    if (!hasRetryDeficiencyCards(q, previousAnswers)) return total;
    return total + defs.reduce((sum, d) => sum + normalizeOccurrenceCount(d.count), 0);
  }, 0);
}

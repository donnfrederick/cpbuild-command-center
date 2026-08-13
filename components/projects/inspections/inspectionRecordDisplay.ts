import type { AnswersMap } from "@/components/forms/FormFillClient";
import type { FormQuestion, FormSection } from "@/components/forms/formTypes";

export function isScoredResponseType(responseType: FormQuestion["responseType"]): boolean {
  return (
    responseType === "PASS_FAIL" ||
    responseType === "PASS_FAIL_DEFICIENCIES" ||
    responseType === "YES_NO"
  );
}

export function sectionHasScoredQuestions(section: FormSection): boolean {
  return section.questions.some((q) => isScoredResponseType(q.responseType));
}

export function sectionTitleLabel(section: FormSection): string | null {
  const title = section.title?.trim();
  return title ? title : null;
}

export function sectionDeficiencyOccurrences(section: FormSection, answers: AnswersMap): number {
  return section.questions.reduce((sectionTotal, q) => {
    if (q.responseType !== "PASS_FAIL_DEFICIENCIES") return sectionTotal;
    const answer = answers[q.id];
    if (!answer?.deficiencies?.length) return sectionTotal;
    return sectionTotal + answer.deficiencies.reduce((sum, d) => sum + (d.count ?? 1), 0);
  }, 0);
}

export function sectionIsFailed(section: FormSection, answers: AnswersMap): boolean {
  for (const q of section.questions) {
    if (!isScoredResponseType(q.responseType)) continue;
    const answer = answers[q.id];
    if (!answer) continue;
    if (answer.choice === "fail" || answer.choice === "no") return true;
    if (answer.deficiencies?.length) return true;
  }
  return false;
}

export function questionIsFailed(
  question: FormQuestion,
  answer: AnswersMap[string] | undefined,
): boolean {
  if (!isScoredResponseType(question.responseType)) return false;
  if (!answer) return false;
  if (answer.choice === "fail" || answer.choice === "no") return true;
  return (answer.deficiencies?.length ?? 0) > 0;
}

export function isNotApplicableChoice(choice: string | undefined): boolean {
  const normalized = choice?.toLowerCase();
  return normalized === "na" || normalized === "n/a";
}

export function questionIsPassed(
  question: FormQuestion,
  answer: AnswersMap[string] | undefined,
): boolean {
  if (!isScoredResponseType(question.responseType)) return false;
  if (!answer) return false;
  if (answer.choice === "pass" || answer.choice === "yes") return true;
  if (isNotApplicableChoice(answer.choice)) return true;
  return false;
}

export function sectionPassedQuestionCount(section: FormSection, answers: AnswersMap): number {
  return section.questions.filter((q) => questionIsPassed(q, answers[q.id])).length;
}

/**
 * When pass/fail is hoisted into the category header outcome slot, drop the
 * duplicate pass/fail word from the right badge — keep deficiency counts.
 */
export function dedupeCategoryHeaderStatus(
  status: string,
  hasHeaderOutcome: boolean,
  passLabel: string,
  failLabel: string,
): string {
  if (!hasHeaderOutcome || !status) return status;
  if (status === passLabel || status === failLabel) return "";
  return status;
}

import type { FormQuestion } from "@/components/forms/formTypes";

export interface PassFailAnswerShape {
  choice?: string;
  deficiencies?: unknown[];
}

export function isPassFailQuestionType(
  responseType: FormQuestion["responseType"],
): boolean {
  return responseType === "PASS_FAIL" || responseType === "PASS_FAIL_DEFICIENCIES";
}

/** True when a pass/fail question answer is marked Fail (incl. legacy deficiency-only rows). */
export function isFailedPassFailAnswer(
  responseType: FormQuestion["responseType"],
  answer: PassFailAnswerShape | undefined,
): boolean {
  if (!answer) return false;
  if (!isPassFailQuestionType(responseType)) return false;
  if (answer.choice === "fail") return true;
  if (
    responseType === "PASS_FAIL_DEFICIENCIES" &&
    answer.choice === undefined &&
    (answer.deficiencies?.length ?? 0) > 0
  ) {
    return true;
  }
  return false;
}

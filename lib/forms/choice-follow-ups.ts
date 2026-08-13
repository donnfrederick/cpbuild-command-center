import type { FormQuestion, FormSection, ResponseType } from "@/components/forms/formTypes";
import type { AnswerState } from "@/components/forms/FormFillClient";

/** Parent choice that can reveal an optional follow-up question. */
export type ChoiceFollowUpTrigger = "yes" | "no" | "na" | "pass" | "fail";

export type ChoiceFollowUpsMap = Partial<Record<ChoiceFollowUpTrigger, FormQuestion>>;

const LEGACY_FOLLOWUP_SUFFIX = "__followup";
const TRIGGERED_FOLLOWUP_SUFFIX = "__followup__";

export function followUpTriggersForResponseType(
  responseType: ResponseType,
): ChoiceFollowUpTrigger[] {
  switch (responseType) {
    case "YES_NO":
      return ["yes", "no", "na"];
    case "PASS_FAIL":
      return ["pass", "fail", "na"];
    default:
      return [];
  }
}

/** Payload key for a follow-up answer. Legacy fail-only uses `{id}__followup`. */
export function followUpPayloadKey(
  parentQuestionId: string,
  trigger?: ChoiceFollowUpTrigger,
): string {
  if (!trigger || trigger === "fail") {
    return `${parentQuestionId}${LEGACY_FOLLOWUP_SUFFIX}`;
  }
  return `${parentQuestionId}${TRIGGERED_FOLLOWUP_SUFFIX}${trigger}`;
}

/** Parse trigger from a mirrored / payload follow-up question id. */
export function parseFollowUpTriggerFromSourceId(
  sourceQuestionId: string,
  parentQuestionId: string,
): ChoiceFollowUpTrigger | null {
  const legacyKey = followUpPayloadKey(parentQuestionId);
  if (sourceQuestionId === legacyKey) return "fail";

  const prefix = `${parentQuestionId}${TRIGGERED_FOLLOWUP_SUFFIX}`;
  if (!sourceQuestionId.startsWith(prefix)) return null;
  const trigger = sourceQuestionId.slice(prefix.length) as ChoiceFollowUpTrigger;
  if (trigger === "yes" || trigger === "no" || trigger === "na" || trigger === "pass" || trigger === "fail") {
    return trigger;
  }
  return null;
}

function isFullFormQuestion(value: unknown): value is FormQuestion {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as FormQuestion).id === "string"
  );
}

/** Merge legacy failFollowUp into choiceFollowUps.fail on read. */
export function normalizeFormQuestion(question: FormQuestion): FormQuestion {
  const choiceFollowUps: ChoiceFollowUpsMap = { ...(question.choiceFollowUps ?? {}) };

  if (
    question.failFollowUp &&
    isFullFormQuestion(question.failFollowUp) &&
    !choiceFollowUps.fail
  ) {
    choiceFollowUps.fail = question.failFollowUp;
  }

  const normalized: FormQuestion = {
    ...question,
    ...(Object.keys(choiceFollowUps).length > 0 ? { choiceFollowUps } : {}),
  };

  if (choiceFollowUps.fail && question.responseType === "PASS_FAIL") {
    normalized.failFollowUp = choiceFollowUps.fail;
  } else if ("failFollowUp" in normalized && !choiceFollowUps.fail) {
    delete normalized.failFollowUp;
  }

  return normalized;
}

export function normalizeFormSections(sections: FormSection[]): FormSection[] {
  return sections.map((section) => ({
    ...section,
    questions: section.questions.map(normalizeFormQuestion),
  }));
}

/** Resolved follow-ups for a parent question (choiceFollowUps + legacy failFollowUp). */
export function getChoiceFollowUps(question: FormQuestion): ChoiceFollowUpsMap {
  const normalized = normalizeFormQuestion(question);
  return normalized.choiceFollowUps ?? {};
}

export function getFollowUpForTrigger(
  question: FormQuestion,
  trigger: ChoiceFollowUpTrigger,
): FormQuestion | undefined {
  const followUps = getChoiceFollowUps(question);
  return followUps[trigger];
}

/** Whether the parent's current choice should show the follow-up for `trigger`. */
export function shouldShowFollowUpForChoice(
  parentResponseType: ResponseType,
  parentChoice: string | undefined,
  trigger: ChoiceFollowUpTrigger,
): boolean {
  if (!parentChoice) return false;
  const choice = parentChoice.toLowerCase();
  switch (trigger) {
    case "yes":
    case "pass":
      return choice === "yes" || choice === "pass";
    case "no":
    case "fail":
      return choice === "no" || choice === "fail";
    case "na":
      return choice === "na" || choice === "n/a";
    default:
      return false;
  }
}

export function activeFollowUpEntries(
  question: FormQuestion,
  parentChoice: string | undefined,
): Array<{ trigger: ChoiceFollowUpTrigger; followUp: FormQuestion; payloadKey: string }> {
  if (question.responseType !== "YES_NO" && question.responseType !== "PASS_FAIL") {
    return [];
  }

  const entries: Array<{ trigger: ChoiceFollowUpTrigger; followUp: FormQuestion; payloadKey: string }> = [];
  for (const trigger of followUpTriggersForResponseType(question.responseType)) {
    const followUp = getFollowUpForTrigger(question, trigger);
    if (!followUp || !isFullFormQuestion(followUp)) continue;
    if (!shouldShowFollowUpForChoice(question.responseType, parentChoice, trigger)) continue;
    entries.push({
      trigger,
      followUp,
      payloadKey: followUpPayloadKey(question.id, trigger),
    });
  }
  return entries;
}

/** Resolve answer for a follow-up from payload (legacy + triggered keys). */
export function readFollowUpAnswer(
  answers: Record<string, AnswerState | undefined>,
  parentQuestionId: string,
  trigger: ChoiceFollowUpTrigger,
): AnswerState | undefined {
  const triggeredKey = followUpPayloadKey(parentQuestionId, trigger);
  if (answers[triggeredKey]) return answers[triggeredKey];
  if (trigger === "fail" && answers[followUpPayloadKey(parentQuestionId)]) {
    return answers[followUpPayloadKey(parentQuestionId)];
  }
  return undefined;
}

export function rebuildChoiceFollowUpsFromMirrorRows(
  parentQuestionId: string,
  followUpRows: Array<{ sourceQuestionId: string; rawQuestion: unknown }>,
): ChoiceFollowUpsMap {
  const map: ChoiceFollowUpsMap = {};
  for (const row of followUpRows) {
    const trigger = parseFollowUpTriggerFromSourceId(row.sourceQuestionId, parentQuestionId);
    if (!trigger || !isFullFormQuestion(row.rawQuestion)) continue;
    map[trigger] = row.rawQuestion as FormQuestion;
  }
  return map;
}

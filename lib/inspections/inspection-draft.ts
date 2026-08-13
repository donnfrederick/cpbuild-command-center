/**
 * Pure helpers for inspection in-progress drafts (local IndexedDB).
 */

import type { AnswersMap } from "@/components/forms/FormFillClient";
import type { CapturedMediaItem, Deficiency, FormTemplate } from "@/components/forms/formTypes";
import {
  isQuestionAnswered,
} from "@/lib/inspections/answer-completeness";
import { sanitizeAnswersForStorage } from "@/lib/inspections/uploadInspectionMedia";
import { stableJsonStringify } from "@/lib/inspections/inspection-draft-json";

export type InspectionDraftKind = "live" | "retry" | "calibration" | "edit";

/** Stable empty map — use instead of `{}` in useMemo to avoid spurious FormFillClient resets. */
export const EMPTY_ANSWERS_MAP: AnswersMap = Object.freeze({});

export type RetryResolution = "resolved" | "failing";

export interface RetryResolutionDoc {
  note: string;
  capturedFiles?: CapturedMediaItem[];
}

export interface RetryDraftState {
  answers: AnswersMap;
  resolutions: Record<string, RetryResolution>;
  updatedDefs: Record<string, Deficiency>;
  resolvedDocs: Record<string, RetryResolutionDoc>;
  resolutionSubmitted: Record<string, boolean>;
}

export interface RetryDraftRegistration {
  isDirty: () => boolean;
  getRetryState: () => RetryDraftState;
  isSubmitting?: () => boolean;
}

export interface InspectionDraft {
  draftKey: string;
  kind: InspectionDraftKind;
  projectId: string;
  unitId: string;
  scopeRowId?: string;
  formId: string;
  formVersionId?: string;
  parentSubmissionId?: string;
  categorySnapshot: string;
  templateSnapshot: unknown;
  attemptNumber?: number;
  updatedAt: string;
  answers?: AnswersMap;
  retryState?: RetryDraftState;
  /** Set when File blobs were stripped and may need re-attach on resume. */
  hasPendingMedia?: boolean;
}

export interface BuildDraftKeyInput {
  kind: InspectionDraftKind;
  projectId: string;
  unitId: string;
  scopeRowId?: string;
  formId: string;
  formVersionId?: string;
  parentSubmissionId?: string;
}

function draftScopeSegment(scopeRowId: string | undefined, unitId: string): string {
  return scopeRowId ?? `unit:${unitId}`;
}

export function buildDraftKey(input: BuildDraftKeyInput): string {
  const scope = draftScopeSegment(input.scopeRowId, input.unitId);
  const project = input.projectId;
  const version = input.formVersionId ?? "latest";
  if (input.kind === "live") {
    return `live:${project}:${scope}:${input.formId}:${version}`;
  }
  const parent = input.parentSubmissionId ?? "unknown";
  if (input.kind === "retry") {
    return `retry:${project}:${scope}:${input.formId}:${parent}`;
  }
  if (input.kind === "edit") {
    return `edit:${project}:${scope}:${input.formId}:${parent}`;
  }
  return `calibration:${project}:${scope}:${input.formId}:${parent}`;
}

export function hasAnyAnswers(
  template: FormTemplate,
  answers: AnswersMap,
): boolean {
  for (const section of template.sections) {
    for (const question of section.questions) {
      if (isQuestionAnswered(question, answers[question.id])) {
        return true;
      }
    }
  }
  return false;
}

export function countAnsweredQuestions(
  template: FormTemplate,
  answers: AnswersMap,
): number {
  let count = 0;
  for (const section of template.sections) {
    for (const question of section.questions) {
      if (isQuestionAnswered(question, answers[question.id])) {
        count += 1;
      }
    }
  }
  return count;
}

export function answersDirty(
  baseline: AnswersMap,
  current: AnswersMap,
): boolean {
  return stableJsonStringify(sanitizeAnswersForStorage(baseline))
    !== stableJsonStringify(sanitizeAnswersForStorage(current));
}

export function isRetryDirty(
  previousAnswers: AnswersMap,
  retryState: RetryDraftState,
): boolean {
  if (answersDirty(previousAnswers, retryState.answers)) {
    return true;
  }
  if (Object.keys(retryState.resolutions).length > 0) return true;
  if (Object.keys(retryState.updatedDefs).length > 0) return true;
  if (Object.keys(retryState.resolutionSubmitted).length > 0) return true;
  for (const doc of Object.values(retryState.resolvedDocs)) {
    if (doc.note?.trim()) return true;
    if ((doc.capturedFiles?.length ?? 0) > 0) return true;
  }
  return false;
}

export function sanitizeRetryDraftState(state: RetryDraftState): {
  retryState: RetryDraftState;
  hasPendingMedia: boolean;
} {
  let hasPendingMedia = false;
  const answers = sanitizeAnswersForStorage(state.answers);
  const resolvedDocs: Record<string, RetryResolutionDoc> = {};
  for (const [key, doc] of Object.entries(state.resolvedDocs)) {
    const files = doc.capturedFiles?.map((item) => {
      if (item.file instanceof File) {
        hasPendingMedia = true;
        const { file: _removed, ...rest } = item;
        void _removed;
        return rest as CapturedMediaItem;
      }
      return item;
    });
    resolvedDocs[key] = {
      note: doc.note,
      ...(files?.length ? { capturedFiles: files } : {}),
    };
  }
  return {
    retryState: {
      answers,
      resolutions: { ...state.resolutions },
      updatedDefs: { ...state.updatedDefs },
      resolvedDocs,
      resolutionSubmitted: { ...state.resolutionSubmitted },
    },
    hasPendingMedia,
  };
}

export function sanitizeDraftAnswers(answers: AnswersMap): {
  answers: AnswersMap;
  hasPendingMedia: boolean;
} {
  const hasPendingMedia = answersHaveFileRefs(answers);
  return { answers: sanitizeAnswersForStorage(answers), hasPendingMedia };
}

function answersHaveFileRefs(answers: AnswersMap): boolean {
  for (const answer of Object.values(answers)) {
    for (const item of answer.capturedFiles ?? []) {
      if (item.file instanceof File) return true;
    }
    for (const def of answer.deficiencies ?? []) {
      for (const item of def.capturedFiles ?? []) {
        if (item.file instanceof File) return true;
      }
      for (const item of def.resolutionCapturedFiles ?? []) {
        if (item.file instanceof File) return true;
      }
    }
  }
  return false;
}

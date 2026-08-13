"use client";

/**
 * RetryFillLayout — retry inspection UI.
 *
 * "Open deficiencies" section (auto-expanded, dark red header band):
 *   Flat list grouped by original section label (LAYOUT, etc.) — no nested cards.
 *   Each failed question shows readout + per-deficiency resolution actions.
 *
 * "Review remaining items" section (auto-collapsed):
 *   All other questions pre-filled from the previous submission.
 *
 * Pinned submit — enabled once every deficiency has a resolution chosen.
 */

import { useState, useId, useEffect, type MutableRefObject } from "react";
import {
  Check,
  X,
  Camera,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { applyClearInspectionNumberDefaults } from "@/lib/forms/clear-inspection-number-defaults";
import {
  allowsAdditionalDeficiencies,
  DEFICIENCY_SEVERITIES,
  deficiencySeverityModifier,
} from "@/components/forms/formTypes";
import type { AnswerState, AnswersMap } from "@/components/forms/FormFillClient";
import {
  AutoNotesSection,
  AnnotatableThumbStrip,
  ChoiceButtons,
  DeficiencyCapture,
  newDeficiency,
} from "@/components/forms/FormFillClient";
import { AUTO_NOTES_KEY, AUTO_MEDIA_KEY } from "@/components/forms/formTypes";
import type {
  CapturedMediaItem,
  Deficiency,
  DeficiencySeverity,
  FormQuestion,
  FormSection,
  FormTemplate,
} from "@/components/forms/formTypes";
import { CameraCapture } from "@/components/projects/CameraCapture";
import type { ScopeRow } from "@/components/projects/UnitCards";
import { ClickableMediaStrip, RecordedAnswerReadout } from "./InspectionRecordClient";
import { InspectionSheetHeader } from "./InspectionSheetHeader";
import {
  formatInspectionDateLabel,
} from "@/lib/inspections/inspectionHeaderUtils";
import {
  InspectionReportPanel,
  InspectionReportCategory,
  InspectionReportCategoryBody,
  InspectionReportCategoryHeader,
  InspectionReportQuestionBlock,
  InspectionReportDeficiencyList,
} from "./InspectionReportLayout";
import { InspectionReportDeficiencyRow } from "./InspectionReportDeficiency";
import { dedupeCategoryHeaderStatus } from "./inspectionRecordDisplay";
import {
  countRetryItems,
  getRetryAnswerForQuestion,
  getRetryDeficiencyQuestion,
  getRetryItems,
  hasRetryDeficiencyCards,
  normalizeOccurrenceCount,
  usesFollowUpDeficiencyStorage,
} from "@/lib/inspections/retry-items";
import {
  isRetryDirty,
  type RetryDraftRegistration,
  type RetryDraftState,
} from "@/lib/inspections/inspection-draft";

// ── Helpers ───────────────────────────────────────────────────────────────────

function newDefId() {
  return Math.random().toString(36).slice(2, 10);
}

function newRetryDeficiency(): Deficiency {
  return { id: newDefId(), description: "", count: 1 };
}

type Resolution = "resolved" | "failing";

interface ResolutionDoc {
  note: string;
  capturedFiles?: CapturedMediaItem[];
}

function buildQuestionAnswer(
  question: FormQuestion,
  previousAnswers: AnswersMap,
  resolutions: Record<string, Resolution>,
  updatedDefs: Record<string, Deficiency>,
  resolvedDocs: Record<string, ResolutionDoc>,
  resolutionSubmitted: Record<string, boolean>,
): AnswerState {
  const defQuestion = getRetryDeficiencyQuestion(question);
  const isYesNo = defQuestion.responseType === "YES_NO";
  const items = getRetryItems(question, previousAnswers);
  const previousAnswer = getRetryAnswerForQuestion(question, previousAnswers);

  if (hasRetryDeficiencyCards(question, previousAnswers)) {
    const stillFailing: Deficiency[] = [];
    const resolved: Deficiency[] = [];
    for (const item of items) {
      if (resolutions[item.key] === "failing") {
        stillFailing.push(
          updatedDefs[item.key] ?? item.deficiency ?? newRetryDeficiency(),
        );
      } else if (
        resolutions[item.key] === "resolved" &&
        resolutionSubmitted[item.key]
      ) {
        const entry = buildResolvedDeficiency(item, resolvedDocs);
        if (entry) resolved.push(entry);
      }
    }
    const base: AnswerState = {
      choice: stillFailing.length === 0 ? (isYesNo ? "yes" : "pass") : "fail",
      deficiencies: stillFailing,
    };
    if (resolved.length > 0) {
      base.resolvedDeficiencies = resolved;
    }
    return base;
  }

  const key = items[0]!.key;
  if (resolutions[key] === "resolved" && resolutionSubmitted[key]) {
    const entry = buildResolvedDeficiency(items[0]!, resolvedDocs);
    const base: AnswerState = {
      choice: isYesNo ? "yes" : "pass",
      deficiencies: [],
    };
    if (entry) {
      base.resolvedDeficiencies = [entry];
    }
    return base;
  }
  return { ...previousAnswer, choice: isYesNo ? "no" : "fail" };
}

function applyRetryAnswerToMap(
  merged: AnswersMap,
  question: FormQuestion,
  previousAnswers: AnswersMap,
  built: AnswerState,
): void {
  if (usesFollowUpDeficiencyStorage(question, previousAnswers)) {
    const followUpKey = `${question.id}__followup`;
    merged[followUpKey] = built;
    merged[question.id] = {
      ...(previousAnswers[question.id] ?? {}),
      choice: built.choice === "pass" || built.choice === "yes" ? built.choice : "fail",
    };
    return;
  }
  merged[question.id] = built;
}

function buildResolvedDeficiency(
  item: { key: string; deficiency?: Deficiency },
  resolvedDocs: Record<string, ResolutionDoc>,
): Deficiency | null {
  const doc = resolvedDocs[item.key];
  if (!doc?.note?.trim()) return null;
  const base = item.deficiency ?? { id: newDefId(), description: "" };
  return {
    ...base,
    id: base.id ?? newDefId(),
    resolutionNote: doc.note.trim(),
    resolutionCapturedFiles: doc.capturedFiles?.length ? doc.capturedFiles : undefined,
  };
}

function isRetryResolutionComplete(doc?: ResolutionDoc): boolean {
  return Boolean(doc?.note?.trim());
}

function groupQuestionsBySectionTitle(
  questions: FormQuestion[],
  sectionMap: Record<string, string>,
): Array<{ sectionTitle: string | null; questions: FormQuestion[] }> {
  const groups: Array<{ sectionTitle: string | null; questions: FormQuestion[] }> = [];
  for (const q of questions) {
    const title = sectionMap[q.id]?.trim() || null;
    const last = groups[groups.length - 1];
    if (last && last.sectionTitle === title) {
      last.questions.push(q);
    } else {
      groups.push({ sectionTitle: title, questions: [q] });
    }
  }
  return groups;
}

function answerDeficiencyOccurrences(answer: AnswerState | undefined): number {
  return (answer?.deficiencies ?? []).reduce(
    (sum, d) => sum + normalizeOccurrenceCount(d.count),
    0,
  );
}

function sectionGroupUniqueDeficiencyCount(
  questions: FormQuestion[],
  previousAnswers: AnswersMap,
): number {
  return countRetryItems(questions, previousAnswers);
}

function isRetryDeficiencyComplete(
  question: FormQuestion,
  deficiency: Deficiency,
): boolean {
  const needsDescription = question.deficiencyDescriptionEnabled ?? true;
  const hasDescription =
    !needsDescription || deficiency.description.trim().length > 0;
  const hasSeverity = Boolean(deficiency.severity);
  const hasRequiredPhoto =
    !question.deficiencyPhotoRequired ||
    (deficiency.capturedFiles?.length ?? 0) > 0;
  const hasValidCount = (deficiency.count ?? 1) >= 1;
  return hasDescription && hasSeverity && hasRequiredPhoto && hasValidCount;
}

function isRemainingAnswerFailed(
  question: FormQuestion,
  answer: AnswerState | undefined,
): boolean {
  if (!answer) return false;
  if (answer.choice === "fail" || answer.choice === "no") return true;
  return false;
}

function incompleteRemainingDeficiencyCount(
  remainingSections: FormSection[],
  answers: AnswersMap,
): number {
  let total = 0;
  for (const section of remainingSections) {
    for (const q of section.questions) {
      if (q.responseType !== "PASS_FAIL_DEFICIENCIES") continue;
      const answer = answers[q.id];
      if (!isRemainingAnswerFailed(q, answer)) continue;
      const defs = answer?.deficiencies ?? [];
      if (defs.length === 0) {
        total++;
        continue;
      }
      for (const d of defs) {
        if (!isRetryDeficiencyComplete(q, d)) total++;
      }
    }
  }
  return total;
}

function remainingSectionTone(
  section: FormSection,
  answers: AnswersMap,
): "fail" | "pass" | "neutral" {
  const hasFail = section.questions.some((q) => isRemainingAnswerFailed(q, answers[q.id]));
  if (hasFail) return "fail";
  return section.title.trim() ? "pass" : "neutral";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RetryFillLayoutProps {
  template: FormTemplate;
  previousAnswers: AnswersMap;
  attemptNumber: number;
  onSubmit: (answers: AnswersMap) => Promise<void>;
  onClose: () => void;
  /** Raw location fields — rendered with icons so "1 · 1 · 114" becomes "Bldg 1 / Level 1 / Unit 114". */
  locationParts?: { building?: string | null; level?: string | null; unit?: string | null };
  /** Name of the person who submitted the PREVIOUS (failed) attempt. */
  previousSubmittedBy?: string;
  /** ISO timestamp of the PREVIOUS (failed) submission. */
  previousSubmittedAt?: string;
  /** Maps each deficiency question ID → the original section it came from. */
  questionSectionMap?: Record<string, string>;
  scope?: ScopeRow;
  categoryEyebrow?: string | null;
  draftRegistrationRef?: MutableRefObject<RetryDraftRegistration | null>;
  onDraftChange?: () => void;
  initialRetryState?: RetryDraftState;
  seedClearInspectionNumberDefaults?: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────

export function RetryFillLayout({
  template,
  previousAnswers,
  attemptNumber,
  onSubmit,
  onClose,
  locationParts,
  previousSubmittedBy,
  previousSubmittedAt,
  questionSectionMap = {},
  scope,
  categoryEyebrow,
  draftRegistrationRef,
  onDraftChange,
  initialRetryState,
  seedClearInspectionNumberDefaults = false,
}: RetryFillLayoutProps) {
  const t = useTranslations("inspections");
  const tCommon = useTranslations("common");

  function seedAnswersIfEnabled(source: AnswersMap): AnswersMap {
    if (seedClearInspectionNumberDefaults) {
      return applyClearInspectionNumberDefaults(template, source);
    }
    return source;
  }

  const deficiencySection = template.sections.find(
    (s) => s.id === "retry-deficiencies",
  );
  const remainingSections: FormSection[] = template.sections.filter(
    (s) => s.id !== "retry-deficiencies",
  );
  const deficiencyQuestions = deficiencySection?.questions ?? [];

  const [answers, setAnswers] = useState<AnswersMap>(() =>
    seedAnswersIfEnabled({
      ...(initialRetryState?.answers ?? previousAnswers),
    }),
  );

  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(
    () => ({ ...(initialRetryState?.resolutions ?? {}) }),
  );
  const [updatedDefs, setUpdatedDefs] = useState<Record<string, Deficiency>>(
    () => ({ ...(initialRetryState?.updatedDefs ?? {}) }),
  );
  const [resolvedDocs, setResolvedDocs] = useState<Record<string, ResolutionDoc>>(
    () => ({ ...(initialRetryState?.resolvedDocs ?? {}) }),
  );
  const [resolutionSubmitted, setResolutionSubmitted] = useState<Record<string, boolean>>(
    () => ({ ...(initialRetryState?.resolutionSubmitted ?? {}) }),
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!draftRegistrationRef) return;
    draftRegistrationRef.current = {
      isDirty: () =>
        isRetryDirty(previousAnswers, {
          answers,
          resolutions,
          updatedDefs,
          resolvedDocs,
          resolutionSubmitted,
        }),
      getRetryState: () => ({
        answers,
        resolutions,
        updatedDefs,
        resolvedDocs,
        resolutionSubmitted,
      }),
      isSubmitting: () => submitting,
    };
    return () => {
      draftRegistrationRef.current = null;
    };
  }, [
    draftRegistrationRef,
    answers,
    resolutions,
    updatedDefs,
    resolvedDocs,
    resolutionSubmitted,
    previousAnswers,
    submitting,
  ]);

  useEffect(() => {
    onDraftChange?.();
  }, [answers, resolutions, updatedDefs, resolvedDocs, resolutionSubmitted, onDraftChange]);

  const [deficienciesOpen, setDeficienciesOpen] = useState(true);
  const [remainingOpen, setRemainingOpen] = useState(false);

  const allResolved = deficiencyQuestions.every((q) =>
    getRetryItems(q, previousAnswers).every((item) => resolutions[item.key] != null),
  );

  const incompleteRetryDeficiencyCount = deficiencyQuestions.reduce((total, q) => {
    const defQuestion = getRetryDeficiencyQuestion(q);
    for (const item of getRetryItems(q, previousAnswers)) {
      if (
        resolutions[item.key] === "failing" &&
        hasRetryDeficiencyCards(q, previousAnswers)
      ) {
        const updated =
          updatedDefs[item.key] ??
          (item.deficiency ? { ...item.deficiency } : newRetryDeficiency());
        if (!isRetryDeficiencyComplete(defQuestion, updated)) total++;
      }
    }
    return total;
  }, 0);

  const incompleteResolutionCount = deficiencyQuestions.reduce((total, q) => {
    for (const item of getRetryItems(q, previousAnswers)) {
      if (
        resolutions[item.key] === "resolved" &&
        !resolutionSubmitted[item.key]
      ) {
        total++;
      }
    }
    return total;
  }, 0);

  const incompleteRemainingCount = incompleteRemainingDeficiencyCount(
    remainingSections,
    answers,
  );

  const canSubmit =
    allResolved &&
    incompleteRetryDeficiencyCount === 0 &&
    incompleteResolutionCount === 0 &&
    incompleteRemainingCount === 0 &&
    !submitting;

  const totalUniqueDeficiencies = countRetryItems(
    deficiencyQuestions,
    previousAnswers,
  );

  const unresolvedDeficiencyCount = deficiencyQuestions.reduce((total, q) => {
    return (
      total +
      getRetryItems(q, previousAnswers).filter((item) => resolutions[item.key] == null)
        .length
    );
  }, 0);

  function syncAnswers(
    nextRes: Record<string, Resolution>,
    nextUpd: Record<string, Deficiency>,
    nextDocs: Record<string, ResolutionDoc>,
    nextSubmitted: Record<string, boolean>,
  ) {
    setAnswers((prev) => {
      const merged = { ...prev };
      for (const q of deficiencyQuestions) {
        applyRetryAnswerToMap(
          merged,
          q,
          previousAnswers,
          buildQuestionAnswer(
            q,
            previousAnswers,
            nextRes,
            nextUpd,
            nextDocs,
            nextSubmitted,
          ),
        );
      }
      return merged;
    });
  }

  function commitResolution(
    key: string,
    resolution: Resolution,
    deficiency?: Deficiency,
  ) {
    setResolutions((prevRes) => {
      const nextRes = { ...prevRes, [key]: resolution };
      setResolutionSubmitted((prevSub) => {
        const nextSub = { ...prevSub };
        if (resolution !== "resolved") {
          delete nextSub[key];
        }
        setResolvedDocs((prevDocs) => {
          const nextDocs =
            resolution === "resolved" && !prevDocs[key]
              ? { ...prevDocs, [key]: { note: "", capturedFiles: [] } }
              : prevDocs;
          setUpdatedDefs((prevUpd) => {
            const nextUpd =
              resolution === "failing" && deficiency
                ? {
                    ...prevUpd,
                    [key]: prevUpd[key] ?? { ...deficiency, id: newDefId() },
                  }
                : prevUpd;
            syncAnswers(nextRes, nextUpd, nextDocs, nextSub);
            return nextUpd;
          });
          return nextDocs;
        });
        return nextSub;
      });
      return nextRes;
    });
  }

  function commitResolutionDoc(key: string, patch: Partial<ResolutionDoc>) {
    setResolvedDocs((prevDocs) => {
      const current = prevDocs[key] ?? { note: "", capturedFiles: [] };
      const nextDocs = { ...prevDocs, [key]: { ...current, ...patch } };
      setResolutions((prevRes) => {
        setUpdatedDefs((prevUpd) => {
          setResolutionSubmitted((prevSub) => {
            syncAnswers(prevRes, prevUpd, nextDocs, prevSub);
            return prevSub;
          });
          return prevUpd;
        });
        return prevRes;
      });
      return nextDocs;
    });
  }

  function submitResolutionDoc(key: string) {
    setResolvedDocs((prevDocs) => {
      if (!isRetryResolutionComplete(prevDocs[key])) return prevDocs;
      setResolutionSubmitted((prevSub) => {
        const nextSub = { ...prevSub, [key]: true };
        setResolutions((prevRes) => {
          setUpdatedDefs((prevUpd) => {
            syncAnswers(prevRes, prevUpd, prevDocs, nextSub);
            return prevUpd;
          });
          return prevRes;
        });
        return nextSub;
      });
      return prevDocs;
    });
  }

  function commitDefUpdate(key: string, patch: Partial<Deficiency>) {
    setUpdatedDefs((prevUpd) => {
      const current = prevUpd[key] ?? newRetryDeficiency();
      const nextUpd = { ...prevUpd, [key]: { ...current, ...patch } };
      setResolutions((prevRes) => {
        setResolvedDocs((prevDocs) => {
          setResolutionSubmitted((prevSub) => {
            syncAnswers(prevRes, nextUpd, prevDocs, prevSub);
            return prevSub;
          });
          return prevDocs;
        });
        return prevRes;
      });
      return nextUpd;
    });
  }

  function handleRemainingChange(questionId: string, next: AnswerState) {
    setAnswers((prev) =>
      seedAnswersIfEnabled({ ...prev, [questionId]: next }),
    );
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit(answers);
    } finally {
      setSubmitting(false);
    }
  }

  const remainingCount = remainingSections.reduce(
    (acc, s) => acc + s.questions.length,
    0,
  );

  const deficiencySectionGroups = groupQuestionsBySectionTitle(
    deficiencyQuestions,
    questionSectionMap,
  );

  return (
    <div className="inspection-retry inspection-record">
      <InspectionSheetHeader
        sticky
        closeLabel={tCommon("close")}
        onClose={onClose}
        locationParts={locationParts}
        categoryEyebrow={categoryEyebrow}
        title={template.name}
        scopeCode={scope?.scopeType?.code ?? undefined}
        scopeTypeName={scope?.scopeType?.name ?? undefined}
        attemptLabel={t("retryAttemptLabel", { n: attemptNumber })}
        outcome={{ passed: null }}
        installerName={scope?.installer?.name ?? t("overlayUnassigned")}
        dateLabel={formatInspectionDateLabel(previousSubmittedAt)}
        submittedBy={previousSubmittedBy}
      />

      <div className="inspection-record__body inspection-retry__body">
        {deficiencyQuestions.length > 0 && (
          <InspectionReportPanel
            tone="fail"
            layout="bleed"
            stickySectionHeader
            title={t("retryOpenDeficiencies")}
            status={t("deficiencyCountDisplay", { count: totalUniqueDeficiencies })}
            open={deficienciesOpen}
            onToggle={() => setDeficienciesOpen((o) => !o)}
          >
            {deficiencySectionGroups.map((group) => {
              const groupCount = sectionGroupUniqueDeficiencyCount(
                group.questions,
                previousAnswers,
              );
              return (
                <InspectionReportCategory key={group.sectionTitle ?? group.questions[0]!.id} tone="fail">
                  {group.sectionTitle && (
                    <InspectionReportCategoryHeader
                      tone="fail"
                      title={group.sectionTitle}
                      status={t("deficiencyCountDisplay", { count: groupCount })}
                      outcome={
                        group.questions.length === 1 ? (
                          <PreviousAnswerReadout
                            question={group.questions[0]!}
                            previousAnswer={previousAnswers[group.questions[0]!.id]}
                          />
                        ) : undefined
                      }
                    />
                  )}
                  <InspectionReportCategoryBody>
                    {group.questions.map((q) => (
                      <DeficiencyQuestion
                        key={q.id}
                        question={q}
                        previousAnswers={previousAnswers}
                        showAnswerReadout={
                          !group.sectionTitle || group.questions.length > 1
                        }
                        resolutions={resolutions}
                        updatedDefs={updatedDefs}
                        resolvedDocs={resolvedDocs}
                        resolutionSubmitted={resolutionSubmitted}
                        onResolve={(key, deficiency) =>
                          commitResolution(key, "resolved", deficiency)
                        }
                        onStillFailing={(key, deficiency) =>
                          commitResolution(key, "failing", deficiency)
                        }
                        onUpdateDef={(key, patch) => commitDefUpdate(key, patch)}
                        onUpdateResolutionDoc={(key, patch) =>
                          commitResolutionDoc(key, patch)
                        }
                        onSubmitResolution={(key) => submitResolutionDoc(key)}
                      />
                    ))}
                  </InspectionReportCategoryBody>
                </InspectionReportCategory>
              );
            })}
          </InspectionReportPanel>
        )}

        {remainingCount > 0 && (
          <InspectionReportPanel
            tone="pass"
            layout="bleed"
            title={t("retryReviewRemaining")}
            status={String(remainingCount)}
            open={remainingOpen}
            onToggle={() => setRemainingOpen((o) => !o)}
          >
            {remainingSections.map((section) => {
              const tone = remainingSectionTone(section, answers);
              const sectionFailed = tone === "fail";
              const failOccurrences = section.questions.reduce((sum, q) => {
                if (!isRemainingAnswerFailed(q, answers[q.id])) return sum;
                return sum + answerDeficiencyOccurrences(answers[q.id]);
              }, 0);
              const statusLabel = sectionFailed
                ? failOccurrences > 0
                  ? t("deficiencyCountDisplay", { count: failOccurrences })
                  : t("failLabel")
                : t("passLabel");
              const soleQuestion =
                section.questions.length === 1 ? section.questions[0]! : null;
              const headerOutcome =
                soleQuestion &&
                (soleQuestion.responseType === "PASS_FAIL" ||
                  soleQuestion.responseType === "PASS_FAIL_DEFICIENCIES" ||
                  soleQuestion.responseType === "YES_NO")
                  ? remainingAnswerOutcomeReadout(soleQuestion, answers[soleQuestion.id], t)
                  : undefined;

              return (
              <InspectionReportCategory
                key={section.id}
                tone={tone}
              >
                {section.title.trim() && (
                  <InspectionReportCategoryHeader
                    tone={tone}
                    title={section.title}
                    status={dedupeCategoryHeaderStatus(
                      statusLabel,
                      Boolean(headerOutcome),
                      t("passLabel"),
                      t("failLabel"),
                    )}
                    outcome={headerOutcome}
                  />
                )}
                <InspectionReportCategoryBody>
                  {section.questions.map((q) => (
                    <InspectionReportQuestionBlock
                      key={q.id}
                      title={q.title}
                      required={q.required}
                      compactTitle={Boolean(section.title.trim())}
                      outcome={
                        section.questions.length > 1
                          ? remainingAnswerOutcomeReadout(q, answers[q.id], t)
                          : undefined
                      }
                    >
                      <RemainingItem
                        question={q}
                        answer={answers[q.id]}
                        onChange={(next) => handleRemainingChange(q.id, next)}
                      />
                    </InspectionReportQuestionBlock>
                  ))}
                </InspectionReportCategoryBody>
              </InspectionReportCategory>
            );
            })}
          </InspectionReportPanel>
        )}

        <div className="inspection-retry__notes">
          <AutoNotesSection
            notes={answers[AUTO_NOTES_KEY]?.text ?? ""}
            capturedFiles={answers[AUTO_MEDIA_KEY]?.capturedFiles}
            onNotesChange={(text) =>
              setAnswers((prev) => ({ ...prev, [AUTO_NOTES_KEY]: { ...prev[AUTO_NOTES_KEY], text } }))
            }
            onMediaChange={(capturedFiles) =>
              setAnswers((prev) => ({
                ...prev,
                [AUTO_MEDIA_KEY]: { ...prev[AUTO_MEDIA_KEY], capturedFiles: capturedFiles ?? undefined },
              }))
            }
          />
        </div>
      </div>

      <div className="inspection-retry-footer">
        {!allResolved && unresolvedDeficiencyCount > 0 && (
          <div role="alert" className="inspection-retry-alert">
            {t("retryResolveEachDeficiency")}{" "}
            {t("retryUnresolvedDeficiencyCount", { count: unresolvedDeficiencyCount })}
          </div>
        )}
        {allResolved &&
          (incompleteRetryDeficiencyCount > 0 || incompleteRemainingCount > 0) && (
          <div role="alert" className="inspection-retry-alert">
            {t("retryCompleteBeforeSubmit")}
          </div>
        )}
        {allResolved &&
          incompleteRetryDeficiencyCount === 0 &&
          incompleteRemainingCount === 0 &&
          incompleteResolutionCount > 0 && (
            <div role="alert" className="inspection-retry-alert">
              {t("retryCompleteResolutionBeforeSubmit")}
            </div>
          )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inspection-retry-submit"
        >
          {submitting
            ? t("retrySubmitting")
            : t("retrySubmitAttempt", { n: attemptNumber })}
        </button>
      </div>
    </div>
  );
}

// ── DeficiencyQuestion ────────────────────────────────────────────────────────

function DeficiencyQuestion({
  question,
  previousAnswers,
  showAnswerReadout = true,
  resolutions,
  updatedDefs,
  resolvedDocs,
  resolutionSubmitted,
  onResolve,
  onStillFailing,
  onUpdateDef,
  onUpdateResolutionDoc,
  onSubmitResolution,
}: {
  question: FormQuestion;
  previousAnswers: AnswersMap;
  showAnswerReadout?: boolean;
  resolutions: Record<string, Resolution>;
  updatedDefs: Record<string, Deficiency>;
  resolvedDocs: Record<string, ResolutionDoc>;
  resolutionSubmitted: Record<string, boolean>;
  onResolve: (key: string, deficiency?: Deficiency) => void;
  onStillFailing: (key: string, deficiency?: Deficiency) => void;
  onUpdateDef: (key: string, patch: Partial<Deficiency>) => void;
  onUpdateResolutionDoc: (key: string, patch: Partial<ResolutionDoc>) => void;
  onSubmitResolution: (key: string) => void;
}) {
  const previousAnswer = getRetryAnswerForQuestion(question, previousAnswers);
  const defQuestion = getRetryDeficiencyQuestion(question);
  const items = getRetryItems(question, previousAnswers);
  const hasDeficiencyCards = hasRetryDeficiencyCards(question, previousAnswers);

  return (
    <InspectionReportQuestionBlock
      title={question.title}
      required={question.required}
      compactTitle
      outcome={
        showAnswerReadout ? (
          <PreviousAnswerReadout question={question} previousAnswer={previousAnswer} />
        ) : undefined
      }
    >
      {hasDeficiencyCards ? (
        <InspectionReportDeficiencyList>
          {items.map((item) => (
            <div key={item.key} className="inspection-retry-deficiency-block">
              <DeficiencyRetryItem
                itemKey={item.key}
                question={defQuestion}
                deficiency={item.deficiency!}
                resolution={resolutions[item.key] ?? null}
                updatedDef={updatedDefs[item.key]}
                resolutionDoc={resolvedDocs[item.key]}
                resolutionSubmitted={Boolean(resolutionSubmitted[item.key])}
                onResolve={() => onResolve(item.key, item.deficiency)}
                onStillFailing={() => onStillFailing(item.key, item.deficiency)}
                onUpdateDef={(patch) => onUpdateDef(item.key, patch)}
                onUpdateResolutionDoc={(patch) => onUpdateResolutionDoc(item.key, patch)}
                onSubmitResolution={() => onSubmitResolution(item.key)}
              />
            </div>
          ))}
        </InspectionReportDeficiencyList>
      ) : (
        <div className="inspection-retry-deficiency-actions">
          <ResolutionToggle
            resolution={resolutions[items[0]!.key] ?? null}
            onResolve={() => onResolve(items[0]!.key)}
            onStillFailing={() => onStillFailing(items[0]!.key)}
          />
          {resolutions[items[0]!.key] === "resolved" && (
            <ResolutionDocForm
              doc={resolvedDocs[items[0]!.key]}
              submitted={Boolean(resolutionSubmitted[items[0]!.key])}
              onChange={(patch) => onUpdateResolutionDoc(items[0]!.key, patch)}
              onSubmit={() => onSubmitResolution(items[0]!.key)}
            />
          )}
        </div>
      )}
    </InspectionReportQuestionBlock>
  );
}

function PreviousAnswerReadout({
  question,
  previousAnswer,
}: {
  question: FormQuestion;
  previousAnswer: AnswerState | undefined;
}) {
  const t = useTranslations("inspections");
  const { responseType } = question;
  const choice = previousAnswer?.choice;

  if (
    responseType !== "PASS_FAIL" &&
    responseType !== "PASS_FAIL_DEFICIENCIES" &&
    responseType !== "YES_NO"
  ) {
    return (
      <span className="inspection-record-plain">
        {choice ?? t("emptyAnswerDash")}
      </span>
    );
  }

  if (responseType === "YES_NO") {
    const passed = choice === "yes";
    return (
      <RecordedAnswerReadout
        label={passed ? t("yesLabel") : t("noLabel")}
        passed={passed}
      />
    );
  }

  const passed = choice === "pass";
  const na = choice === "na";
  return (
    <RecordedAnswerReadout
      label={na ? t("naLabel") : passed ? t("passLabel") : t("failLabel")}
      passed={na ? null : passed}
    />
  );
}

function DeficiencyRetryItem({
  question,
  deficiency,
  resolution,
  updatedDef,
  resolutionDoc,
  resolutionSubmitted,
  onResolve,
  onStillFailing,
  onUpdateDef,
  onUpdateResolutionDoc,
  onSubmitResolution,
}: {
  itemKey: string;
  question: FormQuestion;
  deficiency: Deficiency;
  resolution: Resolution | null;
  updatedDef?: Deficiency;
  resolutionDoc?: ResolutionDoc;
  resolutionSubmitted: boolean;
  onResolve: () => void;
  onStillFailing: () => void;
  onUpdateDef: (patch: Partial<Deficiency>) => void;
  onUpdateResolutionDoc: (patch: Partial<ResolutionDoc>) => void;
  onSubmitResolution: () => void;
}) {
  const t = useTranslations("inspections");
  const [cameraOpen, setCameraOpen] = useState(false);
  const workingDef = updatedDef ?? deficiency;

  return (
    <>
      <InspectionReportDeficiencyRow deficiency={deficiency} />

      <ResolutionToggle
        resolution={resolution}
        onResolve={onResolve}
        onStillFailing={onStillFailing}
      />

      {resolution === "resolved" && (
        <ResolutionDocForm
          doc={resolutionDoc}
          submitted={resolutionSubmitted}
          onChange={onUpdateResolutionDoc}
          onSubmit={onSubmitResolution}
        />
      )}

      {resolution === "failing" && (
        <div className="inspection-retry-deficiency-update">
          <p className="inspection-retry-update-label">{t("retryUpdateDeficiency")}</p>
          <NewDeficiencyEntry
            deficiency={workingDef}
            showLabel={false}
            canRemove={false}
            onRemove={() => undefined}
            onChange={onUpdateDef}
            onAddPhoto={() => setCameraOpen(true)}
            descriptionEnabled={question.deficiencyDescriptionEnabled ?? true}
            photoRequired={question.deficiencyPhotoRequired ?? false}
          />
        </div>
      )}

      {cameraOpen && (
        <CameraCapture
          onCapture={(captured) => {
            const items: CapturedMediaItem[] = captured.map((c) => ({
              localUrl: c.localUrl,
              mimeType: c.mimeType,
              file: c.file,
            }));
            onUpdateDef({
              capturedFiles: [...(workingDef.capturedFiles ?? []), ...items],
            });
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );
}

function ResolutionDocForm({
  doc,
  submitted,
  onChange,
  onSubmit,
}: {
  doc?: ResolutionDoc;
  submitted: boolean;
  onChange: (patch: Partial<ResolutionDoc>) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations("inspections");
  const [cameraOpen, setCameraOpen] = useState(false);
  const noteId = useId();
  const capturedFiles = doc?.capturedFiles ?? [];
  const noteComplete = isRetryResolutionComplete(doc);

  if (submitted) {
    return (
      <div className="inspection-retry-resolution-submitted">
        <p className="inspection-retry-resolution-submitted__label">
          <Check size={16} aria-hidden />
          {t("retryResolutionSubmitted")}
        </p>
        {doc?.note?.trim() && (
          <p className="inspection-retry-resolution-submitted__note">{doc.note.trim()}</p>
        )}
        {capturedFiles.length > 0 && (
          <div className="inspection-retry-resolution-submitted__media">
            <ClickableMediaStrip files={capturedFiles} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="inspection-retry-resolution-doc">
      <p className="inspection-retry-update-label">{t("retryDocumentResolution")}</p>
      <label className="inspection-retry-resolution-doc__label" htmlFor={noteId}>
        {t("retryResolutionNoteLabel")}
      </label>
      <textarea
        id={noteId}
        className="inspection-retry-textarea"
        value={doc?.note ?? ""}
        placeholder={t("retryResolutionNotePlaceholder")}
        rows={3}
        onChange={(e) => onChange({ note: e.target.value })}
      />

      {capturedFiles.length > 0 && (
        <div className="inspection-retry-resolution-doc__media">
          <AnnotatableThumbStrip
            files={capturedFiles}
            onRemove={(i) => {
              const next = capturedFiles.filter((_, idx) => idx !== i);
              onChange({ capturedFiles: next.length ? next : undefined });
            }}
            onReplace={(i, updated) => {
              onChange({
                capturedFiles: capturedFiles.map((f, idx) => (idx === i ? updated : f)),
              });
            }}
          />
        </div>
      )}

      <button
        type="button"
        className="inspection-retry-resolution-photo-btn"
        onClick={() => setCameraOpen(true)}
      >
        <Camera size={16} aria-hidden />
        {capturedFiles.length > 0 ? t("retryAddMorePhotos") : t("retryAddPhoto")}
      </button>

      <button
        type="button"
        className="inspection-retry-resolution-submit-btn"
        disabled={!noteComplete}
        onClick={onSubmit}
      >
        {t("retrySubmitResolution")}
      </button>

      {cameraOpen && (
        <CameraCapture
          onCapture={(captured) => {
            const items: CapturedMediaItem[] = captured.map((c) => ({
              localUrl: c.localUrl,
              mimeType: c.mimeType,
              file: c.file,
            }));
            onChange({
              capturedFiles: [...capturedFiles, ...items],
            });
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}

function ResolutionToggle({
  resolution,
  onResolve,
  onStillFailing,
}: {
  resolution: Resolution | null;
  onResolve: () => void;
  onStillFailing: () => void;
}) {
  const t = useTranslations("inspections");

  return (
    <div className="inspection-retry-resolution">
      <button
        type="button"
        onClick={onResolve}
        className={`inspection-retry-resolution__btn inspection-retry-resolution__btn--resolved${resolution === "resolved" ? " is-selected" : ""}`}
      >
        <Check size={14} strokeWidth={2.5} aria-hidden />
        {t("retryResolved")}
      </button>
      <button
        type="button"
        onClick={onStillFailing}
        className={`inspection-retry-resolution__btn inspection-retry-resolution__btn--failing${resolution === "failing" ? " is-selected" : ""}`}
      >
        <X size={14} strokeWidth={2.5} aria-hidden />
        {t("retryStillFailing")}
      </button>
    </div>
  );
}

// ── NewDeficiencyEntry ────────────────────────────────────────────────────────

function NewDeficiencyEntry({
  deficiency,
  showLabel,
  canRemove,
  onChange,
  onRemove,
  onAddPhoto,
  descriptionEnabled,
  photoRequired,
  descriptionPlaceholder,
}: {
  deficiency: Deficiency;
  showLabel: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<Deficiency>) => void;
  onRemove: () => void;
  onAddPhoto: () => void;
  descriptionEnabled: boolean;
  photoRequired: boolean;
  descriptionPlaceholder?: string;
}) {
  const t = useTranslations("inspections");
  const capturedFiles = deficiency.capturedFiles ?? [];
  const capturedCount = capturedFiles.length;
  const placeholder = descriptionPlaceholder ?? t("retryDescribeStillFailing");

  return (
    <div className="inspection-retry-new-deficiency">
      {showLabel && (
        <div className="inspection-retry-new-deficiency__head">
          <span className="inspection-retry-new-deficiency__label">
            {t("retryAdditionalDeficiency")}
          </span>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={t("retryRemoveDeficiency")}
              className="inspection-retry-new-deficiency__remove"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}

      {descriptionEnabled && (
        <textarea
          value={deficiency.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={placeholder}
          rows={2}
          className="inspection-retry-textarea"
        />
      )}

      <div style={{ marginTop: descriptionEnabled ? 8 : 0 }}>
        <div className="inspection-retry-field-label">{t("retryOccurrences")}</div>
        <div className="inspection-retry-count-stepper">
          <button
            type="button"
            aria-label={t("retryDecreaseCount")}
            onClick={() => onChange({ count: Math.max(1, (deficiency.count ?? 1) - 1) })}
            disabled={(deficiency.count ?? 1) <= 1}
            className="inspection-retry-count-stepper__btn"
          >
            -
          </button>
          <div aria-live="polite" className="inspection-retry-count-stepper__value">
            {deficiency.count ?? 1}
          </div>
          <button
            type="button"
            aria-label={t("retryIncreaseCount")}
            onClick={() => onChange({ count: (deficiency.count ?? 1) + 1 })}
            className="inspection-retry-count-stepper__btn"
          >
            +
          </button>
        </div>
      </div>

      {capturedCount > 0 && (
        <div style={{ marginTop: 8 }}>
          <AnnotatableThumbStrip
            files={capturedFiles}
            onRemove={(i) => {
              const next = capturedFiles.filter((_, idx) => idx !== i);
              onChange({ capturedFiles: next.length ? next : undefined });
            }}
            onReplace={(i, updated) => {
              onChange({
                capturedFiles: capturedFiles.map((f, idx) => (idx === i ? updated : f)),
              });
            }}
          />
        </div>
      )}

      <div className="inspection-retry-severity-row">
        {DEFICIENCY_SEVERITIES.map((sev) => {
          const active = deficiency.severity === sev;
          const mod = deficiencySeverityModifier(sev);
          return (
            <button
              key={sev}
              type="button"
              onClick={() =>
                onChange({ severity: active ? undefined : (sev as DeficiencySeverity) })
              }
              className={`inspection-retry-severity-btn inspection-retry-severity-btn--${mod}${active ? ` is-selected--${mod}` : ""}`}
            >
              {sev}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onAddPhoto}
          className={`inspection-retry-photo-btn${capturedCount > 0 ? " is-captured" : ""}`}
        >
          <Camera size={11} aria-hidden />
          {capturedCount > 0 ? t("retryAddMorePhotos") : t("retryAddPhoto")}
          {photoRequired ? " *" : ""}
        </button>
      </div>
    </div>
  );
}

function remainingAnswerOutcomeReadout(
  question: FormQuestion,
  answer: AnswerState | undefined,
  t: ReturnType<typeof useTranslations<"inspections">>,
) {
  const { responseType } = question;
  const choice = answer?.choice;
  if (
    responseType !== "PASS_FAIL" &&
    responseType !== "PASS_FAIL_DEFICIENCIES" &&
    responseType !== "YES_NO"
  ) {
    return undefined;
  }
  if (choice === undefined) return undefined;

  if (responseType === "YES_NO") {
    const passed = choice === "yes";
    return (
      <RecordedAnswerReadout
        label={passed ? t("yesLabel") : t("noLabel")}
        passed={passed}
      />
    );
  }

  const passed = choice === "pass";
  const na = choice === "na";
  return (
    <RecordedAnswerReadout
      label={
        na ? t("naLabel") : passed ? t("passLabel") : t("failLabel")
      }
      passed={na ? null : passed}
    />
  );
}

// ── RemainingItem ─────────────────────────────────────────────────────────────

function RemainingItem({
  question,
  answer,
  onChange,
}: {
  question: FormQuestion;
  answer: AnswerState | undefined;
  onChange: (next: AnswerState) => void;
}) {
  const t = useTranslations("inspections");
  const { responseType } = question;
  const isChoice =
    responseType === "PASS_FAIL" ||
    responseType === "PASS_FAIL_DEFICIENCIES" ||
    responseType === "YES_NO";
  const isText =
    responseType === "SHORT_ANSWER" || responseType === "PARAGRAPH";
  const isFail = isRemainingAnswerFailed(question, answer);

  const opts: { value: string; label: string; tone: "pass" | "fail" | "na" }[] =
    responseType === "YES_NO"
      ? [
          { value: "yes", label: t("yesLabel"), tone: "pass" },
          { value: "no", label: t("noLabel"), tone: "fail" },
        ]
      : [
          { value: "pass", label: t("passLabel"), tone: "pass" },
          { value: "fail", label: t("failLabel"), tone: "fail" },
          { value: "na", label: t("naLabel"), tone: "na" },
        ];

  function handleChoiceChange(value: string) {
    if (responseType === "PASS_FAIL_DEFICIENCIES" && value === "fail") {
      onChange({
        ...answer,
        choice: value,
        deficiencies:
          answer?.deficiencies && answer.deficiencies.length > 0
            ? answer.deficiencies
            : [newDeficiency()],
      });
      return;
    }
    if (responseType === "PASS_FAIL_DEFICIENCIES") {
      onChange({ ...answer, choice: value, deficiencies: undefined });
      return;
    }
    onChange({ ...answer, choice: value });
  }

  if (responseType === "PASS_FAIL_DEFICIENCIES") {
    return (
      <div className="form-pass-fail-branch">
        <ChoiceButtons
          options={[
            { value: "pass", label: t("passLabel"), tone: "pass" },
            { value: "fail", label: t("failLabel"), tone: "fail" },
            { value: "na", label: t("naLabel"), tone: "na" },
          ]}
          value={answer?.choice}
          onChange={handleChoiceChange}
        />
        {isFail && (
          <DeficiencyCapture
            deficiencies={answer?.deficiencies ?? [newDeficiency()]}
            onChange={(deficiencies) =>
              onChange({ ...answer, choice: "fail", deficiencies })
            }
            showValidation={false}
            descriptionEnabled={question.deficiencyDescriptionEnabled ?? true}
            photoRequired={question.deficiencyPhotoRequired ?? false}
            allowAdditionalEntries={allowsAdditionalDeficiencies(question)}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {isChoice && (
        <div className="inspection-retry-readout-choices" style={{ pointerEvents: "auto" }}>
          {opts.map(({ value, label, tone }) => {
            const active = answer?.choice === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => handleChoiceChange(value)}
                className={`inspection-retry-choice inspection-retry-choice--${tone}${active ? " is-selected" : ""}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {isText && (
        <textarea
          value={answer?.text ?? ""}
          onChange={(e) => onChange({ ...answer, text: e.target.value })}
          rows={responseType === "PARAGRAPH" ? 3 : 1}
          className="inspection-retry-textarea"
          style={{ borderColor: "var(--color-divider)" }}
        />
      )}

      {responseType === "NUMBER" && (
        <input
          type="number"
          value={answer?.number ?? ""}
          onChange={(e) => onChange({ ...answer, number: e.target.value })}
          className="inspection-retry-input"
          style={{ width: 140, borderColor: "var(--color-divider)" }}
        />
      )}

      {responseType === "RATING" && (
        <div style={{ display: "flex", gap: 2 }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => onChange({ ...answer, rating: star })}
              style={{
                fontSize: 22,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "2px 3px",
                color:
                  (answer?.rating ?? 0) >= star ? "var(--warning-600)" : "var(--neutral-200)",
                transition: "color 0.1s",
              }}
            >
              ★
            </button>
          ))}
        </div>
      )}

      {(responseType === "MULTIPLE_CHOICE" || responseType === "CHECKBOXES") &&
        question.options.map((opt) => {
          const active =
            responseType === "MULTIPLE_CHOICE"
              ? answer?.choice === opt
              : (answer?.choices ?? []).includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                if (responseType === "MULTIPLE_CHOICE") {
                  onChange({ ...answer, choice: opt });
                } else {
                  const prev = answer?.choices ?? [];
                  const next = prev.includes(opt)
                    ? prev.filter((c) => c !== opt)
                    : [...prev, opt];
                  onChange({ ...answer, choices: next });
                }
              }}
              className={`inspection-retry-choice inspection-retry-choice--neutral${active ? " is-selected" : ""}`}
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4 }}
            >
              {opt}
            </button>
          );
        })}
    </>
  );
}

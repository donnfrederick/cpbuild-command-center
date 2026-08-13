import type { FormQuestion, FormSection } from "@/components/forms/formTypes";
import type {
  BySeverity,
  DeficiencyItem,
  QuestionResult,
  SectionResult,
} from "@/app/api/projects/[id]/inspections-report/route";

export interface InspectionReportNormalizedAnswer {
  questionId: string;
  choiceValue: string | null;
  isFailed: boolean;
  isNotApplicable: boolean;
  formVersionQuestion: {
    title: string;
    responseType: string;
    sourceSectionId: string;
    section: { title: string } | null;
  } | null;
  deficiencies: Array<{
    description: string | null;
    count: number;
    severity: string | null;
  }>;
}

export interface BuildSubmissionSectionResultsInput {
  outcome: string;
  deficiencyCount: number;
  answers: InspectionReportNormalizedAnswer[];
}

export interface SubmissionSectionBuildResult {
  sections: SectionResult[];
  totalDeficiencies: number;
  bySeverity: BySeverity;
}

function emptySev(): BySeverity {
  return { Minor: 0, Major: 0, Critical: 0 };
}

function mapDeficiencies(
  items: Array<{ description: string | null; count: number; severity: string | null }>
): DeficiencyItem[] {
  return items.map((d) => ({
    description: d.description ?? "",
    count: Math.max(1, Math.trunc(Number(d.count) || 1)),
    severity: d.severity ?? undefined,
  }));
}

function accumulateSeverity(
  bySeverity: BySeverity,
  deficiencies: DeficiencyItem[]
): void {
  for (const d of deficiencies) {
    const sev = d.severity as keyof BySeverity | undefined;
    if (sev && sev in bySeverity) {
      bySeverity[sev] += d.count;
    }
  }
}

/**
 * Builds section/deficiency breakdown for the inspections report from normalized
 * inspection_answers + inspection_deficiencies only.
 */
export function buildSubmissionSectionResults(
  input: BuildSubmissionSectionResultsInput
): SubmissionSectionBuildResult {
  const sectionMap = new Map<string, SectionResult>();
  let totalDeficiencies = 0;
  const bySeverity = emptySev();

  for (const answer of input.answers) {
    const versionQuestion = answer.formVersionQuestion;
    const responseType = versionQuestion?.responseType;
    if (responseType !== "PASS_FAIL" && responseType !== "PASS_FAIL_DEFICIENCIES") continue;
    if (!answer.choiceValue) continue;

    const sectionTitle = versionQuestion?.section?.title ?? "General";
    const sectionKey = versionQuestion?.sourceSectionId ?? sectionTitle;
    let section = sectionMap.get(sectionKey);
    if (!section) {
      section = {
        sectionTitle,
        passed: true,
        totalOccurrences: 0,
        questions: [],
        failingQuestions: [],
      };
      sectionMap.set(sectionKey, section);
    }

    const qPassed = !answer.isFailed || answer.isNotApplicable;
    if (!qPassed) section.passed = false;

    const deficiencies = mapDeficiencies(answer.deficiencies);
    const qOcc = deficiencies.reduce((sum, d) => sum + d.count, 0);
    section.totalOccurrences += qOcc;
    totalDeficiencies += qOcc;
    accumulateSeverity(bySeverity, deficiencies);

    const questionResult: QuestionResult = {
      questionTitle: versionQuestion?.title ?? answer.questionId,
      passed: qPassed,
      totalOccurrences: qOcc,
      deficiencies,
    };
    section.questions.push(questionResult);

    if (!qPassed) {
      section.failingQuestions.push(questionResult);
    }
  }

  return {
    sections: Array.from(sectionMap.values()),
    totalDeficiencies,
    bySeverity,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInspectableQuestion(question: FormQuestion): boolean {
  return (
    question.responseType === "PASS_FAIL" ||
    question.responseType === "PASS_FAIL_DEFICIENCIES" ||
    question.responseType === "YES_NO"
  );
}

/** @deprecated Use isInspectableQuestion — kept for internal call sites in this module. */
function isPassFailQuestion(question: FormQuestion): boolean {
  return isInspectableQuestion(question);
}

export function flattenInspectableQuestions(sections: FormSection[]): Array<{
  question: FormQuestion;
  sectionId: string;
  sectionTitle: string;
}> {
  const rows: Array<{ question: FormQuestion; sectionId: string; sectionTitle: string }> = [];
  for (const section of sections) {
    for (const question of section.questions) {
      if (isPassFailQuestion(question)) {
        rows.push({
          question,
          sectionId: section.id,
          sectionTitle: section.title,
        });
      }
    }
  }
  return rows;
}

function payloadDeficiencies(raw: unknown): DeficiencyItem[] {
  if (!isRecord(raw) || !Array.isArray(raw.deficiencies)) return [];
  return raw.deficiencies
    .filter(isRecord)
    .map((item) => ({
      description: typeof item.description === "string" ? item.description : "",
      count: Math.max(1, Math.trunc(Number(item.count) || 1)),
      severity: typeof item.severity === "string" ? item.severity : undefined,
    }));
}

/** Legacy submissions may only have JSON payload until reporting backfill runs. */
export function formSectionsFromTemplateSnapshot(snapshot: unknown): FormSection[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.sections)) return [];
  const sections: FormSection[] = [];
  for (const rawSection of snapshot.sections) {
    if (!isRecord(rawSection)) continue;
    const id = typeof rawSection.id === "string" ? rawSection.id : "";
    const title = typeof rawSection.title === "string" ? rawSection.title : "General";
    if (!id) continue;
    const questions: FormQuestion[] = [];
    if (Array.isArray(rawSection.questions)) {
      for (const rawQuestion of rawSection.questions) {
        if (!isRecord(rawQuestion)) continue;
        const questionId = typeof rawQuestion.id === "string" ? rawQuestion.id : "";
        const responseType = rawQuestion.responseType;
        if (
          !questionId ||
          (responseType !== "PASS_FAIL" &&
            responseType !== "PASS_FAIL_DEFICIENCIES" &&
            responseType !== "YES_NO")
        ) {
          continue;
        }
        questions.push({
          id: questionId,
          title: typeof rawQuestion.title === "string" ? rawQuestion.title : questionId,
          description: typeof rawQuestion.description === "string" ? rawQuestion.description : "",
          responseType,
          required: Boolean(rawQuestion.required),
          photoRequired: Boolean(rawQuestion.photoRequired),
          deficiencyPhotoRequired: Boolean(rawQuestion.deficiencyPhotoRequired),
          options: [],
        });
      }
    }
    sections.push({ id, title, questions });
  }
  return sections;
}

export interface BuildSubmissionSectionResultsFromPayloadInput {
  sections: FormSection[];
  payload: unknown;
}

/**
 * Builds the same section breakdown as normalized rows, reading legacy JSON payload.
 * Used when inspection_answers have not been backfilled yet.
 */
export function buildSubmissionSectionResultsFromPayload(
  input: BuildSubmissionSectionResultsFromPayloadInput
): SubmissionSectionBuildResult {
  if (!isRecord(input.payload)) {
    return { sections: [], totalDeficiencies: 0, bySeverity: emptySev() };
  }

  const sectionMap = new Map<string, SectionResult>();
  let totalDeficiencies = 0;
  const bySeverity = emptySev();

  for (const { question, sectionId, sectionTitle } of flattenInspectableQuestions(input.sections)) {
    const rawAnswer = input.payload[question.id];
    if (!isRecord(rawAnswer)) continue;
    const choice = typeof rawAnswer.choice === "string" ? rawAnswer.choice.toLowerCase() : "";
    const deficiencies = payloadDeficiencies(rawAnswer);
    const deficiencyOnlyFail = !choice && deficiencies.length > 0;
    if (!choice && !deficiencyOnlyFail) continue;

    let section = sectionMap.get(sectionId);
    if (!section) {
      section = {
        sectionTitle,
        passed: true,
        totalOccurrences: 0,
        questions: [],
        failingQuestions: [],
      };
      sectionMap.set(sectionId, section);
    }

    const isNotApplicable = choice === "n/a" || choice === "na";
    const qPassed =
      !deficiencyOnlyFail && (choice === "pass" || choice === "yes" || isNotApplicable);
    if (!qPassed) section.passed = false;

    const qOcc = deficiencies.reduce((sum, d) => sum + d.count, 0);
    section.totalOccurrences += qOcc;
    totalDeficiencies += qOcc;
    accumulateSeverity(bySeverity, deficiencies);

    const questionResult: QuestionResult = {
      questionTitle: question.title,
      passed: qPassed,
      totalOccurrences: qOcc,
      deficiencies,
    };
    section.questions.push(questionResult);

    if (!qPassed) {
      section.failingQuestions.push(questionResult);
    }
  }

  return {
    sections: Array.from(sectionMap.values()),
    totalDeficiencies,
    bySeverity,
  };
}

export function hasInspectablePayloadAnswers(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  return Object.keys(payload).some((key) => key !== "__autoNotes" && key !== "__autoMedia");
}

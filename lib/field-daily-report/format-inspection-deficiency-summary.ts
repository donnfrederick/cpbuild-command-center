import { AUTO_MEDIA_KEY, AUTO_NOTES_KEY } from "@/components/forms/formTypes";
import type { SectionResult } from "@/app/api/projects/[id]/inspections-report/route";
import {
  buildSubmissionSectionResultsFromPayload,
  flattenInspectableQuestions,
  formSectionsFromTemplateSnapshot,
} from "@/lib/inspections/inspection-report-sections";
import type { FieldMediaReference } from "@/lib/field-media-resolve";
import {
  inferFieldMediaMimeType,
  isImageMimeType,
  storageKeyFromFieldMediaUrl,
} from "@/lib/pdf/field-media-mime-infer";
import { mediaCacheKey } from "@/lib/pdf/field-media-pdf-helpers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ParsedAnswer {
  choice?: string;
  comment?: string;
  deficiencies: Array<{
    description: string;
    count: number;
    severity?: string;
    capturedFiles?: unknown[];
  }>;
  capturedFiles?: unknown[];
}

function parsePayloadAnswer(raw: unknown): ParsedAnswer | undefined {
  if (!isRecord(raw)) return undefined;
  const deficiencies = Array.isArray(raw.deficiencies)
    ? raw.deficiencies.filter(isRecord).map((item) => ({
        description: typeof item.description === "string" ? item.description : "",
        count: Math.max(1, Math.trunc(Number(item.count) || 1)),
        severity: typeof item.severity === "string" ? item.severity : undefined,
        capturedFiles: Array.isArray(item.capturedFiles) ? item.capturedFiles : undefined,
      }))
    : [];
  return {
    choice: typeof raw.choice === "string" ? raw.choice : undefined,
    comment: typeof raw.comment === "string" && raw.comment.trim() ? raw.comment.trim() : undefined,
    deficiencies,
    capturedFiles: Array.isArray(raw.capturedFiles) ? raw.capturedFiles : undefined,
  };
}

function mediaRefFromCapturedFile(file: unknown): FieldMediaReference | null {
  if (!isRecord(file)) return null;
  const storageUrl =
    (typeof file.storageUrl === "string" && file.storageUrl.trim()) ||
    (typeof file.serverUrl === "string" && file.serverUrl.trim()) ||
    (typeof file.localUrl === "string" && file.localUrl.startsWith("http") ? file.localUrl.trim() : "") ||
    "";
  if (!storageUrl) return null;
  const storageKey =
    (typeof file.storageKey === "string" && file.storageKey.trim()) ||
    storageKeyFromFieldMediaUrl(storageUrl) ||
    null;
  const mimeType = inferFieldMediaMimeType({
    storageUrl,
    storageKey,
    mimeType: typeof file.mimeType === "string" ? file.mimeType : null,
  });
  return { storageUrl, storageKey, mimeType };
}

function imageRefsFromFiles(files: unknown[] | undefined): FieldMediaReference[] {
  if (!files?.length) return [];
  const refs: FieldMediaReference[] = [];
  for (const file of files) {
    const ref = mediaRefFromCapturedFile(file);
    if (ref && isImageMimeType(ref.mimeType)) refs.push(ref);
  }
  return refs;
}

function dedupeImageRefs(refs: FieldMediaReference[]): FieldMediaReference[] {
  const seen = new Set<string>();
  const out: FieldMediaReference[] = [];
  for (const ref of refs) {
    const key = mediaCacheKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function imageRefsFromAnswer(answer: ParsedAnswer): FieldMediaReference[] {
  const refs = [...imageRefsFromFiles(answer.capturedFiles)];
  for (const deficiency of answer.deficiencies) {
    refs.push(...imageRefsFromFiles(deficiency.capturedFiles));
  }
  return dedupeImageRefs(refs);
}

function isPassedChoice(choice: string | undefined, deficiencyOnlyFail: boolean): boolean {
  if (deficiencyOnlyFail) return false;
  const normalized = choice?.toLowerCase() ?? "";
  if (normalized === "pass" || normalized === "yes") return true;
  if (normalized === "n/a" || normalized === "na") return true;
  return false;
}

function isFailedChoice(choice: string | undefined, answer: ParsedAnswer): boolean {
  const deficiencyOnlyFail = !choice && answer.deficiencies.length > 0;
  if (deficiencyOnlyFail) return true;
  const normalized = choice?.toLowerCase() ?? "";
  if (normalized === "fail" || normalized === "no") return true;
  return !isPassedChoice(choice, false);
}

function formatChoiceLabel(choice: string): string {
  const normalized = choice.toLowerCase();
  if (normalized === "pass") return "Pass";
  if (normalized === "fail") return "Fail";
  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No";
  if (normalized === "n/a" || normalized === "na") return "N/A";
  return choice;
}

export interface InspectionSubmissionDetailBlock {
  heading: string;
  lines: string[];
  imageRefs: FieldMediaReference[];
}

function blocksToPlainText(blocks: InspectionSubmissionDetailBlock[]): string {
  return blocks
    .flatMap((block) => block.lines.map((line) => `${block.heading}: ${line}`))
    .join("\n");
}

/**
 * Structured inspection details for field daily reports — failed questions with
 * deficiencies, notes, and photos; passed questions when notes or photos exist.
 */
export function buildInspectionSubmissionDetailBlocks(
  templateSnapshot: unknown,
  payloadInput: unknown,
): InspectionSubmissionDetailBlock[] {
  if (!isRecord(payloadInput)) return [];

  const payload = payloadInput;
  const sections = formSectionsFromTemplateSnapshot(templateSnapshot);
  const breakdown = buildSubmissionSectionResultsFromPayload({ sections, payload });
  const blocks: InspectionSubmissionDetailBlock[] = [];

  for (const { question } of flattenInspectableQuestions(sections)) {
    const rawAnswer = payload[question.id];
    const answer = parsePayloadAnswer(rawAnswer);
    if (!answer) continue;

    const imageRefs = imageRefsFromAnswer(answer);
    const hasDeficiencyText = answer.deficiencies.some((d) => d.description.trim());
    const deficiencyOnlyFail = !answer.choice && answer.deficiencies.length > 0;
    const hasContent =
      deficiencyOnlyFail ||
      Boolean(answer.choice) ||
      Boolean(answer.comment) ||
      imageRefs.length > 0 ||
      hasDeficiencyText;
    if (!hasContent) continue;

    const failed = isFailedChoice(answer.choice, answer);
    const lines: string[] = [];

    if (failed) {
      const matchingSection = breakdown.sections.find((section) =>
        section.failingQuestions.some((q) => q.questionTitle === question.title),
      );
      const failingQuestion = matchingSection?.failingQuestions.find(
        (q) => q.questionTitle === question.title,
      );
      const deficiencies =
        failingQuestion?.deficiencies.length
          ? failingQuestion.deficiencies
          : answer.deficiencies.map((d) => ({
              description: d.description,
              count: d.count,
              severity: d.severity,
            }));

      if (deficiencies.length === 0) {
        const base = "Fail";
        lines.push(answer.comment ? `${base} — ${answer.comment}` : base);
      } else {
        for (const [index, deficiency] of deficiencies.entries()) {
          const severity = deficiency.severity ? `[${deficiency.severity}] ` : "";
          const count = deficiency.count > 1 ? ` (×${deficiency.count})` : "";
          const description = deficiency.description?.trim() || "No description";
          const base = `${severity}${description}${count}`.trim();
          const isLast = index === deficiencies.length - 1;
          lines.push(answer.comment && isLast ? `${base} — ${answer.comment}` : base);
        }
      }
    } else {
      const label = formatChoiceLabel(answer.choice ?? "pass");
      if (answer.comment) {
        lines.push(`${label} — ${answer.comment}`);
      } else if (imageRefs.length > 0) {
        lines.push(`${label} — Photo attached`);
      } else {
        lines.push(label);
      }
    }

    blocks.push({
      heading: question.title,
      lines,
      imageRefs,
    });
  }

  const notesRaw = payload[AUTO_NOTES_KEY];
  const mediaRaw = payload[AUTO_MEDIA_KEY];
  const noteText =
    isRecord(notesRaw) && typeof notesRaw.text === "string" ? notesRaw.text.trim() : "";
  const mediaAnswer = parsePayloadAnswer(mediaRaw);
  const inspectorMediaRefs = dedupeImageRefs([
    ...imageRefsFromFiles(mediaAnswer?.capturedFiles),
  ]);

  if (noteText || inspectorMediaRefs.length > 0) {
    blocks.push({
      heading: "Inspector notes",
      lines: noteText ? [noteText] : inspectorMediaRefs.length > 0 ? ["Photo attached"] : [],
      imageRefs: inspectorMediaRefs,
    });
  }

  return blocks;
}

/** Plain-text summary of failed questions / deficiencies for field daily report lines. */
export function formatInspectionDeficiencySummary(sections: SectionResult[]): string {
  const lines: string[] = [];

  for (const section of sections) {
    for (const question of section.failingQuestions) {
      if (question.deficiencies.length === 0) {
        lines.push(`${question.questionTitle}: Fail`);
        continue;
      }
      for (const deficiency of question.deficiencies) {
        const severity = deficiency.severity ? `[${deficiency.severity}] ` : "";
        const count = deficiency.count > 1 ? ` (×${deficiency.count})` : "";
        const description = deficiency.description?.trim() || "No description";
        lines.push(`${question.questionTitle}: ${severity}${description}${count}`.trim());
      }
    }
  }

  return lines.join("\n");
}

/**
 * Rich inspection summary from submission payload — failures, pass questions with
 * notes/photos, and inspector notes.
 */
export function formatInspectionReportDetailsFromPayload(
  templateSnapshot: unknown,
  payloadInput: unknown,
): string {
  return blocksToPlainText(buildInspectionSubmissionDetailBlocks(templateSnapshot, payloadInput));
}

/**
 * @deprecated Prefer {@link formatInspectionReportDetailsFromPayload} — kept for callers/tests.
 */
export function formatInspectionFailureDetailsFromPayload(
  templateSnapshot: unknown,
  payloadInput: unknown,
): string {
  return formatInspectionReportDetailsFromPayload(templateSnapshot, payloadInput);
}

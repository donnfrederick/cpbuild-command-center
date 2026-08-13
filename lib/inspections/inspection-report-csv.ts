import type { QuestionResult, SubmissionRow } from "@/app/api/projects/[id]/inspections-report/route";
import { submissionHasFailedExportItems } from "@/lib/inspections/inspection-failed-items-export";

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function csvEscape(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function appendQuestionRows(
  rows: string[][],
  base: string[],
  sectionTitle: string,
  question: QuestionResult,
): void {
  if (question.passed) {
    rows.push([...base, sectionTitle, question.questionTitle, "", "", ""]);
    return;
  }

  if (question.deficiencies.length === 0) {
    rows.push([...base, sectionTitle, question.questionTitle, "", "", ""]);
    return;
  }

  for (const d of question.deficiencies) {
    rows.push([
      ...base,
      sectionTitle,
      question.questionTitle,
      d.description,
      String(d.count),
      d.severity ?? "",
    ]);
  }
}

export interface BuildInspectionReportCsvOptions {
  /** When true, omit passing inspections and summary-only rows (matches PDF export). */
  shareOnlyFailedItems?: boolean;
}

/**
 * Deficiency-focused export: one row per deficiency occurrence.
 * When shareOnlyFailedItems is disabled, every pass/fail question is included
 * (passed questions get empty deficiency columns). When enabled, only failed
 * pass/fail questions are exported and fully passing inspections are omitted.
 */
export function buildInspectionReportCsv(
  submissions: SubmissionRow[],
  options?: BuildInspectionReportCsvOptions,
): string {
  const shareOnlyFailedItems = options?.shareOnlyFailedItems === true;
  const HDR = [
    "Insp #",
    "Date",
    "Unit",
    "Building",
    "Level",
    "IM",
    "Inspector",
    "Subcontractor",
    "Insp Result",
    "Total Deficiencies",
    "Section",
    "Question",
    "Deficiency",
    "Count",
    "Severity",
  ];
  const rows: string[][] = [HDR];

  for (const sub of submissions) {
    if (shareOnlyFailedItems && !submissionHasFailedExportItems(sub)) continue;

    const inspector = (sub.submittedByName || "").replace(/^\[Seed\]\s*/i, "");
    const installer = (sub.installTeamName ?? "").replace(/^\[SEED\]\s*/i, "");
    const base = [
      String(sub.seqNumber),
      fmt(sub.submittedAt),
      sub.unit,
      sub.building,
      sub.level,
      sub.imName ?? "",
      inspector,
      installer,
      sub.outcome,
      String(sub.totalDeficiencies),
    ];

    let hadDetailRow = false;
    for (const sec of sub.sections) {
      const questions = shareOnlyFailedItems ? sec.failingQuestions : sec.questions;
      if (questions.length === 0) continue;

      for (const q of questions) {
        appendQuestionRows(rows, base, sec.sectionTitle, q);
        hadDetailRow = true;
      }
    }

    if (!hadDetailRow && !shareOnlyFailedItems) {
      rows.push([...base, "", "", "", "", ""]);
    }
  }

  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

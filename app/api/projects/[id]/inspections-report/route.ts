/**
 * GET /api/projects/[id]/inspections-report
 *
 * Returns clear inspection submissions for a project organised by scope type.
 * Each submission includes a full section-by-section breakdown so the UI can
 * render a per-inspection table with expandable section detail.
 *
 * Query params:
 *   from               ISO date (optional — omit for no lower bound)
 *   to                 ISO date (optional — omit for no upper bound)
 *   installerIds       Comma-separated Unifier subcontractor IDs (matched against ProjectRow.unifierSubId)
 */

import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { fetchInspectionsReport } from "@/lib/inspections/fetch-inspections-report";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";

// ── Exported response types ─────────────────────────────────────────────────

export interface DeficiencyItem {
  description: string;
  count: number;
  severity?: string;
}

export interface QuestionResult {
  questionTitle: string;
  passed: boolean;
  totalOccurrences: number;
  deficiencies: DeficiencyItem[];
}

export interface SectionResult {
  sectionTitle: string;
  /** True when every answerable question in this section passed. */
  passed: boolean;
  totalOccurrences: number;
  /** All pass/fail questions in section order (for full CSV export). */
  questions: QuestionResult[];
  /** Subset of questions that failed (used by report UI detail). */
  failingQuestions: QuestionResult[];
}

export interface SubmissionRow {
  submissionId: string;
  /** 1-based rank within this scope type, newest first. */
  seqNumber: number;
  scopeTypeCode: string;
  scopeTypeName: string;
  unit: string;
  building: string;
  level: string;
  area: string;
  shipPhase: string;
  buildPhase: string;
  /** IM assigned to the project (project-level for now; unit-level for global rollup later). */
  imName: string | null;
  /** PM assigned to the project (Unifier-enriched). */
  pmName: string | null;
  /** Canonical inspection_types.code — excludes CALIBRATION_INSPECTION on calibrations. */
  inspectionTypeCode: string;
  inspectionTypeName: string;
  submittedByName: string;
  installTeamName: string | null;
  submittedAt: string;
  outcome: "PASS" | "FAIL" | "COMPLETE";
  totalDeficiencies: number;
  isCalibration: boolean;
  /** 1-based attempt number for regular inspections. null for calibrations. */
  attemptNumber: number | null;
  sections: SectionResult[];
}

export interface BySeverity {
  Minor: number;
  Major: number;
  Critical: number;
}

export interface ScopeTypeInspections {
  scopeTypeCode: string;
  scopeTypeName: string;
  totalInspections: number;
  passCount: number;
  failCount: number;
  totalDeficiencies: number;
  bySeverity: BySeverity;
  submissions: SubmissionRow[];
}

export interface InstallerOption {
  id: string;
  name: string;
}

export interface InspectionsReport {
  projectStartedAt: string;
  availableInstallers: InstallerOption[];
  scopeTypes: ScopeTypeInspections[];
}

// ── Route handler ───────────────────────────────────────────────────────────

function parseReportDateParam(value: string, endOfDay: boolean): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) {
    parsed.setUTCHours(23, 59, 59, 999);
  }
  return parsed;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, effective);
  if (readBlock) return readBlock;

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const installerIdsParam = url.searchParams.get("installerIds");
  const installerIds = installerIdsParam?.split(",").filter(Boolean) ?? [];

  let fromDate: Date | null = null;
  if (fromParam) {
    fromDate = parseReportDateParam(fromParam, false);
    if (!fromDate) {
      return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
    }
  }

  let toDate: Date | null = null;
  if (toParam) {
    toDate = parseReportDateParam(toParam, true);
    if (!toDate) {
      return NextResponse.json({ error: "Invalid to date" }, { status: 400 });
    }
  }

  const report = await fetchInspectionsReport(projectId, { fromDate, toDate, installerIds });
  return NextResponse.json(report);
}

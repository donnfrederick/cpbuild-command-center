import { db } from "@/lib/db";
import { enrichProjectById } from "@/lib/project-unifier-merge";
import { getSubcontractorsForPicker } from "@/lib/unifier/subcontractors";
import {
  buildSubmissionSectionResults,
  buildSubmissionSectionResultsFromPayload,
  formSectionsFromTemplateSnapshot,
  hasInspectablePayloadAnswers,
} from "@/lib/inspections/inspection-report-sections";
import { loadFormVersionSectionsFromReportingBatch } from "@/lib/inspections/form-reporting-structure";
import { resolveInspectorName } from "@/lib/inspections/inspector-display";
import {
  isInspectionHistoryCategory,
  resolveReportInspectionType,
  resolvedSubmissionCategory,
} from "@/lib/inspections/inspection-type-codes";
import type {
  BySeverity,
  InspectionsReport,
  ScopeTypeInspections,
  SubmissionRow,
} from "@/app/api/projects/[id]/inspections-report/route";

export interface FetchInspectionsReportOptions {
  fromDate?: Date | null;
  toDate?: Date | null;
  installerIds?: string[];
}

function emptySev(): BySeverity {
  return { Minor: 0, Major: 0, Critical: 0 };
}

export async function fetchInspectionsReport(
  projectId: string,
  options: FetchInspectionsReportOptions = {}
): Promise<InspectionsReport> {
  const { fromDate = null, toDate = null, installerIds = [] } = options;

  const [projectRow, enrichedProject] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: { createdAt: true },
    }),
    enrichProjectById(projectId),
  ]);
  const projectStartDate = projectRow?.createdAt ?? new Date(0);
  const projectIM = enrichedProject?.installManagerName?.trim() || null;
  const projectPM = enrichedProject?.projectManagerName?.trim() || null;

  let installerScopeRowIds: string[] | null = null;
  if (installerIds.length > 0) {
    const matchingRows = await db.projectRow.findMany({
      where: { projectId, unifierSubId: { in: installerIds } },
      select: { id: true },
    });
    installerScopeRowIds = matchingRows.map((r) => r.id);
  }

  const projectSubRows = await db.projectRow.findMany({
    where: { projectId, unifierSubId: { not: null } },
    select: { unifierSubId: true },
    distinct: ["unifierSubId"],
  });
  const assignedSubIds = new Set(
    projectSubRows.map((row) => row.unifierSubId).filter((id): id is string => Boolean(id))
  );
  const subcontractors = await getSubcontractorsForPicker().catch(() => []);
  const subcontractorNameById = new Map(subcontractors.map((sub) => [sub.id, sub.name]));
  const availableInstallers = [...assignedSubIds]
    .map((id) => ({ id, name: subcontractorNameById.get(id) ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const submissions = await db.inspectionSubmission.findMany({
    where: {
      projectId,
      source: "FORM",
      ...(fromDate || toDate
        ? {
            submittedAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
      ...(installerScopeRowIds !== null ? { scopeRowId: { in: installerScopeRowIds } } : {}),
    },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      scopeTypeCode: true,
      scopeRowId: true,
      unitId: true,
      submittedAt: true,
      outcome: true,
      deficiencyCount: true,
      templateSnapshot: true,
      formVersionId: true,
      payload: true,
      clearInspection: {
        select: {
          inspectedBy: { select: { name: true } },
          inspectionType: { select: { code: true, name: true } },
          calibratedAgainstClearInspection: {
            select: {
              inspectionType: { select: { code: true, name: true } },
            },
          },
        },
      },
      form: { select: { category: true } },
      answers: {
        orderBy: { questionId: "asc" },
        select: {
          questionId: true,
          choiceValue: true,
          isFailed: true,
          isNotApplicable: true,
          formVersionQuestion: {
            select: {
              title: true,
              responseType: true,
              sourceSectionId: true,
              section: { select: { title: true } },
            },
          },
          deficiencies: {
            select: {
              description: true,
              count: true,
              severity: true,
            },
          },
        },
      },
    },
  });

  if (submissions.length === 0) {
    return {
      projectStartedAt: projectStartDate.toISOString(),
      availableInstallers,
      scopeTypes: [],
    };
  }

  const fallbackVersionIds = [
    ...new Set(
      submissions
        .filter(
          (submission) =>
            submission.answers.length === 0 && hasInspectablePayloadAnswers(submission.payload)
        )
        .map((submission) => submission.formVersionId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const versionSectionsById = await loadFormVersionSectionsFromReportingBatch(fallbackVersionIds);

  const rowIds = new Set<string>();
  for (const s of submissions) {
    if (s.scopeRowId) rowIds.add(s.scopeRowId);
    rowIds.add(s.unitId);
  }
  const rows = await db.projectRow.findMany({
    where: { id: { in: Array.from(rowIds) } },
    select: {
      id: true,
      building: true,
      level: true,
      unit: true,
      area: true,
      shipPhase: true,
      buildPhase: true,
      unifierSubId: true,
      scopeType: { select: { name: true } },
    },
  });
  const rowMap = new Map(rows.map((r) => [r.id, r]));

  const uniqueCodes = [...new Set(submissions.map((s) => s.scopeTypeCode).filter(Boolean))] as string[];
  const codeToName = new Map<string, string>();
  if (uniqueCodes.length > 0) {
    const stRows = await db.scopeType.findMany({
      where: { code: { in: uniqueCodes } },
      select: { code: true, name: true },
    });
    for (const st of stRows) codeToName.set(st.code, st.name);
  }

  const scopeTypeMap = new Map<
    string,
    {
      scopeTypeCode: string;
      scopeTypeName: string;
      passCount: number;
      failCount: number;
      totalDeficiencies: number;
      bySeverity: BySeverity;
      rows: SubmissionRow[];
    }
  >();

  const attemptNumberMap = new Map<string, number | null>();
  {
    const byScopeRowAndType = new Map<string, typeof submissions>();
    for (const s of submissions) {
      const category = resolvedSubmissionCategory(s.templateSnapshot, s.form?.category);
      if (!isInspectionHistoryCategory(category)) continue;
      const isCalibration = category === "CALIBRATION_INSPECTION";
      const typeInfo = resolveReportInspectionType({
        isCalibration,
        rowInspectionTypeCode: s.clearInspection?.inspectionType?.code,
        calibratedAgainstTypeCode:
          s.clearInspection?.calibratedAgainstClearInspection?.inspectionType?.code,
        templateSnapshot: s.templateSnapshot,
        formCategory: s.form?.category,
      });
      const scopeKey = s.scopeRowId ?? s.unitId;
      const groupKey = `${scopeKey}:${typeInfo.code}`;
      if (!byScopeRowAndType.has(groupKey)) byScopeRowAndType.set(groupKey, []);
      byScopeRowAndType.get(groupKey)!.push(s);
    }
    for (const group of byScopeRowAndType.values()) {
      const sorted = [...group].sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
      let attempt = 0;
      for (const s of sorted) {
        const category = resolvedSubmissionCategory(s.templateSnapshot, s.form?.category);
        const isCalibration = category === "CALIBRATION_INSPECTION";
        if (isCalibration) {
          attemptNumberMap.set(s.id, null);
        } else {
          attempt++;
          attemptNumberMap.set(s.id, attempt);
        }
      }
    }
  }

  for (const s of submissions) {
    const category = resolvedSubmissionCategory(s.templateSnapshot, s.form?.category);
    if (!isInspectionHistoryCategory(category)) continue;
    const isCalibration = category === "CALIBRATION_INSPECTION";
    const typeInfo = resolveReportInspectionType({
      isCalibration,
      rowInspectionTypeCode: s.clearInspection?.inspectionType?.code,
      calibratedAgainstTypeCode:
        s.clearInspection?.calibratedAgainstClearInspection?.inspectionType?.code,
      templateSnapshot: s.templateSnapshot,
      formCategory: s.form?.category,
    });

    const scopeTypeCode = s.scopeTypeCode ?? "OTHER";
    const scopeRow = s.scopeRowId ? rowMap.get(s.scopeRowId) : undefined;
    const unitRow = rowMap.get(s.unitId);
    const locationRow = scopeRow ?? unitRow ?? null;
    const scopeTypeName =
      codeToName.get(scopeTypeCode) ?? locationRow?.scopeType?.name ?? scopeTypeCode;
    const subcontractorName = scopeRow?.unifierSubId
      ? subcontractorNameById.get(scopeRow.unifierSubId) ?? scopeRow.unifierSubId
      : null;

    const {
      sections: sectionResults,
      totalDeficiencies: subTotalOcc,
      bySeverity: subBySev,
    } = (() => {
      const normalized = buildSubmissionSectionResults({
        outcome: s.outcome,
        deficiencyCount: s.deficiencyCount,
        answers: s.answers,
      });
      const shouldTryPayload =
        normalized.totalDeficiencies === 0 &&
        (s.deficiencyCount > 0 || hasInspectablePayloadAnswers(s.payload));
      if (!shouldTryPayload) return normalized;

      const formSections =
        (s.formVersionId ? versionSectionsById.get(s.formVersionId) : undefined) ??
        formSectionsFromTemplateSnapshot(s.templateSnapshot);
      if (formSections.length === 0) return normalized;

      return buildSubmissionSectionResultsFromPayload({
        sections: formSections,
        payload: s.payload,
      });
    })();

    let bucket = scopeTypeMap.get(scopeTypeCode);
    if (!bucket) {
      bucket = {
        scopeTypeCode,
        scopeTypeName,
        passCount: 0,
        failCount: 0,
        totalDeficiencies: 0,
        bySeverity: emptySev(),
        rows: [],
      };
      scopeTypeMap.set(scopeTypeCode, bucket);
    }

    if (s.outcome === "PASS") bucket.passCount++;
    else if (s.outcome === "FAIL") bucket.failCount++;
    bucket.totalDeficiencies += subTotalOcc;
    for (const sev of ["Minor", "Major", "Critical"] as const) {
      bucket.bySeverity[sev] += subBySev[sev];
    }

    bucket.rows.push({
      submissionId: s.id,
      seqNumber: 0,
      scopeTypeCode,
      scopeTypeName,
      unit: locationRow?.unit ?? "",
      building: locationRow?.building ?? "",
      level: locationRow?.level ?? "",
      area: locationRow?.area ?? "",
      shipPhase: locationRow?.shipPhase ?? "",
      buildPhase: locationRow?.buildPhase ?? "",
      imName: projectIM,
      pmName: projectPM,
      inspectionTypeCode: typeInfo.code,
      inspectionTypeName: typeInfo.name,
      submittedByName: resolveInspectorName(s.clearInspection),
      installTeamName: subcontractorName,
      submittedAt: s.submittedAt.toISOString(),
      outcome: s.outcome as "PASS" | "FAIL" | "COMPLETE",
      totalDeficiencies: subTotalOcc,
      isCalibration,
      attemptNumber: attemptNumberMap.get(s.id) ?? null,
      sections: sectionResults,
    });
  }

  const scopeTypes: ScopeTypeInspections[] = [];
  for (const bucket of scopeTypeMap.values()) {
    bucket.rows.forEach((r, i) => {
      r.seqNumber = i + 1;
    });
    scopeTypes.push({
      scopeTypeCode: bucket.scopeTypeCode,
      scopeTypeName: bucket.scopeTypeName,
      totalInspections: bucket.rows.length,
      passCount: bucket.passCount,
      failCount: bucket.failCount,
      totalDeficiencies: bucket.totalDeficiencies,
      bySeverity: bucket.bySeverity,
      submissions: bucket.rows,
    });
  }
  scopeTypes.sort((a, b) => b.totalDeficiencies - a.totalDeficiencies);

  return {
    projectStartedAt: projectStartDate.toISOString(),
    availableInstallers,
    scopeTypes,
  };
}

export function parseInspectionReportDateParam(value: string, endOfDay: boolean): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) {
    parsed.setUTCHours(23, 59, 59, 999);
  }
  return parsed;
}

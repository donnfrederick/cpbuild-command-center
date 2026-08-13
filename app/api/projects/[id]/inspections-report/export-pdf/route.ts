import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { absoluteAppOriginFromRequest } from "@/lib/field-media-local";
import { resolveInspectorName } from "@/lib/inspections/inspector-display";
import {
  attachSubmitterFromSession,
  enrichSubmissionsWithActivitySubmitters,
} from "@/lib/inspections/resolve-submission-submitter";
import { hydrateInspectionSubmissionView } from "@/lib/inspections/hydrate-inspection-submission-view";
import {
  buildInspectionReportPdf,
  categoryLabelFromTemplate,
  type InspectionReportKind,
  type InspectionReportRecordForPdf,
} from "@/lib/pdf/inspection-report-pdf";
import { pdfGenerationFailedNextResponse } from "@/lib/pdf/pdf-export-errors";
import type { FormTemplate } from "@/components/forms/formTypes";
import { enrichSubmissionTemplateSnapshot } from "@/lib/forms/form-purpose-rules";
import { MAX_INSPECTION_REPORT_EXPORT_SUBMISSIONS } from "@/lib/inspections/inspection-export-limits";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

interface ExportRecordMeta {
  submissionId: string;
  seqNumber: number;
  scopeTypeName: string;
  unit: string;
  building: string;
  level: string;
  area: string;
  phase: string;
  imName: string | null;
  installTeamName: string | null;
  attemptLabel: string;
  totalDeficiencies: number;
}

function parseSubmissionIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

function parseRecordMeta(raw: unknown): ExportRecordMeta[] | null {
  if (!Array.isArray(raw)) return null;
  const parsed: ExportRecordMeta[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row.submissionId !== "string" || !row.submissionId) return null;
    if (typeof row.seqNumber !== "number" || !Number.isFinite(row.seqNumber)) return null;
    if (typeof row.scopeTypeName !== "string") return null;
    if (typeof row.unit !== "string") return null;
    if (typeof row.building !== "string") return null;
    if (typeof row.level !== "string") return null;
    if (typeof row.area !== "string") return null;
    if (typeof row.phase !== "string") return null;
    if (typeof row.attemptLabel !== "string") return null;
    if (typeof row.totalDeficiencies !== "number" || !Number.isFinite(row.totalDeficiencies)) return null;
    parsed.push({
      submissionId: row.submissionId,
      seqNumber: row.seqNumber,
      scopeTypeName: row.scopeTypeName,
      unit: row.unit,
      building: row.building,
      level: row.level,
      area: row.area,
      phase: row.phase,
      imName: typeof row.imName === "string" ? row.imName : null,
      installTeamName: typeof row.installTeamName === "string" ? row.installTeamName : null,
      attemptLabel: row.attemptLabel,
      totalDeficiencies: row.totalDeficiencies,
    });
  }
  return parsed;
}

function templateFromSubmission(
  submission: {
    formId: string | null;
    form: {
      id: string;
      name: string;
      category: string;
      level: string;
      scopeTypeCodes: string[];
      description: string | null;
      purpose?: string;
    } | null;
  },
  templateSnapshot: unknown,
): FormTemplate {
  const snap =
    templateSnapshot && typeof templateSnapshot === "object" && !Array.isArray(templateSnapshot)
      ? (templateSnapshot as FormTemplate)
      : null;
  if (snap) {
    const enriched =
      enrichSubmissionTemplateSnapshot(snap, submission.form?.purpose) ?? snap;
    return { ...enriched, sections: enriched.sections ?? [] };
  }
  return {
    id: submission.formId,
    name: submission.form?.name ?? (submission.formId ? "Inspection" : "Backfill"),
    description: "",
    status: "published",
    level: "scope",
    scopeTypeCodes: [],
    category: "OTHER",
    sections: [],
  };
}

/**
 * POST /api/projects/[id]/inspections-report/export-pdf
 * Bulk PDF export for filtered inspection attempts (full records with deficiencies + media).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const rawBody = await req.json().catch(() => ({}));
  const body =
    typeof rawBody === "object" && rawBody !== null && !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>)
      : {};

  const submissionIds = parseSubmissionIds(body.submissionIds);
  if (submissionIds.length === 0) {
    return NextResponse.json(
      { error: "No inspections match the current filters." },
      { status: 404 },
    );
  }
  if (submissionIds.length > MAX_INSPECTION_REPORT_EXPORT_SUBMISSIONS) {
    return NextResponse.json(
      {
        error: `Cannot export more than ${MAX_INSPECTION_REPORT_EXPORT_SUBMISSIONS} inspections at once.`,
      },
      { status: 400 },
    );
  }

  const recordMeta = parseRecordMeta(body.records);
  if (recordMeta && recordMeta.length !== submissionIds.length) {
    return NextResponse.json({ error: "Invalid records metadata." }, { status: 400 });
  }
  if (recordMeta) {
    const metaIds = new Set(recordMeta.map((r) => r.submissionId));
    for (const id of submissionIds) {
      if (!metaIds.has(id)) {
        return NextResponse.json({ error: "Invalid records metadata." }, { status: 400 });
      }
    }
  }

  const projectName = typeof body.projectName === "string" ? body.projectName : "Project";
  const filterSummary = typeof body.filterSummary === "string" ? body.filterSummary : "";
  const reportKind: InspectionReportKind =
    body.reportKind === "project_forms" ? "project_forms" : "inspections";
  const reportTitle = typeof body.reportTitle === "string" ? body.reportTitle : undefined;
  const shareOnlyFailedItems =
    body.shareOnlyFailedItems === true && reportKind !== "project_forms";

  const submissions = await db.inspectionSubmission.findMany({
    where: { projectId, id: { in: submissionIds } },
    include: {
      form: {
        select: {
          id: true,
          name: true,
          category: true,
          level: true,
          scopeTypeCodes: true,
          description: true,
          purpose: true,
        },
      },
      clearInspection: {
        select: {
          inspectedById: true,
          inspectedBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (submissions.length !== submissionIds.length) {
    return NextResponse.json(
      {
        error:
          "One or more inspections were not found on the server. Pending sync submissions cannot be exported until they finish syncing.",
      },
      { status: 404 },
    );
  }

  const byId = new Map(submissions.map((s) => [s.id, s]));
  const metaById = new Map(recordMeta?.map((m) => [m.submissionId, m]) ?? []);

  const enrichedSubmissions = await enrichSubmissionsWithActivitySubmitters(db, submissions);
  const enrichedById = new Map(
    enrichedSubmissions.map((s) => [
      s.id,
      attachSubmitterFromSession(s, {
        id: session.user.id ?? null,
        name: session.user.name,
      }),
    ]),
  );

  const records: InspectionReportRecordForPdf[] = [];
  for (const id of submissionIds) {
    const submission = enrichedById.get(id) ?? byId.get(id);
    if (!submission) continue;

    const hydrated = await hydrateInspectionSubmissionView(submission);
    const template = templateFromSubmission(submission, hydrated.templateSnapshot);
    const meta = metaById.get(id);

    records.push({
      submissionId: id,
      seqNumber: meta?.seqNumber ?? 0,
      scopeTypeName: meta?.scopeTypeName ?? submission.scopeTypeCode ?? "—",
      unit: meta?.unit ?? "—",
      building: meta?.building ?? "",
      level: meta?.level ?? "",
      area: meta?.area ?? "",
      phase: meta?.phase ?? "",
      imName: meta?.imName ?? null,
      installTeamName: meta?.installTeamName ?? null,
      attemptLabel: meta?.attemptLabel ?? "Inspection",
      totalDeficiencies: meta?.totalDeficiencies ?? submission.deficiencyCount,
      formName: template.name?.trim() || submission.formId || "Inspection",
      categoryLabel: categoryLabelFromTemplate(template),
      outcome: submission.outcome,
      submittedAt: submission.submittedAt,
      submittedBy: resolveInspectorName(submission.clearInspection),
      template,
      payload: hydrated.payload,
    });
  }

  try {
    const pdfBuffer = await buildInspectionReportPdf({
      records,
      projectName,
      filterSummary,
      exportedAt: new Date(),
      reportKind,
      ...(reportTitle ? { reportTitle } : {}),
      shareOnlyFailedItems,
      pdfImageFetch: {
        cookieHeader: req.headers.get("cookie"),
        appOrigin: absoluteAppOriginFromRequest(req),
      },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="inspections-report-${projectId}-${Date.now()}.pdf"`,
      },
    });
  } catch (err) {
    return pdfGenerationFailedNextResponse("[export-pdf/inspections-report]", err);
  }
}

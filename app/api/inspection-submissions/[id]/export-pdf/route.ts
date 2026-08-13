import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { enrichProjectById } from "@/lib/project-unifier-merge";
import { absoluteAppOriginFromRequest } from "@/lib/field-media-local";
import { pdfGenerationFailedNextResponse } from "@/lib/pdf/pdf-export-errors";
import { buildInspectionSubmissionPdf } from "@/lib/pdf/inspection-submission-pdf";
import { FailedOnlyExportEmptyError } from "@/lib/inspections/inspection-failed-items-export";
import { resolveInspectorName } from "@/lib/inspections/inspector-display";
import {
  attachSubmitterFromSession,
  enrichSubmissionsWithActivitySubmitters,
} from "@/lib/inspections/resolve-submission-submitter";
import { hydrateInspectionSubmissionView } from "@/lib/inspections/hydrate-inspection-submission-view";
import type { FormTemplate } from "@/components/forms/formTypes";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/inspection-submissions/[id]/export-pdf
 * Generates a printable PDF for a single inspection submission (incl. clear inspections).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await req.json().catch(() => ({}));
  const body =
    typeof rawBody === "object" && rawBody !== null && !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>)
      : {};
  const shareOnlyFailedItems = body.shareOnlyFailedItems === true;

  const { id } = await params;

  const submission = await db.inspectionSubmission.findUnique({
    where: { id },
    include: {
      form: {
        select: {
          id: true,
          name: true,
          category: true,
          level: true,
          scopeTypeCodes: true,
          description: true,
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

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const readBlock = await enforceProjectReadVisibility(submission.projectId, session);
  if (readBlock) return readBlock;

  const project = await enrichProjectById(submission.projectId);
  const projectName = project?.projectName?.trim() || "Project";

  const hydrated = await hydrateInspectionSubmissionView(submission);
  const rawSnap = hydrated.templateSnapshot;
  const snap =
    rawSnap && typeof rawSnap === "object" && !Array.isArray(rawSnap)
      ? (rawSnap as unknown as FormTemplate)
      : null;
  const template: FormTemplate = snap
    ? { ...snap, sections: snap.sections ?? [] }
    : {
          id: submission.formId,
          name: submission.form?.name ?? (submission.formId ? "Inspection" : "Backfill"),
          description: "",
          status: "published",
          level: "scope",
          scopeTypeCodes: [],
          category: "OTHER",
          sections: [],
        };

  const payload = hydrated.payload;

  let locationLine: string | undefined;
  if (submission.scopeRowId) {
    const row = await db.projectRow.findUnique({
      where: { id: submission.scopeRowId },
      select: { building: true, level: true, unit: true },
    });
    if (row) {
      const parts = [row.building, row.level, row.unit].filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      );
      if (parts.length > 0) locationLine = parts.join(" · ");
    }
  }

  try {
    const [enriched] = await enrichSubmissionsWithActivitySubmitters(db, [submission]);
    const withSubmitter = attachSubmitterFromSession(enriched, session.user);
    const submittedBy = resolveInspectorName(withSubmitter.clearInspection);

    const pdfBuffer = await buildInspectionSubmissionPdf({
      template,
      payload,
      projectName,
      formName: template.name?.trim() || submission.formId || "Inspection",
      outcome: submission.outcome,
      submittedAt: submission.submittedAt,
      submittedBy,
      exportedAt: new Date(),
      ...(locationLine ? { locationLine } : {}),
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
        "Content-Disposition": `attachment; filename="inspection-${id}-${Date.now()}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof FailedOnlyExportEmptyError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return pdfGenerationFailedNextResponse("[export-pdf/inspection-submission]", err);
  }
}

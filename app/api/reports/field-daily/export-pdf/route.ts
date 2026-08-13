import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  canUseFieldDailyReport,
  resolveFieldDailyReportOwnerId,
} from "@/lib/field-daily-report/auth";
import { buildFieldDailyReportExportMediaContext } from "@/lib/field-daily-report/hydrate-export-media";
import {
  buildFieldDailyReportPdfPayload,
  fieldDailyReportPdfFilename,
} from "@/lib/field-daily-report/pdf-export";
import { fetchProjectFieldDailySliceByDate } from "@/lib/field-daily-report/project-hub-service";
import { userCanAccessProjectFieldDaily } from "@/lib/field-daily-report/project-scope";
import { absoluteAppOriginFromRequest } from "@/lib/field-media-local";
import { buildFieldDailyReportExportPdf } from "@/lib/pdf/field-daily-report-pdf";
import { pdfGenerationFailedNextResponse } from "@/lib/pdf/pdf-export-errors";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const PreviewLabelsSchema = z.object({
  statusChanges: z.string().min(1),
  inspections: z.string().min(1),
  issuesReported: z.string().min(1),
  otherActivity: z.string().min(1),
});

const LabelsSchema = z.object({
  documentTitle: z.string().min(1),
  reportDateHeading: z.string().min(1),
  exportedAtHeading: z.string().min(1),
  filterHeading: z.string().min(1),
  projectsHeading: z.string().min(1),
  sectionProgress: z.string().min(1),
  sectionStatus: z.string().min(1),
  sectionTeamsOnSite: z.string().min(1),
  sectionSubcontractors: z.string().min(1),
  sectionInspections: z.string().min(1),
  sectionIssues: z.string().min(1),
  sectionObservations: z.string().min(1),
  sectionWorkforce: z.string().min(1),
  sectionOther: z.string().min(1),
  notesLabel: z.string().min(1),
  workforceDailyManpowerLabel: z.string().min(1),
  missingDailyManpowerAlert: z.string().min(1),
  workforceManpowerSummary: z.string().min(1),
  workforceDailyManpowerHeader: z.string().min(1),
  progressDeltaOnly: z.string().min(1),
  progressCurrentPct: z.string().min(1),
  progressUnavailable: z.string().min(1),
  noFieldActivity: z.string().min(1),
  generatedAt: z.string().min(1),
  confidentialFooter: z.string().min(1),
  locationProjectLevel: z.string().min(1),
  previewLabels: PreviewLabelsSchema,
});

const BodySchema = z.object({
  projectId: z.string().min(1),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  locale: z.string().min(2),
  filterSummary: z.string().default(""),
  activitySummary: z.string().min(1),
  exportedAt: z.string().datetime().optional(),
  labels: LabelsSchema,
});

/**
 * POST /api/reports/field-daily/export-pdf
 * Exports one project's field daily report slice to PDF (with embedded photos).
 */
export async function POST(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canUseFieldDailyReport(effective.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawBody = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { projectId, reportDate, locale, labels, filterSummary, exportedAt, activitySummary } =
    parsed.data;

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, installManagerId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canAccess = await userCanAccessProjectFieldDaily(
    effective.user.id,
    effective.user.role,
    projectId,
    reportDate,
  );
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reportOwnerUserId = resolveFieldDailyReportOwnerId(
    project.installManagerId,
    effective.user.id,
  );

  const slice = await fetchProjectFieldDailySliceByDate({
    projectId,
    reportDate,
    reportOwnerUserId,
    sessionRole: effective.user.role,
  });
  if (!slice) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const activityThrough = slice.activityThrough ? new Date(slice.activityThrough) : undefined;
  const media = await buildFieldDailyReportExportMediaContext({
    projectId,
    reportDate,
    snapshot: slice.snapshot,
    activityThrough,
  });

  const payload = buildFieldDailyReportPdfPayload({
    reportDate,
    locale,
    labels,
    projects: [slice],
    filterSummary,
    exportedAt: exportedAt ? new Date(exportedAt) : new Date(),
    media,
    activitySummary,
  });

  try {
    const pdfBuffer = await buildFieldDailyReportExportPdf(payload, {
      pdfImageFetch: {
        cookieHeader: req.headers.get("cookie"),
        appOrigin: absoluteAppOriginFromRequest(req),
      },
    });
    const filename = fieldDailyReportPdfFilename(slice.projectName, reportDate);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return pdfGenerationFailedNextResponse("[field-daily/export-pdf]", err);
  }
}

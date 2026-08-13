import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { buildPortfolioProgressExportPdf } from "@/lib/pdf/portfolio-progress-export-pdf";
import { pdfGenerationFailedNextResponse } from "@/lib/pdf/pdf-export-errors";
import type { PortfolioProgressExportPayload } from "@/lib/reports/portfolio-progress-export";

export const runtime = "nodejs";
export const maxDuration = 60;

const ScopeSummarySchema = z.object({
  scopeName: z.string().min(1),
  verifiedPct: z.number(),
  verifiedDelta: z.number().nullable(),
  subPct: z.number(),
  subDelta: z.number().nullable(),
});

const LevelScopeCellSchema = z.object({
  pct: z.number(),
  subPct: z.number(),
  installedQty: z.number(),
  totalQty: z.number(),
  notStartedQty: z.number(),
  stagingQty: z.number(),
  assemblyQty: z.number(),
  installInProgressQty: z.number(),
  installCompleteSubQty: z.number(),
  startedOn: z.string().nullable().optional(),
  lastUpdatedOn: z.string().nullable().optional(),
  completedOn: z.string().nullable().optional(),
  verifiedDelta: z.number().nullable().optional(),
  verifiedUnitDelta: z.number().nullable().optional(),
});

const LevelUnitDetailSchema = z.object({
  unitLabel: z.string(),
  scopeName: z.string(),
  verifiedPct: z.number(),
  updatedThisPeriod: z.boolean(),
  subcontractor: z.string().nullable(),
  verifiedOn: z.string().nullable().optional(),
});

const ExportLabelsSchema = z.object({
  documentTitle: z.string().min(1),
  periodHeading: z.string().min(1),
  compareWindowLabel: z.string().min(1),
  scopeSummaryHeading: z.string().min(1),
  colScope: z.string().min(1),
  colVerified: z.string().min(1),
  colVerifiedChange: z.string().min(1),
  colUnverified: z.string().min(1),
  colUnverifiedChange: z.string().min(1),
  overallVerifiedLabel: z.string().min(1),
  levelDetailHeading: z.string().min(1),
  colBuilding: z.string().min(1),
  colLevel: z.string().min(1),
  colOverall: z.string().min(1),
  colAllLevels: z.string().min(1),
  colBuildingTotal: z.string().min(1),
  colPct: z.string().min(1),
  colChange: z.string().min(1),
  colStart: z.string().min(1),
  colLastUpdated: z.string().min(1),
  colEnd: z.string().min(1),
  unitDetailHeading: z.string().min(1),
  colUnit: z.string().min(1),
  colSubcontractor: z.string().min(1),
  noChange: z.string().min(1),
  confidentialFooter: z.string().min(1),
});

const BodySchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  locale: z.string().min(2),
  exportedAt: z.string().datetime(),
  period: z.object({
    preset: z.enum(["1w", "2w", "30d", "all", "custom"]),
    presetLabel: z.string().min(1),
    rangeFrom: z.string().min(1),
    rangeTo: z.string().min(1),
    rangeDisplay: z.string().min(1),
    compareLabel: z.string().min(1),
  }),
  overallVerifiedPct: z.number(),
  overallVerifiedDelta: z.number().nullable(),
  scopeSummaries: z.array(ScopeSummarySchema).min(1),
  deltaPeriodLabel: z.string().min(1),
  labels: ExportLabelsSchema,
  levelReport: z.object({
    levels: z.array(z.string()),
    scopes: z.array(z.string()).min(1),
    data: z.record(z.string(), z.record(z.string(), LevelScopeCellSchema)),
    overallByLevel: z.record(z.string(), z.number()),
    overallByScope: z.record(z.string(), z.number()),
    grandTotalPct: z.number(),
    buildings: z.array(z.string()),
    levelToBuilding: z.record(z.string(), z.string()),
    levelOverallUnits: z
      .record(z.string(), z.object({ installedQty: z.number(), totalQty: z.number() }))
      .optional(),
    overallDeltaByScope: z.record(z.string(), z.number().nullable()).optional(),
    overallUnitDeltaByScope: z.record(z.string(), z.number().nullable()).optional(),
    levelUnitDetails: z.record(z.string(), z.array(LevelUnitDetailSchema)).optional(),
  }),
});

/**
 * POST /api/reports/global-progress/export-pdf
 * GC export for one project's expanded building + level detail.
 * Wireframe: client assembles payload from mock fixtures; live API will reuse the same shape.
 */
export async function POST(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(effective.user.role, PERMISSIONS.VIEW_DASHBOARD)) {
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

  const payload = parsed.data as PortfolioProgressExportPayload;

  const readBlock = await enforceProjectReadVisibility(payload.projectId, effective);
  if (readBlock) return readBlock;

  if (payload.levelReport.levels.length === 0) {
    return NextResponse.json(
      { error: "No building or level detail available for export." },
      { status: 404 },
    );
  }

  try {
    const pdfBuffer = await buildPortfolioProgressExportPdf(payload);
    const safeName = payload.projectName.replace(/[^\w\-]+/g, "-").slice(0, 48);
    const filename = `progress-detail-${safeName}-${Date.now()}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return pdfGenerationFailedNextResponse("[global-progress/export-pdf]", err);
  }
}

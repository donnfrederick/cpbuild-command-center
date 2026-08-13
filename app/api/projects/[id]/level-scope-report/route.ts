import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { computeLevelScopeReport } from "@/lib/level-scope-report";
import { buildLevelScopeReportPdf } from "@/lib/pdf/level-scope-report-pdf";
import { pdfGenerationFailedNextResponse } from "@/lib/pdf/pdf-export-errors";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_PROJECTS)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const body = await req.json().catch(() => ({})) as { projectName?: string };
  const projectName = body.projectName ?? "Project";

  try {
    const report = await computeLevelScopeReport(projectId);

    if (report.levels.length === 0) {
      return NextResponse.json(
        { error: "No location data available for this project." },
        { status: 404 }
      );
    }

    const pdfBuffer = await buildLevelScopeReportPdf({
      report,
      projectName,
      exportedAt: new Date(),
    });

    const filename = `progress-report-${projectId}-${Date.now()}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return pdfGenerationFailedNextResponse("[level-scope-report]", err);
  }
}

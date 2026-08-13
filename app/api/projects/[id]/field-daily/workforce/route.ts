import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEffectiveSession } from "@/lib/masquerade";
import { canUseFieldDailyReport, resolveFieldDailyReportOwnerUserIds } from "@/lib/field-daily-report/auth";
import {
  resolveReportDateParam,
  upsertFieldDailyReportDailyManpower,
} from "@/lib/field-daily-report/service";
import { userCanAccessProjectFieldDaily } from "@/lib/field-daily-report/project-scope";
import { isValidDailyManpower } from "@/lib/field-daily-report/workforce-manpower";
import { db } from "@/lib/db";

const PutWorkforceSchema = z.object({
  reportDate: z.string().optional(),
  dailyManpower: z.number().int().min(0).max(9999).nullable(),
});

export const dynamic = "force-dynamic";

/** PUT /api/projects/[id]/field-daily/workforce */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canUseFieldDailyReport(effective.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId } = await context.params;
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, installManagerId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = PutWorkforceSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (!isValidDailyManpower(parsed.data.dailyManpower)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const reportDate = resolveReportDateParam(parsed.data.reportDate ?? null);
  const canAccess = await userCanAccessProjectFieldDaily(
    effective.user.id,
    effective.user.role,
    projectId,
    reportDate,
  );
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ownerUserIds = resolveFieldDailyReportOwnerUserIds(
    project.installManagerId,
    effective.user.id,
  );

  try {
    const result = await upsertFieldDailyReportDailyManpower({
      ownerUserIds,
      projectId,
      reportDate,
      dailyManpower: parsed.data.dailyManpower,
      setByUserId: effective.user.id,
    });

    if (!result) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    return NextResponse.json({
      dailyManpower: result.dailyManpower,
      dailyManpowerMeta: result.dailyManpowerMeta,
      reportDate,
    });
  } catch (err) {
    console.error("[field-daily/workforce] save failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

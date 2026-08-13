import { NextRequest, NextResponse } from "next/server";
import { FieldDailyReportTrigger } from "@prisma/client";
import { z } from "zod";
import { getEffectiveSession } from "@/lib/masquerade";
import { activityThroughForReportDate } from "@/lib/field-daily-report/activity-through";
import { canGenerateFieldDailyReport, canUseFieldDailyReport } from "@/lib/field-daily-report/auth";
import {
  generateFieldDailyReport,
  resolveReportDateParam,
} from "@/lib/field-daily-report/service";

export const dynamic = "force-dynamic";

const GenerateBodySchema = z.object({
  date: z.string().optional(),
  projectIds: z.array(z.string().min(1)).optional(),
});

/** POST /api/reports/field-daily/generate — body: { date?: "YYYY-MM-DD", projectIds?: string[] } */
export async function POST(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canUseFieldDailyReport(effective.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!canGenerateFieldDailyReport(effective.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof GenerateBodySchema> = {};
  try {
    const raw = (await req.json()) as unknown;
    const parsed = GenerateBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 422 });
    }
    body = parsed.data;
  } catch {
    body = {};
  }

  const reportDate = resolveReportDateParam(body.date ?? null);
  const projectIds = body.projectIds;

  if (projectIds != null && projectIds.length === 0) {
    return NextResponse.json({ error: "At least one project is required" }, { status: 422 });
  }

  const report = await generateFieldDailyReport({
    installManagerUserId: effective.user.id,
    sessionRole: effective.user.role,
    reportDate,
    trigger: FieldDailyReportTrigger.MANUAL,
    generatedByUserId: effective.user.id,
    activityThrough: activityThroughForReportDate(reportDate),
    projectIds,
  });

  if (!report) {
    return NextResponse.json({ report: null, reportDate });
  }

  return NextResponse.json({ report, reportDate });
}

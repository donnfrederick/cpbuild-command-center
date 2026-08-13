import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyFieldDailyCronBearer } from "@/lib/field-daily-report/cron-auth";
import { runScheduledFieldDailyReports } from "@/lib/field-daily-report/scheduled-generate";
import { parseReportDateParam } from "@/lib/field-daily-report/timezone";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  date: z.string().optional(),
  force: z.boolean().optional(),
});

/**
 * POST /api/internal/field-daily/scheduled-generate
 * Bearer FIELD_DAILY_CRON_SECRET — midnight cron for the prior org-TZ calendar day.
 */
export async function POST(req: NextRequest) {
  if (!verifyFieldDailyCronBearer(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema> = {};
  try {
    const raw = (await req.json()) as unknown;
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 422 });
    }
    body = parsed.data;
  } catch {
    body = {};
  }

  const reportDate = body.date ? parseReportDateParam(body.date) ?? undefined : undefined;
  if (body.date && !reportDate) {
    return NextResponse.json({ error: "Invalid date" }, { status: 422 });
  }

  const result = await runScheduledFieldDailyReports({
    reportDate,
    force: body.force ?? false,
  });

  return NextResponse.json(result);
}

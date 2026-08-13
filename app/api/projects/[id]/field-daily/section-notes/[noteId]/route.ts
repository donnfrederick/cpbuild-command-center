import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEffectiveSession } from "@/lib/masquerade";
import { canUseFieldDailyReport, resolveFieldDailyReportOwnerUserIds } from "@/lib/field-daily-report/auth";
import { resolveReportDateParam } from "@/lib/field-daily-report/service";
import {
  softDeleteFieldDailySectionNote,
  updateFieldDailySectionNote,
} from "@/lib/field-daily-report/section-notes-service";
import { userCanAccessProjectFieldDaily } from "@/lib/field-daily-report/project-scope";
import { db } from "@/lib/db";

const PatchNoteSchema = z.object({
  reportDate: z.string().optional(),
  body: z.string().min(1).max(5000),
});

export const dynamic = "force-dynamic";

async function authorize(
  projectId: string,
  reportDateParam: string | undefined,
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!canUseFieldDailyReport(effective.user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { installManagerId: true },
  });
  if (!project) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const reportDate = resolveReportDateParam(reportDateParam ?? null);
  const canAccess = await userCanAccessProjectFieldDaily(
    effective.user.id,
    effective.user.role,
    projectId,
    reportDate,
  );
  if (!canAccess) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return {
    effective,
    reportDate,
    ownerUserIds: resolveFieldDailyReportOwnerUserIds(project.installManagerId, effective.user.id),
  };
}

/** PATCH /api/projects/[id]/field-daily/section-notes/[noteId] */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id: projectId, noteId } = await context.params;
  const parsed = PatchNoteSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const auth = await authorize(projectId, parsed.data.reportDate);
  if ("error" in auth && auth.error) return auth.error;

  const result = await updateFieldDailySectionNote({
    ownerUserIds: auth.ownerUserIds!,
    projectId,
    reportDate: auth.reportDate!,
    noteId,
    body: parsed.data.body,
    authorUserId: auth.effective!.user.id,
  });

  if (result === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ note: result, reportDate: auth.reportDate });
}

/** DELETE /api/projects/[id]/field-daily/section-notes/[noteId] */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id: projectId, noteId } = await context.params;
  const reportDateParam = req.nextUrl.searchParams.get("reportDate") ?? undefined;
  const auth = await authorize(projectId, reportDateParam);
  if ("error" in auth && auth.error) return auth.error;

  const result = await softDeleteFieldDailySectionNote({
    ownerUserIds: auth.ownerUserIds!,
    projectId,
    reportDate: auth.reportDate!,
    noteId,
    authorUserId: auth.effective!.user.id,
  });

  if (result === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, reportDate: auth.reportDate });
}

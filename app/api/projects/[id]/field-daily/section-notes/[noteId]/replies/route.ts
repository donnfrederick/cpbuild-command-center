import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEffectiveSession } from "@/lib/masquerade";
import { canUseFieldDailyReport, resolveFieldDailyReportOwnerUserIds } from "@/lib/field-daily-report/auth";
import { resolveReportDateParam } from "@/lib/field-daily-report/service";
import { createFieldDailySectionNoteReply } from "@/lib/field-daily-report/section-notes-service";
import { userCanAccessProjectFieldDaily } from "@/lib/field-daily-report/project-scope";
import { db } from "@/lib/db";

const PostReplySchema = z.object({
  reportDate: z.string().optional(),
  body: z.string().min(1).max(5000),
});

export const dynamic = "force-dynamic";

/** POST /api/projects/[id]/field-daily/section-notes/[noteId]/replies */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id: projectId, noteId } = await context.params;
  const parsed = PostReplySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseFieldDailyReport(effective.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { installManagerId: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const reportDate = resolveReportDateParam(parsed.data.reportDate ?? null);
  const canAccess = await userCanAccessProjectFieldDaily(
    effective.user.id,
    effective.user.role,
    projectId,
    reportDate,
  );
  if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const reply = await createFieldDailySectionNoteReply({
    ownerUserIds: resolveFieldDailyReportOwnerUserIds(project.installManagerId, effective.user.id),
    projectId,
    reportDate,
    noteId,
    body: parsed.data.body,
    authorUserId: effective.user.id,
  });

  if (reply === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ reply, reportDate }, { status: 201 });
}

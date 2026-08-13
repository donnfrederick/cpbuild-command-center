import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEffectiveSession } from "@/lib/masquerade";
import { canUseFieldDailyReport, resolveFieldDailyReportOwnerUserIds } from "@/lib/field-daily-report/auth";
import { resolveReportDateParam, SECTION_KEYS } from "@/lib/field-daily-report/service";
import {
  createFieldDailySectionNote,
  listFieldDailySectionNotesForProjectRow,
} from "@/lib/field-daily-report/section-notes-service";
import { findFieldDailyReportProjectRow } from "@/lib/field-daily-report/report-project-row";
import { userCanAccessProjectFieldDaily } from "@/lib/field-daily-report/project-scope";
import { db } from "@/lib/db";
import type { FieldDailyReportSectionKey } from "@/lib/field-daily-report/types";

const PostNoteSchema = z.object({
  reportDate: z.string().optional(),
  sectionKey: z.enum([
    "progress",
    "statusUpdates",
    "subcontractors",
    "teamsOnSite",
    "inspections",
    "issues",
    "observations",
    "other",
  ]),
  itemKey: z.string().optional(),
  body: z.string().min(1).max(5000),
});

async function authorizeFieldDailySectionNotes(
  req: NextRequest,
  projectId: string,
  reportDateParam: string | undefined,
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!canUseFieldDailyReport(effective.user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, installManagerId: true },
  });
  if (!project) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  const reportDate = resolveReportDateParam(reportDateParam ?? null);
  const canAccess = await userCanAccessProjectFieldDaily(
    effective.user.id,
    effective.user.role,
    projectId,
    reportDate,
  );
  if (!canAccess) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const ownerUserIds = resolveFieldDailyReportOwnerUserIds(
    project.installManagerId,
    effective.user.id,
  );
  return {
    effective,
    project,
    reportDate,
    ownerUserIds,
  };
}

export const dynamic = "force-dynamic";

/** GET /api/projects/[id]/field-daily/section-notes */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;
  const reportDateParam = req.nextUrl.searchParams.get("reportDate") ?? undefined;
  const auth = await authorizeFieldDailySectionNotes(req, projectId, reportDateParam);
  if ("error" in auth && auth.error) return auth.error;

  const projectRow = await findFieldDailyReportProjectRow({
    projectId,
    reportDate: auth.reportDate!,
    ownerUserIds: auth.ownerUserIds!,
  });
  if (!projectRow) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const notes = await listFieldDailySectionNotesForProjectRow(
    projectRow.id,
    auth.project!.installManagerId,
  );

  return NextResponse.json({ notes, reportDate: auth.reportDate });
}

/** POST /api/projects/[id]/field-daily/section-notes */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;
  const parsed = PostNoteSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const auth = await authorizeFieldDailySectionNotes(req, projectId, parsed.data.reportDate);
  if ("error" in auth && auth.error) return auth.error;

  if (!SECTION_KEYS.includes(parsed.data.sectionKey as FieldDailyReportSectionKey)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  const note = await createFieldDailySectionNote({
    ownerUserIds: auth.ownerUserIds!,
    projectId,
    reportDate: auth.reportDate!,
    sectionKey: parsed.data.sectionKey,
    itemKey: parsed.data.itemKey,
    body: parsed.data.body,
    authorUserId: auth.effective!.user.id,
  });

  if (!note) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json({ note, reportDate: auth.reportDate }, { status: 201 });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiTimer, logApi } from "@/lib/api-logger";
import { getSession } from "@/lib/dev-session";
import { resolveActivityActorName } from "@/lib/activity-logger";
import { upsertInspectionSyncFailedLog } from "@/lib/activity/upsert-inspection-sync-failed-log";
import { enforceProductionProjectMutation } from "@/lib/production-project-access";

const SyncErrorAttemptSchema = z.object({
  attempt: z.number().int().min(1).max(10),
  message: z.string().min(1).max(2000),
  httpStatus: z.number().int().optional(),
  errorKind: z.enum(["retriable", "rejected", "exhausted", "auth"]),
  recordedAt: z.string().datetime(),
});

const InspectionSyncFailedSchema = z.object({
  offlineMutationId: z.string().min(1).max(128),
  clientQueuedAt: z.string().datetime(),
  formName: z.string().min(1).max(500),
  category: z.string().min(1).max(128),
  outcome: z.enum(["PASS", "FAIL", "COMPLETE"]),
  syncErrors: z.array(SyncErrorAttemptSchema).min(1).max(10),
  unit: z.string().max(100),
  building: z.string().max(100),
  level: z.string().max(100),
  scopeRowId: z.string().optional(),
  scopeName: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/projects/[id]/activity/inspection-sync-failed", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, session);
  if (prodBlock) return prodBlock;

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }

  const parsed = InspectionSyncFailedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { actorId, userName } = await resolveActivityActorName(session);

  const result = await upsertInspectionSyncFailedLog(projectId, actorId, userName, parsed.data);

  logApi(
    "POST",
    `/api/projects/${projectId}/activity/inspection-sync-failed`,
    result.updated ? 200 : 201,
    result.updated ? "Updated sync failure activity" : "Created sync failure activity",
    elapsed(),
  );

  return NextResponse.json(result, { status: result.updated ? 200 : 201 });
}

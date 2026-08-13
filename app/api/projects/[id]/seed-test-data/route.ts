import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { logApi, apiTimer } from "@/lib/api-logger";
import {
  assertAdminTestProject,
  TestSeedForbiddenError,
  TestSeedNotTestProjectError,
  TestSeedValidationError,
  validateActiveUserIds,
} from "@/lib/test-data-seed/guards";
import { seedTestData } from "@/lib/test-data-seed/seed-test-data";

const BodySchema = z.object({
  issues: z
    .object({
      count: z.number().int().min(0).max(500),
      resolvedRatio: z.number().min(0).max(1).optional(),
      commentRatio: z.number().min(0).max(1).optional(),
    })
    .optional(),
  observations: z
    .object({
      count: z.number().int().min(0).max(500),
      withMediaRatio: z.number().min(0).max(1).optional(),
    })
    .optional(),
  clearInspections: z
    .object({
      count: z.number().int().min(0).max(500),
      passedRatio: z.number().min(0).max(1).optional(),
    })
    .optional(),
  calibrations: z
    .object({
      count: z.number().int().min(0).max(500),
      passedRatio: z.number().min(0).max(1).optional(),
    })
    .optional(),
  dateRangeDays: z.number().int().min(1).max(365).optional(),
  userIds: z.array(z.string().min(1)).min(1).max(50),
  randomSeed: z.number().int().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/projects/[id]/seed-test-data", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  try {
    await assertAdminTestProject(projectId, session.user.role);
  } catch (err) {
    if (err instanceof TestSeedForbiddenError) {
      logApi("POST", `/api/projects/${projectId}/seed-test-data`, 403, err.message, elapsed());
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof TestSeedNotTestProjectError) {
      logApi("POST", `/api/projects/${projectId}/seed-test-data`, 403, err.message, elapsed());
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  try {
    await validateActiveUserIds(parsed.data.userIds);
  } catch (err) {
    if (err instanceof TestSeedValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  const adminUserId = session.user.id;
  if (!adminUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await seedTestData(projectId, adminUserId, parsed.data);
    logApi(
      "POST",
      `/api/projects/${projectId}/seed-test-data`,
      201,
      `Seeded batch ${result.batchId}`,
      elapsed(),
      result
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof TestSeedValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const message = err instanceof Error ? err.message : "Failed to seed test data";
    console.error("[POST seed-test-data]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

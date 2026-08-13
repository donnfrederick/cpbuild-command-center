import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { logApi, apiTimer } from "@/lib/api-logger";
import {
  assertAdminTestProject,
  TestSeedForbiddenError,
  TestSeedNotTestProjectError,
} from "@/lib/test-data-seed/guards";
import type { SeedCounts } from "@/lib/test-data-seed/constants";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("GET", "/api/projects/[id]/test-seed-batches", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  try {
    await assertAdminTestProject(projectId, session.user.role);
  } catch (err) {
    if (err instanceof TestSeedForbiddenError || err instanceof TestSeedNotTestProjectError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const batches = await db.testSeedBatch.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true, email: true } },
    },
  });

  const items = batches.map((b) => {
    const counts = (b.counts ?? {}) as unknown as SeedCounts;
    const config = b.config as {
      issues?: { count?: number };
      observations?: { count?: number };
      clearInspections?: { count?: number };
      calibrations?: { count?: number };
      dateRangeDays?: number;
    };
    return {
      id: b.id,
      createdAt: b.createdAt.toISOString(),
      createdByName: b.createdBy.name ?? b.createdBy.email ?? "Admin",
      counts,
      configSummary: {
        issues: config.issues?.count ?? 0,
        observations: config.observations?.count ?? 0,
        clearInspections: config.clearInspections?.count ?? 0,
        calibrations: config.calibrations?.count ?? 0,
        dateRangeDays: config.dateRangeDays ?? 90,
      },
    };
  });

  logApi(
    "GET",
    `/api/projects/${projectId}/test-seed-batches`,
    200,
    `Returned ${items.length} batch(es)`,
    elapsed()
  );

  return NextResponse.json({ batches: items });
}

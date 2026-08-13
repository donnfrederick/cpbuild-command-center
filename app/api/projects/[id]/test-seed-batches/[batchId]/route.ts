import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { logApi, apiTimer } from "@/lib/api-logger";
import {
  assertAdminTestProject,
  TestSeedForbiddenError,
  TestSeedNotTestProjectError,
  TestSeedValidationError,
} from "@/lib/test-data-seed/guards";
import { removeTestDataBatch } from "@/lib/test-data-seed/seed-test-data";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; batchId: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("DELETE", "/api/projects/[id]/test-seed-batches/[batchId]", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, batchId } = await params;

  try {
    await assertAdminTestProject(projectId, session.user.role);
  } catch (err) {
    if (err instanceof TestSeedForbiddenError || err instanceof TestSeedNotTestProjectError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const adminUserId = session.user.id;
  if (!adminUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const counts = await removeTestDataBatch(projectId, batchId, adminUserId);
    logApi(
      "DELETE",
      `/api/projects/${projectId}/test-seed-batches/${batchId}`,
      200,
      "Batch removed",
      elapsed(),
      counts
    );
    return NextResponse.json({ batchId, removed: counts });
  } catch (err) {
    if (err instanceof TestSeedValidationError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("[DELETE test-seed-batch]", err);
    return NextResponse.json({ error: "Failed to remove batch" }, { status: 500 });
  }
}

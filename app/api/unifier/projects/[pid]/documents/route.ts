/**
 * GET /api/unifier/projects/[pid]/documents
 *
 * Returns documents from Unifier Document Manager for a project.
 * pid = Unifier project/shell identifier (unifierPid).
 * Note: dm_file_view.PROJECT_ID may be internal ID; if no docs returned,
 * verify the mapping between PID and project_id in Unifier.
 */

import { NextResponse } from "next/server";
import { getProjectDocuments } from "@/lib/unifier/service";
import { logApi, apiTimer } from "@/lib/api-logger";

async function getSession() {
  const isBypass =
    process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";
  if (isBypass) return { user: { id: "dev-user" } };
  const { auth } = await import("@/lib/auth");
  return auth();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pid: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("GET", "/api/unifier/projects/[pid]/documents", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pid } = await params;
  if (!pid) {
    return NextResponse.json({ error: "Missing pid" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const projectNumber = searchParams.get("projectNumber") ?? undefined;

  try {
    const documents = await getProjectDocuments(pid, projectNumber || null);
    logApi("GET", `/api/unifier/projects/${pid}/documents`, 200, `Returned ${documents.length} documents`, elapsed(), null);
    return NextResponse.json({ documents });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logApi("GET", `/api/unifier/projects/${pid}/documents`, 500, message, elapsed(), { error: message });
    return NextResponse.json({ error: "Failed to fetch documents", detail: message }, { status: 500 });
  }
}

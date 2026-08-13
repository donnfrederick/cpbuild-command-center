import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProjects } from "@/lib/unifier/service";
import { CC_UNIFIER_LINKED_COUNT_HEADER } from "@/lib/unifier/projects-list-header";
import { logApi, apiTimer } from "@/lib/api-logger";
import type { UnifierProject } from "@/lib/unifier/types";

/**
 * GET /api/unifier/projects
 *
 * Returns all Unifier project shells from the PDS API, with already-linked
 * projects (those whose PID exists in the Field Tracker DB) filtered out.
 *
 * Used by the CreateProjectModal Step 1 search.
 *
 * Results are drawn from a 5-minute server-side cache to avoid hammering
 * the Unifier PDS API on every keystroke.
 */
async function getSession() {
  const isBypass =
    process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";
  if (isBypass) return { user: { id: "dev-user" } };
  const { auth } = await import("@/lib/auth");
  return auth();
}

export async function GET() {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("GET", "/api/unifier/projects", 401, "Unauthorized — no active session", elapsed(), { error: "Unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all Unifier projects (cached)
  let unifierProjects: UnifierProject[];
  try {
    unifierProjects = await getProjects();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const errBody = { error: "Failed to fetch projects from Unifier. Check server logs." };
    logApi("GET", "/api/unifier/projects", 502, `Failed to fetch from Unifier PDS API — ${detail}`, elapsed(), errBody);
    return NextResponse.json(errBody, { status: 502 });
  }

  // Get PIDs already linked in Field Tracker (active only — soft-deleted excluded
  // so those projects can be re-added and restored via the normal flow).
  const linked = await db.project.findMany({
    where: { unifierPid: { not: null }, deletedAt: null },
    select: { unifierPid: true },
  });
  const linkedPids = new Set((linked ?? []).map((p) => p.unifierPid).filter(Boolean));

  // Filter out already-linked projects
  const available = unifierProjects.filter((p) => !linkedPids.has(p.pid));

  logApi(
    "GET",
    "/api/unifier/projects",
    200,
    `${available.length} available Unifier project${available.length !== 1 ? "s" : ""} (${linkedPids.size} already linked)`,
    elapsed(),
    available
  );
  const res = NextResponse.json(available);
  res.headers.set(CC_UNIFIER_LINKED_COUNT_HEADER, String(linkedPids.size));
  return res;
}

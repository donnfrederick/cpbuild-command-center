import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProductionFieldNotesMutation } from "@/lib/production-project-access";
import { logActivity, resolveActorName } from "@/lib/activity-logger";

type Params = { params: Promise<{ id: string; issueId: string }> };

// Creator, Admin, Developer, Install Manager, or Install Director may re-open a resolved issue.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, issueId } = await params;

  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    session,
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  const issue = await db.projectIssue.findFirst({ where: { id: issueId, projectId } });
  if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (issue.status === "OPEN") {
    return NextResponse.json({ error: "Issue is already open" }, { status: 409 });
  }

  const isCreator = issue.createdById === effective.user.id;
  // Mirrors the resolve route: ADMIN, DEVELOPER, INSTALL_MANAGER, and INSTALL_DIRECTOR
  // all have full operational control and can reopen issues they did not create.
  const isPrivileged =
    effective.user.role === "ADMIN" ||
    effective.user.role === "DEVELOPER" ||
    effective.user.role === "INSTALL_MANAGER" ||
    effective.user.role === "INSTALL_DIRECTOR";
  if (!isCreator && !isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await db.projectIssue.update({
    where: { id: issueId },
    data: {
      status: "OPEN",
      resolvedAt: null,
      resolvedById: null,
    },
  });

  void (async () => {
    const actorId = effective.user.id ?? null;
    const userName = await resolveActorName(actorId);
    void logActivity(projectId, actorId, userName, {
      eventType: "ISSUE_REOPENED",
      issueId,
      shortDescription: issue.shortDescription,
      unitRef: issue.unitRef ?? null,
    });
  })();

  return NextResponse.json(updated);
}

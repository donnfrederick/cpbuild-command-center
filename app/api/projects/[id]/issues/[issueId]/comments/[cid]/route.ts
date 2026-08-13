import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession, productionGuardSession, writeAuthorizationRole } from "@/lib/masquerade";
import { getSession } from "@/lib/dev-session";
import { enforceProductionFieldNotesMutation } from "@/lib/production-project-access";
import { isFieldLeadershipRole } from "@/lib/permissions";

const EDIT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

const PatchCommentSchema = z.object({
  body: z.string().min(1).max(4000),
});

type Params = { id: string; issueId: string; cid: string };

export async function PATCH(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, issueId, cid } = await params;

  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    session,
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  // Exclude soft-deleted comments so they can't be resurrected via edit
  const comment = await db.issueComment.findFirst({
    where: { id: cid, issueId, deletedAt: null },
    include: { issue: { select: { projectId: true } } },
  });

  if (!comment || comment.issue.projectId !== projectId) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  const resolvedUserId = effective.user.id;

  if (comment.authorId !== resolvedUserId) {
    return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
  }

  const ageMs = Date.now() - comment.createdAt.getTime();
  if (ageMs > EDIT_WINDOW_MS) {
    return NextResponse.json(
      { error: "Comments can only be edited within 30 minutes of posting" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const updated = await db.issueComment.update({
    where: { id: cid },
    data: { body: parsed.data.body, editedAt: new Date() },
    include: {
      author: { select: { id: true, name: true, email: true } },
      attachments: true,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const effective = await getEffectiveSession();
  if (!effective?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isFieldLeadershipRole(writeAuthorizationRole(effective))) {
    return NextResponse.json({ error: "Forbidden — field leadership only" }, { status: 403 });
  }

  const { id: projectId, issueId, cid } = await params;

  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    productionGuardSession(effective),
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  const comment = await db.issueComment.findFirst({
    where: { id: cid, issueId },
    include: { issue: { select: { projectId: true } } },
  });

  if (!comment || comment.issue.projectId !== projectId) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  if (comment.deletedAt) {
    return NextResponse.json({ error: "Already deleted" }, { status: 409 });
  }

  await db.issueComment.update({ where: { id: cid }, data: { deletedAt: new Date() } });
  return NextResponse.json({ deleted: true });
}

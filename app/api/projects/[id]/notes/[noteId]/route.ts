import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProductionFieldNotesMutation } from "@/lib/production-project-access";
import {
  setProjectNotePinned,
  softDeleteProjectNote,
  updateProjectNote,
} from "@/lib/project-notes/service";

const PatchNoteSchema = z
  .object({
    body: z.string().min(1).max(5000).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((data) => data.body !== undefined || data.pinned !== undefined, {
    message: "Provide body and/or pinned",
  });

export const dynamic = "force-dynamic";

/** PATCH /api/projects/[id]/notes/[noteId] */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, noteId } = await context.params;

  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    session,
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  const parsed = PatchNoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  let latestNote = null;

  if (parsed.data.body !== undefined) {
    const result = await updateProjectNote({
      projectId,
      noteId,
      authorId: effective.user.id,
      body: parsed.data.body,
    });

    if (result === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    latestNote = result;
  }

  if (parsed.data.pinned !== undefined) {
    const result = await setProjectNotePinned({
      projectId,
      noteId,
      pinned: parsed.data.pinned,
    });

    if (result === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    latestNote = result;
  }

  return NextResponse.json({ note: latestNote });
}

/** DELETE /api/projects/[id]/notes/[noteId] */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, noteId } = await context.params;

  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prodBlock = await enforceProductionFieldNotesMutation(
    projectId,
    session,
    effective.masquerade ?? null,
  );
  if (prodBlock) return prodBlock;

  const result = await softDeleteProjectNote({
    projectId,
    noteId,
    authorId: effective.user.id,
  });

  if (result === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}

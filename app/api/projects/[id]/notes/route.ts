import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  enforceProductionFieldNotesMutation,
  enforceProjectReadVisibility,
} from "@/lib/production-project-access";
import { parseListLimit } from "@/lib/parse-list-limit";
import { PROJECT_NOTES_PAGE_SIZE } from "@/lib/project-notes/constants";
import {
  createProjectNote,
  listProjectNotes,
} from "@/lib/project-notes/service";

const PostNoteSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const dynamic = "force-dynamic";

/** GET /api/projects/[id]/notes */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await context.params;
  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const limit = parseListLimit(req.nextUrl.searchParams.get("limit")) ?? PROJECT_NOTES_PAGE_SIZE;
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;

  const payload = await listProjectNotes({
    projectId,
    limit,
    cursor,
    includePreview: !cursor,
  });

  return NextResponse.json(payload);
}

/** POST /api/projects/[id]/notes */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await context.params;

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

  const parsed = PostNoteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const note = await createProjectNote({
    projectId,
    authorId: effective.user.id,
    body: parsed.data.body,
  });
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ note }, { status: 201 });
}

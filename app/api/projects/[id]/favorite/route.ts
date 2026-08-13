import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  checkProjectVisibleInApi,
  getProjectAccessRow,
} from "@/lib/production-project-access";
import { favoriteOwnerFromEffectiveSession } from "@/lib/project-favorites";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";

const FavoriteSchema = z.object({
  favorite: z.boolean(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUserId = await resolveSessionToDbUserId(favoriteOwnerFromEffectiveSession(effective));
  if (!dbUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = FavoriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const project = await getProjectAccessRow(projectId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const visibility = checkProjectVisibleInApi(project, effective.user.role);
  if (!visibility.allowed) {
    return NextResponse.json({ error: visibility.error }, { status: visibility.status });
  }

  try {
    if (parsed.data.favorite) {
      await db.userProjectFavorite.upsert({
        where: {
          userId_projectId: {
            userId: dbUserId,
            projectId,
          },
        },
        create: {
          userId: dbUserId,
          projectId,
        },
        update: {},
      });
    } else {
      await db.userProjectFavorite.deleteMany({
        where: {
          userId: dbUserId,
          projectId,
        },
      });
    }

    return NextResponse.json({ projectId, favorite: parsed.data.favorite });
  } catch (err) {
    console.error("[projects/[id]/favorite PATCH]", err);
    return NextResponse.json({ error: "Failed to update favorite" }, { status: 500 });
  }
}

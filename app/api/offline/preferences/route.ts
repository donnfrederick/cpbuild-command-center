import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { z } from "zod";
import { OFFLINE_MODULES, ALWAYS_CACHED_MODULES } from "@/lib/offline/modules";

const UpdatePreferencesSchema = z.object({
  modules: z.array(z.string()).optional(),
  offlineProjectIds: z.array(z.string()).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [pref, projectSyncs] = await Promise.all([
      db.offlinePreference.findUnique({ where: { userId: session.user.id } }),
      db.offlineProjectSync.findMany({ where: { userId: session.user.id } }),
    ]);

    const projectSyncedAt: Record<string, string> = {};
    for (const sync of projectSyncs) {
      projectSyncedAt[sync.projectId] = sync.syncedAt.toISOString();
    }

    return NextResponse.json({
      modules: pref?.modules ?? [],
      offlineProjectIds: pref?.offlineProjectIds ?? [],
      syncedAt: pref?.syncedAt ?? null,
      projectSyncedAt,
      availableModules: OFFLINE_MODULES,
    });
  } catch (err) {
    console.error("[offline/preferences GET]", err);
    return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdatePreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updateData: {
    modules?: string[];
    offlineProjectIds?: string[];
  } = {};

  if (parsed.data.modules !== undefined) {
    const validIds = new Set(
      OFFLINE_MODULES.filter((m) => m.available).map((m) => m.id)
    );
    const requested = parsed.data.modules.filter((id) => validIds.has(id));
    updateData.modules = Array.from(new Set([...ALWAYS_CACHED_MODULES, ...requested]));
  }

  if (parsed.data.offlineProjectIds !== undefined) {
    updateData.offlineProjectIds = parsed.data.offlineProjectIds;
  }

  try {
    const pref = await db.offlinePreference.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        modules: updateData.modules ?? [...ALWAYS_CACHED_MODULES],
        offlineProjectIds: updateData.offlineProjectIds ?? [],
      },
      update: updateData,
    });

    const projectSyncs = await db.offlineProjectSync.findMany({
      where: { userId: session.user.id },
    });

    const projectSyncedAt: Record<string, string> = {};
    for (const sync of projectSyncs) {
      projectSyncedAt[sync.projectId] = sync.syncedAt.toISOString();
    }

    return NextResponse.json({
      modules: pref.modules,
      offlineProjectIds: pref.offlineProjectIds,
      projectSyncedAt,
    });
  } catch (err) {
    console.error("[offline/preferences PUT]", err);
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}

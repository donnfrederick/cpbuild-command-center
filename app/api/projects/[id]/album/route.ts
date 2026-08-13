import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility, enforceProductionProjectMutation } from "@/lib/production-project-access";
import type { AlbumItem, AlbumSourceType } from "@/lib/media/album-types";
import { fetchAlbumItemsForUnitRef } from "@/lib/media/fetch-album-items-for-unit-ref";
import { isVisualMedia } from "@/lib/media/album-visual";
import { parseScopeCodesFromStatusUpdateLabel } from "@/lib/media/album-scope-tags";
import { voidLogFieldActivity } from "@/lib/activity/log-field-activity";
import { promoteUploadCaptureContextsForStorageKeys } from "@/lib/field-media/promote-upload-capture-context";
import { captureContextInclude, serializeCaptureContext } from "@/lib/media/serialize-capture-context";

// ── GET /api/projects/[id]/album?unitRef=building|level|unit ──────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const unitRef = new URL(req.url).searchParams.get("unitRef");
  if (!unitRef) return NextResponse.json({ error: "unitRef is required" }, { status: 400 });

  try {
    const items = await fetchAlbumItemsForUnitRef(db, projectId, unitRef);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[album GET] error:", err);
    return NextResponse.json({ error: "Failed to fetch album" }, { status: 500 });
  }
}

// ── POST /api/projects/[id]/album?unitRef=building|level|unit ─────────────────

const VALID_POST_SOURCE_TYPES = ["general", "status_update"] as const;
type PostSourceType = typeof VALID_POST_SOURCE_TYPES[number];

const PostSchema = z.object({
  storageKey: z.string().min(1),
  storageUrl: z.string().url(),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().nonnegative().nullable().default(null),
  caption: z.string().max(500).nullable().default(null),
  sourceType: z.enum(VALID_POST_SOURCE_TYPES).default("general"),
  sourceLabel: z.string().max(200).nullable().default(null),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const mutationBlock = await enforceProductionProjectMutation(projectId, session);
  if (mutationBlock) return mutationBlock;

  const unitRef = new URL(req.url).searchParams.get("unitRef");
  if (!unitRef) return NextResponse.json({ error: "unitRef is required" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { storageKey, storageUrl, mimeType, fileSizeBytes, caption, sourceType, sourceLabel } = parsed.data;

  if (!isVisualMedia(mimeType)) {
    return NextResponse.json({ error: "Only image and video files are supported in the photo album" }, { status: 400 });
  }

  let attachment;
  try {
    attachment = await db.mediaAttachment.create({
      data: {
        storageKey,
        storageUrl,
        mimeType,
        fileSizeBytes,
        caption,
        unitPhotoProjectId: projectId,
        unitPhotoUnitRef: unitRef,
        uploadedById: session.user.id,
        unitPhotoSourceType: sourceType,
        unitPhotoSourceLabel: sourceLabel ?? null,
      },
      select: { id: true, storageUrl: true, mimeType: true, fileSizeBytes: true, caption: true, createdAt: true },
    });
  } catch (err) {
    console.error("[album POST] error:", err);
    return NextResponse.json({ error: "Failed to save photo" }, { status: 500 });
  }

  await promoteUploadCaptureContextsForStorageKeys([
    { id: attachment.id, storageKey },
  ]);

  const enriched = await db.mediaAttachment.findUnique({
    where: { id: attachment.id },
    select: {
      id: true,
      storageUrl: true,
      mimeType: true,
      fileSizeBytes: true,
      caption: true,
      createdAt: true,
      ...captureContextInclude,
    },
  });

  const resolvedSourceType: AlbumSourceType = (VALID_POST_SOURCE_TYPES as readonly string[]).includes(sourceType)
    ? (sourceType as PostSourceType)
    : "general";

  const statusCodes = resolvedSourceType === "status_update"
    ? parseScopeCodesFromStatusUpdateLabel(sourceLabel)
    : [];

  const item: AlbumItem = {
    id: enriched!.id,
    storageUrl: enriched!.storageUrl,
    mimeType: enriched!.mimeType,
    fileSizeBytes: enriched!.fileSizeBytes,
    caption: enriched!.caption,
    createdAt: enriched!.createdAt.toISOString(),
    source: {
      type: resolvedSourceType,
      label: sourceLabel ?? null,
      entityId: null,
      scopeCodes: statusCodes.length > 0 ? statusCodes : undefined,
    },
    captureContext: enriched?.captureContext
      ? serializeCaptureContext(enriched.captureContext)
      : undefined,
  };

  const [building = "", level = "", unit = ""] = unitRef.split("|");
  const requestBody =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  voidLogFieldActivity(
    projectId,
    session,
    {
      eventType: "UNIT_PHOTO_UPLOADED",
      attachmentId: attachment.id,
      unitRef,
      building,
      level,
      unit,
      sourceType: resolvedSourceType,
      sourceLabel: sourceLabel ?? null,
    },
    { requestBody, attachmentIds: [attachment.id] },
  );

  return NextResponse.json({ item }, { status: 201 });
}

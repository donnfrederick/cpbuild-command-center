import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  absoluteAppOriginFromRequest,
  isSupabaseFieldMediaConfigured,
  writeLocalFieldMediaFile,
} from "@/lib/field-media-local";
import { recordFieldMediaUploadAttempt } from "@/lib/field-media-upload-rate-limit";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { logActivity, resolveActorName } from "@/lib/activity-logger";
import { parseImageAnnotation } from "@/lib/image-annotation-schema";
import type { ImageAnnotationPayload } from "@/lib/image-annotation-schema";
import { parseCaptureClientMetadata } from "@/lib/media/capture-context-schema";
import { upsertFieldMediaUploadContext } from "@/lib/field-media/staging-upload-capture-context";

const BUCKET = "field-media";
const SIGNED_URL_EXPIRY_SECONDS = 365 * 24 * 60 * 60; // 1 year
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB server-side cap

const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"];

// iPhone HEIC files sometimes arrive with no MIME type — detect by extension instead.
function resolvedMimeType(file: Blob, fileName?: string): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = (fileName ?? "").split(".").pop()?.toLowerCase();
  if (ext === "heic" || ext === "heif") return "image/heic";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "mp4" || ext === "mov") return "video/mp4";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a") return "audio/aac";
  return file.type || "application/octet-stream";
}

// Supabase MIME type → file extension
function extFromMime(mime: string): string {
  if (mime.startsWith("image/jpeg")) return "jpg";
  if (mime.startsWith("image/png")) return "png";
  if (mime.startsWith("image/webp")) return "webp";
  if (mime.startsWith("image/gif")) return "gif";
  if (mime.startsWith("image/heic") || mime.startsWith("image/heif")) return "heic";
  if (mime.includes("mp4") || mime.includes("quicktime")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("matroska") || mime.includes("mkv")) return "mkv";
  if (mime.startsWith("audio/mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.startsWith("audio/wav") || mime.startsWith("audio/wave")) return "wav";
  if (mime.startsWith("audio/ogg")) return "ogg";
  if (mime.startsWith("audio/aac")) return "aac";
  if (mime.startsWith("audio/")) return "webm"; // default for audio/webm from MediaRecorder
  return "bin";
}

// Folder within the bucket — driven by the declared "type" param from the client.
const ALLOWED_TYPES = new Set([
  "issues",
  "observations",
  "comments",
  "issue-comments",
  "obs-comments",
  "feedback-comments",
  "album",
  "inspections",
]);

function getSupabaseUrl(): string {
  // 1. Explicit env var — always preferred
  const url = process.env.SUPABASE_URL;
  if (url) return url.replace(/\/$/, "");

  // 2. Derive from DATABASE_URL — works when the host contains the project ref
  //    e.g. "postgres.{ref}:5432" (direct connection format)
  const dbUrl = process.env.DATABASE_URL ?? "";
  const directMatch = dbUrl.match(/postgres\.([a-z0-9]+):/);
  if (directMatch) return `https://${directMatch[1]}.supabase.co`;

  // 3. Derive from the service role JWT — the payload always contains a "ref" claim
  //    Works with the PgBouncer pooler URL format which doesn't embed the project ref
  const jwt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (jwt) {
    try {
      const payloadB64 = jwt.split(".")[1];
      if (payloadB64) {
        const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8")) as { ref?: string };
        if (payload.ref) return `https://${payload.ref}.supabase.co`;
      }
    } catch { /* fall through */ }
  }

  throw new Error("SUPABASE_URL is not set and cannot be derived from DATABASE_URL or service role key");
}

async function finalizeUploadResponse(
  storageKey: string,
  storageUrl: string,
  mimeType: string,
  fileSizeBytes: number,
  extras: {
    imageAnnotationValue?: ImageAnnotationPayload;
    caption?: string;
    issueCommentId?: string;
    observationCommentId?: string;
    projectId?: string;
    captureMetadataRaw: FormDataEntryValue | null;
  },
) {
  const captureMetadata = (() => {
    if (typeof extras.captureMetadataRaw !== "string" || extras.captureMetadataRaw.length === 0) {
      return null;
    }
    try {
      return parseCaptureClientMetadata(JSON.parse(extras.captureMetadataRaw));
    } catch {
      return null;
    }
  })();

  if (captureMetadata) {
    try {
      await upsertFieldMediaUploadContext({
        storageKey,
        projectId: extras.projectId,
        metadata: captureMetadata,
      });
    } catch (err) {
      console.warn("[upload/field-media] Failed to persist capture context:", err);
    }
  }

  return NextResponse.json({
    storageKey,
    storageUrl,
    mimeType,
    fileSizeBytes,
    ...(extras.imageAnnotationValue !== undefined ? { imageAnnotation: extras.imageAnnotationValue } : {}),
    ...(extras.caption !== undefined ? { caption: extras.caption } : {}),
    ...(extras.issueCommentId !== undefined ? { issueCommentId: extras.issueCommentId } : {}),
    ...(extras.observationCommentId !== undefined ? { observationCommentId: extras.observationCommentId } : {}),
  });
}

export async function POST(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const typeParam = (formData.get("type") as string | null) ?? "issues";
  const folderForAudit = ALLOWED_TYPES.has(typeParam) ? typeParam : "issues";

  const file = formData.get("file");
  const caption = (formData.get("caption") as string | null) ?? undefined;
  const issueCommentId = (formData.get("issueCommentId") as string | null) ?? undefined;
  const observationCommentId = (formData.get("observationCommentId") as string | null) ?? undefined;
  const projectIdRaw = formData.get("projectId");
  const projectId =
    typeof projectIdRaw === "string" && projectIdRaw.trim().length > 0 ? projectIdRaw.trim() : undefined;
  const captureMetadataRaw = formData.get("captureMetadata");

  // Optional layered annotation saved by CameraCapture when the user annotates a photo
  // before uploading. Stored on MediaAttachment.imageAnnotation so the annotation can
  // be re-edited later in the issue/observation detail view.
  let imageAnnotationValue: ImageAnnotationPayload | undefined;
  const imageAnnotationRaw = formData.get("imageAnnotation");
  if (typeof imageAnnotationRaw === "string" && imageAnnotationRaw.length > 0) {
    try {
      const parsed = parseImageAnnotation(JSON.parse(imageAnnotationRaw));
      if (parsed) imageAnnotationValue = parsed;
    } catch {
      // Malformed JSON — ignore, annotation is optional
    }
  }

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 50 MB limit" }, { status: 413 });
  }

  const originalName = file instanceof File ? file.name : undefined;
  const mimeType = resolvedMimeType(file, originalName);
  const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
  if (!isAllowed) {
    return NextResponse.json(
      { error: "Unsupported file type. Only images, videos, and audio are accepted." },
      { status: 415 },
    );
  }

  const rate = recordFieldMediaUploadAttempt(effective.user.id);
  if (!rate.ok) {
    const projectIdRaw = formData.get("projectId");
    const projectIdForLog =
      typeof projectIdRaw === "string" && projectIdRaw.trim().length > 0 ? projectIdRaw.trim() : null;
    if (projectIdForLog) {
      const visBlock = await enforceProjectReadVisibility(projectIdForLog, effective);
      if (!visBlock) {
        const userName = await resolveActorName(effective.user.id);
        void logActivity(projectIdForLog, effective.user.id, userName, {
          eventType: "FIELD_MEDIA_UPLOAD_RATE_LIMITED",
          uploadType: folderForAudit,
          windowKey: rate.windowKey,
          count: rate.count,
          limit: rate.limit,
        });
      }
    } else {
      console.warn("[upload/field-media] Rate limited; no projectId for activity audit", {
        userId: effective.user.id,
        uploadType: folderForAudit,
        windowKey: rate.windowKey,
        count: rate.count,
        limit: rate.limit,
      });
    }
    return NextResponse.json(
      { error: "FIELD_MEDIA_RATE_LIMITED", detail: "Too many uploads. Try again in a few minutes." },
      { status: 429 },
    );
  }

  // Validate the folder type against an allowlist to prevent path injection
  const folder = folderForAudit;

  const ext = extFromMime(mimeType);
  const fileName = `${folder}/${randomUUID()}.${ext}`;
  const storageKey = `${BUCKET}/${fileName}`;

  if (!isSupabaseFieldMediaConfigured()) {
    const buf = Buffer.from(await file.arrayBuffer());
    try {
      await writeLocalFieldMediaFile(storageKey, buf);
    } catch (err) {
      console.error("[upload/field-media] Local write failed:", err);
      return NextResponse.json({ error: "Upload failed" }, { status: 502 });
    }
    const origin = absoluteAppOriginFromRequest(req);
    const storageUrl = `${origin}/api/upload/field-media/file?key=${encodeURIComponent(storageKey)}`;
    return finalizeUploadResponse(storageKey, storageUrl, mimeType, file.size, {
      imageAnnotationValue,
      caption,
      issueCommentId,
      observationCommentId,
      projectId,
      captureMetadataRaw,
    });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();

  let supabaseUrl: string;
  try {
    supabaseUrl = getSupabaseUrl();
  } catch {
    return NextResponse.json({ error: "Storage service URL is not configured" }, { status: 503 });
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${storageKey}`;

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": mimeType,
    },
    body: file,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error("[upload/field-media] Supabase upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  // Generate a long-lived signed URL (1 year)
  const signRes = await fetch(`${supabaseUrl}/storage/v1/object/sign/${storageKey}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: SIGNED_URL_EXPIRY_SECONDS }),
  });

  if (!signRes.ok) {
    const err = await signRes.text();
    console.error("[upload/field-media] Failed to sign URL:", err);
    return NextResponse.json({ error: "Failed to generate download URL" }, { status: 502 });
  }

  const { signedURL } = (await signRes.json()) as { signedURL: string };
  let storageUrl: string;
  if (signedURL.startsWith("http")) {
    storageUrl = signedURL;
  } else if (signedURL.startsWith("/storage/")) {
    storageUrl = `${supabaseUrl}${signedURL}`;
  } else {
    storageUrl = `${supabaseUrl}/storage/v1${signedURL}`;
  }

  return finalizeUploadResponse(storageKey, storageUrl, mimeType, file.size, {
    imageAnnotationValue,
    caption,
    issueCommentId,
    observationCommentId,
    projectId,
    captureMetadataRaw,
  });
}

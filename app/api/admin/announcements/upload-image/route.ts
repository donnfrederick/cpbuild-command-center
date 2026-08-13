import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseUrl } from "@/lib/supabase-url";
import {
  absoluteAppOriginFromRequest,
  isSupabaseFieldMediaConfigured,
  writeLocalFieldMediaFile,
} from "@/lib/field-media-local";
import {
  adminGuardResponse,
  requireAnnouncementAdmin,
} from "@/lib/announcements/require-announcement-admin";

const FIELD_MEDIA_BUCKET = "field-media";
const ANNOUNCEMENTS_FOLDER = "announcements";
const SIGNED_URL_EXPIRY_SECONDS = 365 * 24 * 60 * 60;
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function resolvedMimeType(file: Blob, fileName?: string): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type.split(";")[0].trim();
  }
  const ext = (fileName ?? "").split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return file.type.split(";")[0].trim();
}

function mimeToExt(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAnnouncementAdmin();
  if (guard.status) return adminGuardResponse(guard.status);

  const formData = await req.formData();
  const file = formData.get("image");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No image file provided" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image exceeds 5 MB limit" }, { status: 413 });
  }

  const originalName = file instanceof File ? file.name : undefined;
  const contentType = resolvedMimeType(file, originalName);
  if (!contentType || !ALLOWED_MIME_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: "Unsupported image format. Use PNG, JPEG, WebP, or GIF." },
      { status: 415 },
    );
  }

  const folderHint = formData.get("folderHint");
  const subfolder =
    typeof folderHint === "string" && folderHint.trim().length > 0
      ? folderHint.trim().replace(/[^a-zA-Z0-9-_]/g, "")
      : "draft";

  const ext = mimeToExt(contentType);
  const fileName = `${randomUUID()}.${ext}`;
  const storageKey = `${FIELD_MEDIA_BUCKET}/${ANNOUNCEMENTS_FOLDER}/${subfolder}/${fileName}`;

  if (!isSupabaseFieldMediaConfigured()) {
    const buf = Buffer.from(await file.arrayBuffer());
    try {
      await writeLocalFieldMediaFile(storageKey, buf);
    } catch (err) {
      console.error("[announcements/upload-image] Local write failed:", err);
      return NextResponse.json({ error: "Upload failed" }, { status: 502 });
    }
    const origin = absoluteAppOriginFromRequest(req);
    const url = `${origin}/api/upload/field-media/file?key=${encodeURIComponent(storageKey)}`;
    return NextResponse.json({ url });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) {
    return NextResponse.json({ error: "Storage service URL is not configured" }, { status: 503 });
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${storageKey}`;
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error("[announcements/upload-image] Supabase upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

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
    console.error("[announcements/upload-image] Failed to sign URL:", err);
    return NextResponse.json({ error: "Failed to generate image URL" }, { status: 502 });
  }

  const { signedURL } = (await signRes.json()) as { signedURL: string };
  let fullUrl: string;
  if (signedURL.startsWith("http")) {
    fullUrl = signedURL;
  } else if (signedURL.startsWith("/storage/")) {
    fullUrl = `${supabaseUrl}${signedURL}`;
  } else {
    fullUrl = `${supabaseUrl}/storage/v1${signedURL}`;
  }

  return NextResponse.json({ url: fullUrl });
}

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSession } from "@/lib/dev-session";
import { getSupabaseUrl } from "@/lib/supabase-url";
import {
  absoluteAppOriginFromRequest,
  isSupabaseFieldMediaConfigured,
  writeLocalFieldMediaFile,
} from "@/lib/field-media-local";

/** Same bucket as POST /api/upload/field-media — avoids a separate Supabase bucket. */
const FIELD_MEDIA_BUCKET = "field-media";
const FEEDBACK_SCREENSHOTS_FOLDER = "feedback-screenshots";
const SIGNED_URL_EXPIRY_SECONDS = 365 * 24 * 60 * 60; // 1 year
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    default: return "bin";
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("screenshot");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No screenshot file provided" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Screenshot exceeds 5 MB limit" }, { status: 413 });
  }

  const originalName = file instanceof File ? file.name : undefined;
  const contentType = resolvedMimeType(file, originalName);
  if (!contentType || !ALLOWED_MIME_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "Unsupported image format. Use PNG, JPEG, WebP, or GIF." }, { status: 415 });
  }

  const ext = mimeToExt(contentType);
  const fileName = `${randomUUID()}.${ext}`;
  const storageKey = `${FIELD_MEDIA_BUCKET}/${FEEDBACK_SCREENSHOTS_FOLDER}/${fileName}`;

  if (!isSupabaseFieldMediaConfigured()) {
    const buf = Buffer.from(await file.arrayBuffer());
    try {
      await writeLocalFieldMediaFile(storageKey, buf);
    } catch (err) {
      console.error("[upload-screenshot] Local write failed:", err);
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
    console.error("[upload-screenshot] Supabase upload failed:", err);
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
    console.error("[upload-screenshot] Failed to sign URL:", err);
    return NextResponse.json({ error: "Failed to generate screenshot URL" }, { status: 502 });
  }

  const { signedURL } = (await signRes.json()) as { signedURL: string };
  // Supabase sign endpoint returns "/object/sign/..." (missing the /storage/v1 prefix).
  // Normalize before prepending the base URL.
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

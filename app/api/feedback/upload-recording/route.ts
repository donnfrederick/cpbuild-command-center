import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSession } from "@/lib/dev-session";

const BUCKET = "feedback-recordings";
const SIGNED_URL_EXPIRY_SECONDS = 365 * 24 * 60 * 60; // 1 year

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (url) return url.replace(/\/$/, "");
  // Derive from DATABASE_URL: postgresql://postgres.{ref}:...
  const dbUrl = process.env.DATABASE_URL ?? "";
  const match = dbUrl.match(/postgres\.([a-z0-9]+):/);
  if (match) return `https://${match[1]}.supabase.co`;
  throw new Error("SUPABASE_URL is not set and cannot be derived from DATABASE_URL");
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Screen recording storage is not configured (SUPABASE_SERVICE_ROLE_KEY missing)" },
      { status: 503 },
    );
  }

  let supabaseUrl: string;
  try {
    supabaseUrl = getSupabaseUrl();
  } catch {
    return NextResponse.json({ error: "Storage service URL is not configured" }, { status: 503 });
  }

  const formData = await req.formData();
  const file = formData.get("recording");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No recording file provided" }, { status: 400 });
  }

  const MAX_BYTES = 100 * 1024 * 1024; // 100 MB hard cap
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording exceeds 100 MB limit" }, { status: 413 });
  }

  // Allowlist: only accept known video MIME types produced by MediaRecorder
  const ALLOWED_MIME_TYPES = ["video/webm", "video/mp4", "video/quicktime", "video/x-matroska"];
  const contentType = file.type || "video/webm";
  if (!ALLOWED_MIME_TYPES.some((allowed) => contentType.startsWith(allowed.split(";")[0]))) {
    return NextResponse.json({ error: "Unsupported recording format" }, { status: 415 });
  }
  const ext = contentType.includes("mp4") || contentType.includes("quicktime") ? "mp4" : "webm";
  const fileName = `${randomUUID()}.${ext}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${fileName}`;

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
    console.error("[upload-recording] Supabase upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  // Generate a long-lived signed URL (1 year)
  const signRes = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/${BUCKET}/${fileName}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: SIGNED_URL_EXPIRY_SECONDS }),
    },
  );

  if (!signRes.ok) {
    const err = await signRes.text();
    console.error("[upload-recording] Failed to sign URL:", err);
    return NextResponse.json({ error: "Failed to generate recording URL" }, { status: 502 });
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

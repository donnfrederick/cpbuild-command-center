/**
 * Thin wrapper around the Gemini Files API.
 *
 * The `@google/generative-ai` SDK handles `generateContent` but does not ship
 * browser- or Node-friendly file upload helpers. For our modest needs — upload
 * a short screen recording, poll until `ACTIVE`, hand the URI back to Gemini —
 * a direct `fetch` is both simpler and easier to mock in tests.
 *
 * Files API endpoint reference:
 *   - POST https://generativelanguage.googleapis.com/upload/v1beta/files
 *     (resumable multipart start + upload in a single call with header
 *      `X-Goog-Upload-Protocol: multipart`)
 *   - GET  https://generativelanguage.googleapis.com/v1beta/{name}
 *
 * Files are retained for ~48 hours, then auto-expire. A stale `fileUri`
 * should be treated as a recoverable 404 by callers.
 */

import {
  FEEDBACK_ASSIST_IMAGE_MAX_BYTES,
  FEEDBACK_ASSIST_IMAGE_MIME_ALLOWLIST,
  FEEDBACK_ASSIST_VIDEO_MAX_BYTES,
  FEEDBACK_ASSIST_VIDEO_MIME_ALLOWLIST,
  type FeedbackAssistImageMime,
  type FeedbackAssistVideoMime,
} from "./types";

const FILES_API_BASE = "https://generativelanguage.googleapis.com";

/**
 * Result of a successful upload — safe to hand back to a client and to
 * persist verbatim inside `aiAssistMetadata.videoRef`.
 */
export interface UploadedFileRef {
  /** Fully-qualified file URI Gemini accepts in `fileData.fileUri`. */
  fileUri: string;
  /** Short file name returned by the API, e.g. `files/abc123`. */
  name: string;
  /** Mirrors the request — kept for auditing. */
  mimeType: string;
  /** ISO datetime when the file expires on Google's side. */
  expiresAt: string;
}

export interface UploadFeedbackFileOptions {
  /** Max total wait in ms for the file to become ACTIVE. */
  pollTimeoutMs?: number;
  /** Interval between poll calls in ms. */
  pollIntervalMs?: number;
  /** Injected fetch implementation for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_POLL_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;

function assertApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

/**
 * Normalize a MIME string by stripping codec/charset parameters and
 * lower-casing the result. Browsers commonly emit values like
 * `video/webm;codecs=vp9,opus` from `MediaRecorder` — we want to compare
 * against the bare type.
 */
function normalizeMime(value: string): string {
  return (value.split(";")[0] ?? "").trim().toLowerCase();
}

function isAllowedVideoMime(value: string): value is FeedbackAssistVideoMime {
  return (FEEDBACK_ASSIST_VIDEO_MIME_ALLOWLIST as readonly string[]).includes(
    normalizeMime(value),
  );
}

function isAllowedImageMime(value: string): value is FeedbackAssistImageMime {
  return (FEEDBACK_ASSIST_IMAGE_MIME_ALLOWLIST as readonly string[]).includes(
    normalizeMime(value),
  );
}

interface UploadConstraints {
  maxBytes: number;
  allowMime: (rawType: string) => boolean;
  mediaLabel: "video" | "image";
  displayNamePrefix: "feedback-recording" | "feedback-screenshot";
}

/**
 * Upload a blob to the Gemini Files API and wait until processing completes.
 * Shared by {@link uploadVideoForFeedback} and {@link uploadImageForFeedback}.
 */
async function uploadBlobForFeedback(
  blob: Blob,
  constraints: UploadConstraints,
  options: UploadFeedbackFileOptions = {},
): Promise<UploadedFileRef> {
  const apiKey = assertApiKey();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const pollTimeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  if (!constraints.allowMime(blob.type)) {
    throw new Error(
      `Unsupported ${constraints.mediaLabel} MIME type: ${blob.type || "(none)"}`,
    );
  }
  if (blob.size <= 0) {
    throw new Error(`${constraints.mediaLabel} blob is empty`);
  }
  if (blob.size > constraints.maxBytes) {
    throw new Error(
      `${constraints.mediaLabel} blob exceeds max size of ${constraints.maxBytes} bytes`,
    );
  }

  const form = new FormData();
  const metadata = JSON.stringify({
    file: { displayName: `${constraints.displayNamePrefix}-${Date.now()}` },
  });
  form.append(
    "metadata",
    new Blob([metadata], { type: "application/json" }),
  );
  form.append("file", blob);

  const uploadRes = await fetchImpl(
    `${FILES_API_BASE}/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "X-Goog-Upload-Protocol": "multipart" },
      body: form,
    },
  );

  if (!uploadRes.ok) {
    const body = await safeReadText(uploadRes);
    throw new Error(
      `Files API upload failed: ${uploadRes.status} ${body.slice(0, 300)}`,
    );
  }

  const uploadJson = (await uploadRes.json()) as UploadResponse;
  const file = uploadJson.file;
  if (!file?.name || !file.uri) {
    throw new Error("Files API upload returned an incomplete file record");
  }

  const active = await pollUntilActive(file, {
    apiKey,
    fetchImpl,
    pollTimeoutMs,
    pollIntervalMs,
  });

  console.log(`[gemini-files] uploaded ${constraints.mediaLabel} ready:`, {
    name: active.name,
    uri: active.uri,
    storedMime: active.mimeType,
    state: active.state,
    blobType: blob.type,
    blobSize: blob.size,
    expirationTime: active.expirationTime,
  });

  const mimeType = active.mimeType ?? blob.type;

  return {
    fileUri: active.uri,
    name: active.name,
    mimeType,
    expiresAt: active.expirationTime ?? defaultExpiresAt(),
  };
}

/**
 * Upload a screen-recording blob to the Gemini Files API and wait until
 * Gemini finishes processing it. Returns a reference safe to forward to
 * `generateContent` via `fileData`.
 *
 * Throws for:
 * - Unsupported MIME types
 * - Blobs over the configured size cap
 * - Upload errors (non-2xx response)
 * - Polling timeouts — the file never reaches ACTIVE within `pollTimeoutMs`
 * - Processing failures (`state: FAILED`)
 */
export async function uploadVideoForFeedback(
  blob: Blob,
  options: UploadFeedbackFileOptions = {},
): Promise<UploadedFileRef> {
  return uploadBlobForFeedback(
    blob,
    {
      maxBytes: FEEDBACK_ASSIST_VIDEO_MAX_BYTES,
      allowMime: isAllowedVideoMime,
      mediaLabel: "video",
      displayNamePrefix: "feedback-recording",
    },
    options,
  );
}

/**
 * Upload a screenshot image to the Gemini Files API for vision-grounded
 * feedback assist. Same semantics as {@link uploadVideoForFeedback}.
 */
export async function uploadImageForFeedback(
  blob: Blob,
  options: UploadFeedbackFileOptions = {},
): Promise<UploadedFileRef> {
  return uploadBlobForFeedback(
    blob,
    {
      maxBytes: FEEDBACK_ASSIST_IMAGE_MAX_BYTES,
      allowMime: isAllowedImageMime,
      mediaLabel: "image",
      displayNamePrefix: "feedback-screenshot",
    },
    options,
  );
}

interface GeminiFileRecord {
  name: string;
  uri: string;
  mimeType?: string;
  state?: "STATE_UNSPECIFIED" | "PROCESSING" | "ACTIVE" | "FAILED";
  expirationTime?: string;
  error?: { message?: string } | null;
}

interface UploadResponse {
  file?: GeminiFileRecord;
}

async function pollUntilActive(
  file: GeminiFileRecord,
  opts: {
    apiKey: string;
    fetchImpl: typeof fetch;
    pollTimeoutMs: number;
    pollIntervalMs: number;
  },
): Promise<GeminiFileRecord> {
  if (file.state === "ACTIVE") return file;
  const started = Date.now();

  // Guard against absurdly short timeouts — always make at least one GET.
  while (true) {
    const res = await opts.fetchImpl(
      `${FILES_API_BASE}/v1beta/${file.name}?key=${encodeURIComponent(opts.apiKey)}`,
      { method: "GET" },
    );
    if (!res.ok) {
      const body = await safeReadText(res);
      throw new Error(
        `Files API poll failed: ${res.status} ${body.slice(0, 300)}`,
      );
    }
    const current = (await res.json()) as GeminiFileRecord;
    if (current.state === "ACTIVE") return current;
    if (current.state === "FAILED") {
      const msg = current.error?.message ?? "Files API marked file FAILED";
      throw new Error(msg);
    }

    const elapsed = Date.now() - started;
    if (elapsed + opts.pollIntervalMs > opts.pollTimeoutMs) {
      throw new Error(
        `Files API did not reach ACTIVE within ${opts.pollTimeoutMs}ms`,
      );
    }
    await sleep(opts.pollIntervalMs);
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultExpiresAt(): string {
  // Fallback when Gemini does not return expirationTime — 48h from now.
  return new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
}

"use client";

import type { ImageAnnotationPayload } from "@/lib/image-annotation-schema";
import { appendCaptureMetadataToForm } from "@/lib/append-field-media-upload";
import { collectCaptureClientMetadata } from "@/lib/capture-client-metadata";
import type {
  CaptureClientMetadata,
  ClientCaptureMethod,
} from "@/lib/media/capture-context-schema";

/**
 * Retry-aware wrapper for POST /api/upload/field-media.
 *
 * Mobile field connections (5G, LTE, on-site Wi-Fi) are lossy. A single
 * transient error would previously cause the upload to silently skip the file.
 * This utility retries up to `maxAttempts` times with exponential backoff
 * before giving up, eliminating the vast majority of transient field failures.
 *
 * Retry policy:
 *  - Network errors (fetch threw)  → retry
 *  - 5xx server errors             → retry
 *  - 4xx client errors (413, 415…) → throw immediately, no retry (permanent)
 */

export interface FieldMediaUploadResult {
  storageKey: string;
  storageUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  /** Echoed from the request when the caller passed a valid imageAnnotation form field. */
  imageAnnotation?: ImageAnnotationPayload;
}

export interface UploadWithRetryOptions {
  /** Maximum number of attempts including the first. Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms before the 2nd attempt. Doubles each retry. Default: 600 */
  initialDelayMs?: number;
  /** When set, sent as FormData `projectId` for rate-limit audit / activity log on 429. */
  projectId?: string;
  /** Client capture metadata collected at pick/capture time (preferred). */
  captureMetadata?: CaptureClientMetadata;
  /** When metadata is missing, collect at upload time using this method (fallback). */
  captureMethod?: ClientCaptureMethod;
}

class PermanentUploadError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PermanentUploadError";
    this.status = status;
  }
}

export async function uploadWithRetry(
  form: FormData,
  options: UploadWithRetryOptions = {},
): Promise<FieldMediaUploadResult> {
  const { maxAttempts = 3, initialDelayMs = 600, projectId, captureMetadata, captureMethod } = options;
  if (projectId && !form.has("projectId")) {
    form.append("projectId", projectId);
  }

  if (!form.has("captureMetadata")) {
    const meta =
      captureMetadata ?? (await collectCaptureClientMetadata(captureMethod ?? "file_drop"));
    appendCaptureMetadataToForm(form, meta, projectId);
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch("/api/upload/field-media", {
        method: "POST",
        body: form,
      });

      if (res.ok) {
        return (await res.json()) as FieldMediaUploadResult;
      }

      // 4xx = client error (bad mime, file too large, etc.) — don't retry
      if (res.status >= 400 && res.status < 500) {
        const errText = await res.text().catch(() => String(res.status));
        throw new PermanentUploadError(res.status, `HTTP ${res.status}: ${errText}`);
      }

      // 5xx — transient server/gateway error, record and retry
      const errText = await res.text().catch(() => String(res.status));
      lastError = new Error(`HTTP ${res.status}: ${errText}`);
      console.warn(`[uploadWithRetry] attempt ${attempt}/${maxAttempts} — server error ${res.status}. ${attempt < maxAttempts ? "Retrying…" : "Giving up."}`);
    } catch (err) {
      if (err instanceof PermanentUploadError) throw err;
      lastError = err;
      console.warn(`[uploadWithRetry] attempt ${attempt}/${maxAttempts} — network error: ${String(err)}. ${attempt < maxAttempts ? "Retrying…" : "Giving up."}`);
    }

    if (attempt < maxAttempts) {
      const delay = initialDelayMs * 2 ** (attempt - 1); // 600 → 1200 → 2400
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error("Upload failed after retries");
}

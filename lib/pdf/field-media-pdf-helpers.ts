import "server-only";

import { fetchImageAsBase64ForPdf, type PdfImageFetchContext } from "@/lib/pdf/fetch-image-for-pdf";
import {
  fetchFieldMediaImageAsBase64,
  type FieldMediaReference,
} from "@/lib/field-media-resolve";

export function mediaCacheKey(ref: FieldMediaReference): string {
  return ref.storageKey ?? ref.storageUrl;
}

export function toMediaRef(
  a: { storageUrl: string; storageKey?: string | null; mimeType: string },
): FieldMediaReference {
  return {
    storageUrl: a.storageUrl,
    storageKey: a.storageKey,
    mimeType: a.mimeType,
  };
}

export async function fetchPdfImageRef(
  ref: FieldMediaReference,
  pdfImageFetch?: PdfImageFetchContext,
): Promise<string | null> {
  const fromKey = await fetchFieldMediaImageAsBase64(ref, {
    appOrigin: pdfImageFetch?.appOrigin,
  });
  if (fromKey) return fromKey;
  if (!pdfImageFetch) return null;
  return fetchImageAsBase64ForPdf(ref.storageUrl, pdfImageFetch);
}

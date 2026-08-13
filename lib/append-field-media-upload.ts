import type { CaptureClientMetadata } from "@/lib/media/capture-context-schema";

export interface BuildFieldMediaFormDataInput {
  file: File | Blob;
  fileName?: string;
  type: string;
  projectId?: string;
  captureMetadata?: CaptureClientMetadata;
  caption?: string;
  imageAnnotation?: unknown;
  issueCommentId?: string;
  observationCommentId?: string;
}

/** Standard FormData for POST /api/upload/field-media. */
export function buildFieldMediaFormData(input: BuildFieldMediaFormDataInput): FormData {
  const form = new FormData();
  const name = input.fileName ?? (input.file instanceof File ? input.file.name : "upload.bin");
  form.append("file", input.file, name);
  form.append("type", input.type);
  if (input.projectId) form.append("projectId", input.projectId);
  if (input.captureMetadata) {
    form.append("captureMetadata", JSON.stringify(input.captureMetadata));
  }
  if (input.caption) form.append("caption", input.caption);
  if (input.imageAnnotation != null) {
    form.append("imageAnnotation", JSON.stringify(input.imageAnnotation));
  }
  if (input.issueCommentId) form.append("issueCommentId", input.issueCommentId);
  if (input.observationCommentId) form.append("observationCommentId", input.observationCommentId);
  return form;
}

/** Append capture metadata to an existing FormData (e.g. built by caller). */
export function appendCaptureMetadataToForm(
  form: FormData,
  captureMetadata: CaptureClientMetadata,
  projectId?: string,
): void {
  form.append("captureMetadata", JSON.stringify(captureMetadata));
  if (projectId && !form.has("projectId")) {
    form.append("projectId", projectId);
  }
}

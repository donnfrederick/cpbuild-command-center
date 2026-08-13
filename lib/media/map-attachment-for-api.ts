import type { MediaCaptureContext } from "@prisma/client";
import {
  serializeCaptureContext,
  type SerializedCaptureContext,
} from "@/lib/media/serialize-capture-context";

type AttachmentWithOptionalContext = {
  captureContext?: MediaCaptureContext | null;
};

/** Map a Prisma attachment row to API JSON (serializes nested captureContext when present). */
export function mapMediaAttachmentForApi<T extends AttachmentWithOptionalContext>(
  attachment: T,
): Omit<T, "captureContext"> & { captureContext?: SerializedCaptureContext } {
  const { captureContext, ...rest } = attachment;
  if (!captureContext) {
    return rest as Omit<T, "captureContext"> & { captureContext?: SerializedCaptureContext };
  }
  return {
    ...rest,
    captureContext: serializeCaptureContext(captureContext),
  };
}

export function mapMediaAttachmentsForApi<T extends AttachmentWithOptionalContext>(
  attachments: T[],
): Array<Omit<T, "captureContext"> & { captureContext?: SerializedCaptureContext }> {
  return attachments.map(mapMediaAttachmentForApi);
}

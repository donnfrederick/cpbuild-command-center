import { z } from "zod";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";

/** JSON.stringify turns `undefined` array slots into `null` — accept both for field uploads. */
export const attachmentFileSizeBytesSchema = z
  .array(z.union([z.number().min(0), z.null()]))
  .max(MAX_MEDIA_ATTACHMENTS_PER_ENTITY)
  .default([]);

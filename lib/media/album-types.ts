import type { SerializedCaptureContext } from "@/lib/media/serialize-capture-context";

export type AlbumSourceType =
  | "observation"
  | "observation_comment"
  | "issue"
  | "issue_comment"
  | "inspection"
  | "general"
  | "status_update";

export interface AlbumItemSource {
  type: AlbumSourceType;
  label: string | null;
  entityId: string | null;
  scopeCodes?: string[];
}

export interface AlbumItem {
  id: string;
  storageUrl: string;
  mimeType: string;
  fileSizeBytes: number | null;
  caption: string | null;
  createdAt: string;
  source: AlbumItemSource;
  /** Present when the underlying MediaAttachment has capture metadata. */
  captureContext?: SerializedCaptureContext;
}

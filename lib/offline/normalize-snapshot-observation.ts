import type { ObsSummary } from "@/components/projects/UnitCards";

/** Shape stored in offline-data-v1 (legacy rows may omit author.id). */
export interface SnapshotObservationRow {
  id: string;
  projectId?: string;
  title?: string;
  description?: string;
  observationType?: string;
  unitRef?: string | null;
  createdAt?: string;
  authorName?: string | null;
  authorId?: string | null;
  authorEmail?: string | null;
  author?: { id: string; name: string | null; email: string };
  scopeTags?: ObsSummary["scopeTags"];
  attachments?: Array<{
    id: string;
    storageUrl: string;
    mimeType: string;
    storageKey?: string;
    fileSizeBytes?: number | null;
  }>;
  _count?: { comments: number };
  _pendingSync?: boolean;
}

export function normalizeSnapshotObservation(row: SnapshotObservationRow): ObsSummary {
  const author = row.author ?? {
    id: row.authorId ?? "",
    name: row.authorName ?? null,
    email: row.authorEmail ?? "",
  };

  return {
    id: row.id,
    observationType: row.observationType ?? "OTHER",
    title: row.title ?? "",
    description: row.description ?? "",
    createdAt: row.createdAt ?? new Date().toISOString(),
    unitRef: row.unitRef,
    author,
    scopeTags: row.scopeTags ?? [],
    attachments: (row.attachments ?? []).map((a) => ({
      id: a.id,
      storageKey: a.storageKey ?? "",
      storageUrl: a.storageUrl,
      mimeType: a.mimeType,
      fileSizeBytes: a.fileSizeBytes ?? null,
    })),
    _count: row._count ?? { comments: 0 },
    _pendingSync: row._pendingSync === true,
  };
}

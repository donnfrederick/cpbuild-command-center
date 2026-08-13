import type { UnlinkedScopeType } from "@/lib/project-rows";

/** Rows per POST when appending large uploads — keeps requests under timeout and enables progress UI. */
export const APPEND_ROWS_BATCH_SIZE = 100;

/** bulk-delete accepts at most 500 row IDs per request. */
export const REVERT_ROWS_BATCH_SIZE = 500;

export type AppendRowsProgressPhase = "creating" | "uploading" | "cancelling" | "refreshing";

export interface AppendRowsProgress {
  phase: AppendRowsProgressPhase;
  /** Rows processed in the upload phase (0..total). */
  completed: number;
  total: number;
}

export interface AppendProjectRowsResult {
  added: number;
  skipped: number;
  addedRowIds: string[];
  unlinkedScopeTypes: UnlinkedScopeType[];
}

export class AppendRowsCancelledError extends Error {
  readonly added: number;
  readonly skipped: number;
  readonly addedRowIds: string[];
  readonly unlinkedScopeTypes: UnlinkedScopeType[];

  constructor(partial: AppendProjectRowsResult) {
    super("Append upload cancelled");
    this.name = "AppendRowsCancelledError";
    this.added = partial.added;
    this.skipped = partial.skipped;
    this.addedRowIds = partial.addedRowIds;
    this.unlinkedScopeTypes = partial.unlinkedScopeTypes;
  }
}

function mergeUnlinkedScopeTypes(
  target: Map<string, UnlinkedScopeType>,
  items: UnlinkedScopeType[] | undefined,
): void {
  for (const u of items ?? []) {
    target.set(u.rawCode, u);
  }
}

export async function appendProjectRowsInBatches(options: {
  projectId: string;
  rows: Record<string, string>[];
  source: "upload" | "paste";
  batchSize?: number;
  onProgress?: (progress: AppendRowsProgress) => void;
  isCancelled?: () => boolean;
}): Promise<AppendProjectRowsResult> {
  const { projectId, rows, source, batchSize = APPEND_ROWS_BATCH_SIZE, onProgress, isCancelled } = options;
  const total = rows.length;
  let added = 0;
  let skipped = 0;
  const addedRowIds: string[] = [];
  const unlinkedByCode = new Map<string, UnlinkedScopeType>();

  const snapshot = (): AppendProjectRowsResult => ({
    added,
    skipped,
    addedRowIds: [...addedRowIds],
    unlinkedScopeTypes: [...unlinkedByCode.values()],
  });

  const throwIfCancelled = () => {
    if (isCancelled?.()) {
      throw new AppendRowsCancelledError(snapshot());
    }
  };

  onProgress?.({ phase: "uploading", completed: 0, total });

  for (let i = 0; i < rows.length; i += batchSize) {
    throwIfCancelled();

    const chunk = rows.slice(i, i + batchSize);
    const res = await fetch(`/api/projects/${projectId}/units`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: chunk, mode: "add", source }),
    });
    const data = (await res.json()) as {
      added: number;
      skipped: number;
      addedRowIds?: string[];
      error?: string;
      unlinkedScopeTypes?: UnlinkedScopeType[];
    };
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to add rows");
    }
    added += data.added;
    skipped += data.skipped;
    addedRowIds.push(...(data.addedRowIds ?? []));
    mergeUnlinkedScopeTypes(unlinkedByCode, data.unlinkedScopeTypes);
    onProgress?.({
      phase: "uploading",
      completed: Math.min(i + chunk.length, total),
      total,
    });
    throwIfCancelled();
  }

  return snapshot();
}

export async function revertAppendedRowsInBatches(
  projectId: string,
  rowIds: string[],
  batchSize = REVERT_ROWS_BATCH_SIZE,
): Promise<number> {
  if (rowIds.length === 0) return 0;

  let deleted = 0;
  for (let i = 0; i < rowIds.length; i += batchSize) {
    const chunk = rowIds.slice(i, i + batchSize);
    const res = await fetch(`/api/projects/${projectId}/units/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowIds: chunk }),
    });
    const data = (await res.json()) as { deleted?: number; error?: string };
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to revert uploaded rows");
    }
    deleted += data.deleted ?? 0;
  }
  return deleted;
}

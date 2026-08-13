import type { Project } from "@/lib/projects";
import type { UnlinkedScopeType } from "@/lib/project-rows";
import {
  appendProjectRowsInBatches,
  AppendRowsCancelledError,
  revertAppendedRowsInBatches,
  type AppendProjectRowsResult,
  type AppendRowsProgress,
} from "@/lib/field-tracker-append-rows";

export interface CreateProjectWithUpmResult extends AppendProjectRowsResult {
  project: Project & { restored?: boolean };
}

export class CreateProjectCancelledError extends Error {
  readonly project: Project & { restored?: boolean };
  readonly added: number;
  readonly skipped: number;
  readonly addedRowIds: string[];
  readonly unlinkedScopeTypes: UnlinkedScopeType[];

  constructor(project: Project & { restored?: boolean }, partial: AppendProjectRowsResult) {
    super("Create project cancelled");
    this.name = "CreateProjectCancelledError";
    this.project = project;
    this.added = partial.added;
    this.skipped = partial.skipped;
    this.addedRowIds = partial.addedRowIds;
    this.unlinkedScopeTypes = partial.unlinkedScopeTypes;
  }
}

export async function createProjectWithUpmRows(options: {
  unifierPid: string;
  rows: Record<string, string>[];
  source: "upload" | "paste";
  onProgress?: (progress: AppendRowsProgress) => void;
  isCancelled?: () => boolean;
}): Promise<CreateProjectWithUpmResult> {
  const { unifierPid, rows, source, onProgress, isCancelled } = options;

  onProgress?.({ phase: "creating", completed: 0, total: rows.length });

  const createRes = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unifierPid }),
  });
  const createBody = (await createRes.json()) as (Project & { restored?: boolean; error?: string; detail?: string });
  if (!createRes.ok) {
    const msg = createBody.detail
      ? `${createBody.error ?? "Failed"}: ${createBody.detail}`
      : (createBody.error ?? `Failed to create project (${createRes.status})`);
    throw new Error(msg);
  }

  const project = createBody;

  if (isCancelled?.()) {
    throw new CreateProjectCancelledError(project, {
      added: 0,
      skipped: 0,
      addedRowIds: [],
      unlinkedScopeTypes: [],
    });
  }

  try {
    const appendResult = await appendProjectRowsInBatches({
      projectId: project.id,
      rows,
      source,
      onProgress,
      isCancelled,
    });
    return { project, ...appendResult };
  } catch (err) {
    if (err instanceof AppendRowsCancelledError) {
      throw new CreateProjectCancelledError(project, {
        added: err.added,
        skipped: err.skipped,
        addedRowIds: err.addedRowIds,
        unlinkedScopeTypes: err.unlinkedScopeTypes,
      });
    }
    throw err;
  }
}

/** Removes uploaded rows and soft-deletes the project created/restored in this session. */
export async function revertCreateProjectAttempt(projectId: string, addedRowIds: string[]): Promise<void> {
  if (addedRowIds.length > 0) {
    await revertAppendedRowsInBatches(projectId, addedRowIds);
  }
  const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Failed to remove project after cancel");
  }
}

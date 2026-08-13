/**
 * snapshot-patch — write-through from the mutation queue into the offline snapshot.
 *
 * When a mutation is enqueued while offline, this module immediately updates the
 * cached snapshot in Cache Storage (offline-data-v1) so the UI reflects the
 * change without waiting for a resync. Items patched this way carry a
 * `_pendingSync: true` marker that components use to show a "pending" indicator.
 *
 * The patch is non-destructive: when the snapshot is refreshed on reconnect,
 * the server returns clean data without `_pendingSync`, naturally clearing
 * the indicator.
 *
 * Supported mutation types:
 *   - "unit-status"        → merges body fields into the matching unit row
 *   - "create-issue"       → appends a new optimistic issue to data.issues
 *   - "create-observation" → appends a new optimistic observation to data.observations
 *   - "update-observation" → merges PATCH body into an existing observation
 *   - "add-comment"        → no-op (comments are not stored in the snapshot)
 *   - "create-custom-site-location" → appends to data["custom-site-locations"][projectId]
 *   - "create-project-note"       → prepends optimistic note to data["project-notes"][projectId]
 *   - "edit-project-note"         → merges body into existing project note
 *   - "delete-project-note"       → removes note from data["project-notes"][projectId]
 *   - "pin-project-note"          → toggles pinnedAt on existing project note
 */

import type { ProjectNoteDto } from "@/lib/project-notes/types";
import { sortProjectNotesForDisplay } from "@/lib/project-notes/sort-notes";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";
import { customSiteUnitRef } from "@/lib/custom-site-locations";
import type { QueuedMutation } from "@/lib/offline/mutation-queue";

const CACHE_NAME = "offline-data-v1";
const SNAPSHOT_URL_FRAGMENT = "/api/offline/snapshot";

function scopeTagsFromRowIds(rowIds: string[]): Array<{ row: { id: string; scopeType: { name: string } | null } }> {
  return rowIds.map((id) => ({ row: { id, scopeType: null } }));
}

function observationIdFromUrl(url: string): string | null {
  const match = /\/observations\/([^/?]+)/.exec(url);
  return match?.[1] ?? null;
}

function projectNoteIdFromUrl(url: string): string | null {
  const match = /\/notes\/([^/?]+)/.exec(url);
  return match?.[1] ?? null;
}

function readProjectNotesModule(data: SnapshotData, projectId: string): ProjectNoteDto[] {
  const notesByProject = (data["project-notes"] ?? {}) as Record<string, ProjectNoteDto[]>;
  return notesByProject[projectId] ?? [];
}

function writeProjectNotesModule(
  data: SnapshotData,
  projectId: string,
  notes: ProjectNoteDto[],
): void {
  const notesByProject = (data["project-notes"] ?? {}) as Record<string, ProjectNoteDto[]>;
  data["project-notes"] = {
    ...notesByProject,
    [projectId]: sortProjectNotesForDisplay(notes),
  };
}

export async function patchProjectNotePinInSnapshot(
  projectId: string,
  noteId: string,
  pinned: boolean,
): Promise<void> {
  const lookup = await loadSnapshotForProject(projectId);
  if (!lookup) return;
  const data: SnapshotData = { ...(lookup.snapshot.data ?? {}) };
  const notes = readProjectNotesModule(data, projectId);
  const idx = notes.findIndex((n) => n.id === noteId);
  if (idx < 0) return;
  notes[idx] = {
    ...notes[idx],
    pinnedAt: pinned ? new Date().toISOString() : null,
    _pendingSync: true,
  };
  writeProjectNotesModule(data, projectId, notes);
  await writeSnapshot(lookup, data);
}

export async function patchProjectNoteBodyInSnapshot(
  projectId: string,
  noteId: string,
  body: string,
): Promise<void> {
  const lookup = await loadSnapshotForProject(projectId);
  if (!lookup) return;
  const data: SnapshotData = { ...(lookup.snapshot.data ?? {}) };
  const notes = readProjectNotesModule(data, projectId);
  const idx = notes.findIndex((n) => n.id === noteId);
  if (idx < 0) return;
  notes[idx] = {
    ...notes[idx],
    body,
    editedAt: new Date().toISOString(),
    _pendingSync: true,
  };
  writeProjectNotesModule(data, projectId, notes);
  await writeSnapshot(lookup, data);
}

export async function removeProjectNoteFromSnapshot(
  projectId: string,
  noteId: string,
): Promise<void> {
  const lookup = await loadSnapshotForProject(projectId);
  if (!lookup) return;
  const data: SnapshotData = { ...(lookup.snapshot.data ?? {}) };
  const notes = readProjectNotesModule(data, projectId).filter((n) => n.id !== noteId);
  writeProjectNotesModule(data, projectId, notes);
  await writeSnapshot(lookup, data);
}

// ─── Shape helpers ────────────────────────────────────────────────────────────

interface SnapshotUnit extends Record<string, unknown> {
  id: string;
}

interface SnapshotIssue extends Record<string, unknown> {
  id: string;
  projectId: string;
  _pendingSync?: boolean;
}

interface SnapshotObservation extends Record<string, unknown> {
  id: string;
  projectId: string;
  _pendingSync?: boolean;
}

interface SnapshotData {
  units?: SnapshotUnit[];
  issues?: SnapshotIssue[];
  observations?: SnapshotObservation[];
  [key: string]: unknown;
}

interface Snapshot {
  data?: SnapshotData;
  [key: string]: unknown;
}

/** Extract the project ID from an API URL like /api/projects/{id}/issues */
function extractProjectId(url: string): string {
  const match = /\/projects\/([^/]+)/.exec(url);
  return match?.[1] ?? "";
}

/** Extract the last path segment (e.g. rowId from .../units/:rowId) */
function lastSegment(url: string): string {
  return url.split("/").filter(Boolean).at(-1) ?? "";
}

interface SnapshotLookup {
  snapshotKey: Request;
  snapshot: Snapshot;
}

async function loadSnapshotForProject(projectId: string): Promise<SnapshotLookup | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;

  let cache: Cache;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    return null;
  }

  const keys = await cache.keys();
  const candidates = keys.filter((k) => k.url.includes(SNAPSHOT_URL_FRAGMENT));
  if (candidates.length === 0) return null;

  let snapshotKey: Request | undefined;
  let snapshot: Snapshot | undefined;

  for (const key of candidates) {
    const res = await cache.match(key);
    if (!res) continue;
    let parsed: Snapshot;
    try {
      parsed = (await res.json()) as Snapshot;
    } catch {
      continue;
    }
    const hasProject =
      (parsed.data?.units as Array<{ projectId?: string }> | undefined)?.some((u) => u.projectId === projectId) ||
      (parsed.data?.issues as Array<{ projectId?: string }> | undefined)?.some((i) => i.projectId === projectId) ||
      (parsed.data?.observations as Array<{ projectId?: string }> | undefined)?.some((o) => o.projectId === projectId) ||
      (
        parsed.data?.["custom-site-locations"] as Record<string, unknown[]> | undefined
      )?.[projectId]?.length !== undefined ||
      (
        parsed.data?.["project-notes"] as Record<string, unknown[]> | undefined
      )?.[projectId]?.length !== undefined ||
      key.url.includes(projectId);
    if (hasProject) {
      snapshotKey = key;
      snapshot = parsed;
      break;
    }
  }

  if (!snapshotKey) {
    snapshotKey = candidates[0];
    const res = await cache.match(snapshotKey);
    if (!res) return null;
    try {
      snapshot = (await res.json()) as Snapshot;
    } catch {
      return null;
    }
  }

  if (!snapshot) return null;
  return { snapshotKey, snapshot };
}

async function writeSnapshot(lookup: SnapshotLookup, data: SnapshotData): Promise<void> {
  const patchedSnapshot: Snapshot = { ...lookup.snapshot, data };
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      lookup.snapshotKey,
      new Response(JSON.stringify(patchedSnapshot), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch {
    // non-critical
  }
}

function mergeObservationPatch(
  obs: SnapshotObservation,
  body: Record<string, unknown>,
): SnapshotObservation {
  const next: SnapshotObservation = { ...obs, _pendingSync: true };
  if (body.title !== undefined) next.title = body.title as string;
  if (body.description !== undefined) next.description = body.description as string;
  if (body.observationType !== undefined) next.observationType = body.observationType as string;
  if (Array.isArray(body.scopeTagIds)) {
    next.scopeTags = scopeTagsFromRowIds(body.scopeTagIds as string[]);
  }
  if (Array.isArray(body.projectRowIds)) {
    next.scopeTags = scopeTagsFromRowIds(body.projectRowIds as string[]);
  }
  const removeIds = body.removeAttachmentIds as string[] | undefined;
  if (removeIds?.length) {
    const attachments = (next.attachments as Array<{ id: string }> | undefined) ?? [];
    next.attachments = attachments.filter((a) => !removeIds.includes(a.id));
  }
  return next;
}

/** In-place snapshot update for a single observation (pending create revise or UI refresh). */
export async function patchObservationInSnapshot(
  projectId: string,
  observationId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const lookup = await loadSnapshotForProject(projectId);
  if (!lookup) return;

  const data: SnapshotData = { ...(lookup.snapshot.data ?? {}) };
  const observations = (data.observations ?? []) as SnapshotObservation[];
  const idx = observations.findIndex((o) => o.id === observationId);
  if (idx < 0) return;

  observations[idx] = mergeObservationPatch(observations[idx], body);
  data.observations = observations;
  await writeSnapshot(lookup, data);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Patch the cached offline snapshot to reflect a queued mutation immediately.
 * Fire-and-forget: callers should catch errors and ignore them — this is a
 * best-effort UX enhancement and must never block the enqueue path.
 */
export async function patchOfflineSnapshot(
  mutation: QueuedMutation,
): Promise<void> {
  const projectId = extractProjectId(mutation.url);
  const lookup = await loadSnapshotForProject(projectId);
  if (!lookup) return;

  const { snapshotKey, snapshot } = lookup;
  void snapshotKey;

  const data: SnapshotData = { ...(snapshot.data ?? {}) };
  let patched = false;

  if (mutation.type === "unit-status") {
    const rowId = lastSegment(mutation.url);
    const units = (data.units ?? []).map((u) => {
      if (u.id !== rowId) return u;
      return {
        ...u,
        ...(typeof mutation.body === "object" && mutation.body !== null
          ? (mutation.body as Record<string, unknown>)
          : {}),
        _pendingSync: true,
      };
    });
    if (units !== data.units) patched = true;
    data.units = units;
    // Mark patched if the unit was found (length unchanged but values differ)
    patched = data.units.some((u) => u.id === rowId && u._pendingSync === true);
  } else if (mutation.type === "create-issue") {
    const body =
      typeof mutation.body === "object" && mutation.body !== null
        ? (mutation.body as Record<string, unknown>)
        : {};
    const newIssue: SnapshotIssue = {
      id: mutation.id,
      projectId: extractProjectId(mutation.url),
      shortDescription: body.shortDescription ?? "",
      issueType: body.issueType ?? "",
      status: body.status ?? "OPEN",
      isBlockingWork: body.isBlockingWork ?? false,
      unitRef: body.unitRef ?? null,
      responsibleParty: body.responsibleParty ?? "",
      responsibleParties: Array.isArray(body.responsibleParties)
        ? (body.responsibleParties as string[])
        : body.responsibleParty
          ? [String(body.responsibleParty)]
          : [],
      notes: null,
      resolvedAt: null,
      resolutionNote: null,
      bulkGroupId: null,
      bulkGroupCount: null,
      missingMaterialDescription: body.missingMaterialDescription ?? null,
      missingMaterialQuantity: body.missingMaterialQuantity ?? null,
      missingMaterialUomCode: body.missingMaterialUomCode ?? null,
      createdAt: new Date(mutation.queuedAt).toISOString(),
      // Typed as expected by IssueCard / IssuesLogClient
      createdBy: { id: "", name: null, email: "" },
      resolvedBy: null,
      attachments: [],
      scopeTags: [],
      subScopeTags: [],
      _count: { comments: 0 },
      _pendingSync: true,
    };
    data.issues = [...(data.issues ?? []), newIssue];
    patched = true;
  } else if (mutation.type === "create-observation") {
    const body =
      typeof mutation.body === "object" && mutation.body !== null
        ? (mutation.body as Record<string, unknown>)
        : {};
    const rowIds = Array.isArray(body.projectRowIds) ? (body.projectRowIds as string[]) : [];
    const authorId = mutation.actorUserId ?? "";
    const observations = [...(data.observations ?? [])] as SnapshotObservation[];
    const existingIdx = observations.findIndex((o) => o.id === mutation.id);
    const obsPayload: SnapshotObservation = {
      id: mutation.id,
      projectId: extractProjectId(mutation.url),
      title: body.title ?? "",
      description: body.description ?? "",
      observationType: body.observationType ?? "",
      unitRef: body.unitRef ?? null,
      notes: null,
      createdAt: new Date(mutation.queuedAt).toISOString(),
      author: { id: authorId, name: null, email: "" },
      attachments: existingIdx >= 0 ? (observations[existingIdx].attachments ?? []) : [],
      scopeTags: scopeTagsFromRowIds(rowIds),
      _count: { comments: 0 },
      _pendingSync: true,
    };
    if (existingIdx >= 0) {
      observations[existingIdx] = { ...observations[existingIdx], ...obsPayload };
    } else {
      observations.push(obsPayload);
    }
    data.observations = observations;
    patched = true;
  } else if (mutation.type === "update-observation") {
    const obsId = observationIdFromUrl(mutation.url);
    if (!obsId) return;
    const body =
      typeof mutation.body === "object" && mutation.body !== null
        ? (mutation.body as Record<string, unknown>)
        : {};
    const observations = (data.observations ?? []) as SnapshotObservation[];
    const idx = observations.findIndex((o) => o.id === obsId);
    if (idx >= 0) {
      observations[idx] = mergeObservationPatch(observations[idx], body);
      data.observations = observations;
      patched = true;
    }
  } else if (mutation.type === "create-custom-site-location") {
    const body =
      typeof mutation.body === "object" && mutation.body !== null
        ? (mutation.body as Record<string, unknown>)
        : {};
    const name = String(body.name ?? "").trim();
    const placement = String(body.placement ?? "standalone") as CustomSiteLocation["placement"];
    const building = String(body.building ?? "");
    const level = String(body.level ?? "");
    const cslModule = (data["custom-site-locations"] ?? {}) as Record<string, CustomSiteLocation[]>;
    const existing = cslModule[projectId] ?? [];
    const optimistic: CustomSiteLocation = {
      id: mutation.id,
      projectId,
      name,
      building,
      level,
      placement,
      sortOrder: existing.length,
      createdAt: new Date(mutation.queuedAt).toISOString(),
      updatedAt: new Date(mutation.queuedAt).toISOString(),
      createdBy: { id: mutation.actorUserId ?? "", name: null },
      unitRef: customSiteUnitRef({ id: mutation.id, name }),
      observationCount: 0,
      issueCount: 0,
    };
    data["custom-site-locations"] = {
      ...cslModule,
      [projectId]: [...existing, optimistic],
    };
    patched = true;
  } else if (mutation.type === "create-project-note") {
    const body =
      typeof mutation.body === "object" && mutation.body !== null
        ? (mutation.body as Record<string, unknown>)
        : {};
    const authorId = mutation.actorUserId ?? "";
    const notes = readProjectNotesModule(data, projectId);
    const optimistic: ProjectNoteDto = {
      id: mutation.id,
      body: String(body.body ?? ""),
      author: { id: authorId, name: null, email: "" },
      createdAt: new Date(mutation.queuedAt).toISOString(),
      editedAt: null,
      pinnedAt: null,
      _pendingSync: true,
    };
    writeProjectNotesModule(data, projectId, [optimistic, ...notes.filter((n) => n.id !== mutation.id)]);
    patched = true;
  } else if (mutation.type === "edit-project-note") {
    const noteId = projectNoteIdFromUrl(mutation.url);
    if (!noteId) return;
    const body =
      typeof mutation.body === "object" && mutation.body !== null
        ? (mutation.body as Record<string, unknown>)
        : {};
    const notes = readProjectNotesModule(data, projectId);
    const idx = notes.findIndex((n) => n.id === noteId);
    if (idx >= 0) {
      notes[idx] = {
        ...notes[idx],
        body: String(body.body ?? notes[idx].body),
        editedAt: new Date().toISOString(),
        _pendingSync: true,
      };
      writeProjectNotesModule(data, projectId, notes);
      patched = true;
    }
  } else if (mutation.type === "delete-project-note") {
    const noteId = projectNoteIdFromUrl(mutation.url);
    if (!noteId) return;
    const notes = readProjectNotesModule(data, projectId).filter((n) => n.id !== noteId);
    writeProjectNotesModule(data, projectId, notes);
    patched = true;
  } else if (mutation.type === "pin-project-note") {
    const noteId = projectNoteIdFromUrl(mutation.url);
    if (!noteId) return;
    const body =
      typeof mutation.body === "object" && mutation.body !== null
        ? (mutation.body as Record<string, unknown>)
        : {};
    const notes = readProjectNotesModule(data, projectId);
    const idx = notes.findIndex((n) => n.id === noteId);
    if (idx >= 0) {
      const pinned = Boolean(body.pinned);
      notes[idx] = {
        ...notes[idx],
        pinnedAt: pinned ? new Date().toISOString() : null,
        _pendingSync: true,
      };
      writeProjectNotesModule(data, projectId, notes);
      patched = true;
    }
  }
  // "add-comment" — no-op: comments are not part of the snapshot payload

  if (!patched) return;

  await writeSnapshot(lookup, data);
}

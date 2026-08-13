/**
 * Helpers to open queued mutations for author editing from the upload queue.
 */

import type { UnitContext } from "@/components/projects/AddObservationModal";
import type { IssueSummary, ObsSummary } from "@/components/projects/UnitCards";
import { unitContextFromUnitRef } from "@/lib/field-notes-scope";
import type { CustomSitePlacement } from "@/lib/custom-site-locations";
import { getMutationById, type QueuedMutation } from "@/lib/offline/mutation-queue";
import { readSnapshotIssuesForProject, readSnapshotObservationsForProject } from "@/lib/offline/snapshot-project-reads";
import { scopeRowHasOpenBlockingIssueForInstallComplete, type IssueForInstallCompleteGate } from "@/lib/scope-install-complete-gate";
import { normalizeSnapshotObservation } from "@/lib/offline/normalize-snapshot-observation";
import { requestOpenPendingMutation } from "@/lib/offline/pending-mutation-open";
import { requestStatusPhotoRetake } from "@/lib/offline/pending-status-photo-retake";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function scopeTagsFromRowIds(rowIds: string[]): IssueSummary["scopeTags"] {
  return rowIds.map((id) => ({ row: { id, scopeType: null } }));
}

export function projectIdFromMutationUrl(url: string): string | null {
  const match = url.match(/\/api\/projects\/([^/]+)\//);
  return match?.[1] ?? null;
}

function observationIdFromUrl(url: string): string | null {
  const match = /\/observations\/([^/?#]+)/.exec(url);
  return match?.[1] ?? null;
}

/** True when the current session user queued this mutation (or legacy row with no actor). */
export function canEditQueuedMutation(
  mutation: QueuedMutation,
  currentUserId?: string,
): boolean {
  if (!currentUserId) return false;
  if (!mutation.actorUserId) return true;
  return mutation.actorUserId === currentUserId;
}

/** Client-only — fetches session without requiring SessionProvider (safe during static prerender). */
export async function fetchCurrentUserId(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const res = await fetch("/api/auth/session");
    if (!res.ok) return undefined;
    const data = (await res.json()) as { user?: { id?: string } };
    return data.user?.id;
  } catch {
    return undefined;
  }
}

export function unitContextForMutation(mutation: QueuedMutation): UnitContext {
  const body = asRecord(mutation.body);
  const unitRef = typeof body.unitRef === "string" ? body.unitRef : "";
  const labels = {
    levelHeading: (level: string) => level,
    buildingAndLevel: (building: string, level: string) => `${building} ${level}`.trim(),
    unknown: "Unknown",
    projectUnitKey: "Project",
  };
  if (unitRef) {
    return unitContextFromUnitRef(unitRef, labels);
  }
  const building = String(body.building ?? "").trim();
  const level = String(body.level ?? "").trim();
  const unit = String(body.unit ?? "").trim();
  return {
    unitKey: unit || building || "—",
    building,
    level,
    unit,
    unitRef: unit ? `${building}|${level}|${unit}` : "",
  };
}

export function buildObsSummaryFromMutation(mutation: QueuedMutation): ObsSummary | null {
  if (mutation.type === "create-observation") {
    const body = asRecord(mutation.body);
    const rowIds = Array.isArray(body.projectRowIds) ? (body.projectRowIds as string[]) : [];
    return normalizeSnapshotObservation({
      id: mutation.id,
      projectId: projectIdFromMutationUrl(mutation.url) ?? undefined,
      title: String(body.title ?? ""),
      description: String(body.description ?? ""),
      observationType: String(body.observationType ?? "OTHER"),
      unitRef: typeof body.unitRef === "string" ? body.unitRef : null,
      createdAt: new Date(mutation.queuedAt).toISOString(),
      authorId: mutation.actorUserId ?? "",
      scopeTags: scopeTagsFromRowIds(rowIds),
      attachments: [],
      _count: { comments: 0 },
      _pendingSync: true,
    });
  }
  return null;
}

export async function loadObsSummaryForMutation(
  mutation: QueuedMutation,
): Promise<ObsSummary | null> {
  if (mutation.type === "create-observation") {
    return buildObsSummaryFromMutation(mutation);
  }
  if (mutation.type === "update-observation") {
    const projectId = projectIdFromMutationUrl(mutation.url);
    const obsId = observationIdFromUrl(mutation.url);
    if (!projectId || !obsId) return null;

    const snapshot = await readSnapshotObservationsForProject(projectId);
    const row = snapshot?.data.find((o) => {
      const r = o as { id?: string };
      return r.id === obsId;
    }) as Parameters<typeof normalizeSnapshotObservation>[0] | undefined;

    if (row) {
      const obs = normalizeSnapshotObservation(row);
      const body = asRecord(mutation.body);
      return {
        ...obs,
        title: body.title !== undefined ? String(body.title) : obs.title,
        description: body.description !== undefined ? String(body.description) : obs.description,
        observationType:
          body.observationType !== undefined ? String(body.observationType) : obs.observationType,
        _pendingSync: true,
      };
    }

    const body = asRecord(mutation.body);
    return normalizeSnapshotObservation({
      id: obsId,
      title: String(body.title ?? body.description ?? ""),
      description: String(body.description ?? ""),
      observationType: String(body.observationType ?? "OTHER"),
      scopeTags: Array.isArray(body.scopeTagIds)
        ? scopeTagsFromRowIds(body.scopeTagIds as string[])
        : [],
      attachments: [],
      _count: { comments: 0 },
      _pendingSync: true,
    });
  }
  return null;
}

export function buildIssueSummaryFromMutation(mutation: QueuedMutation): IssueSummary | null {
  if (mutation.type !== "create-issue") return null;
  const body = asRecord(mutation.body);
  const rowIds = Array.isArray(body.projectRowIds) ? (body.projectRowIds as string[]) : [];
  return {
    id: mutation.id,
    issueType: String(body.issueType ?? ""),
    responsibleParty: String(body.responsibleParty ?? ""),
    isBlockingWork: Boolean(body.isBlockingWork),
    status: String(body.status ?? "OPEN"),
    shortDescription: String(body.shortDescription ?? ""),
    notes: body.notes != null ? String(body.notes) : null,
    createdAt: new Date(mutation.queuedAt).toISOString(),
    unitRef: typeof body.unitRef === "string" ? body.unitRef : null,
    bulkGroupId: null,
    bulkGroupCount: null,
    createdBy: { id: mutation.actorUserId ?? "", name: null, email: "" },
    resolvedBy: null,
    attachments: [],
    scopeTags: scopeTagsFromRowIds(rowIds),
    _count: { comments: 0 },
    _pendingSync: true,
  };
}

export interface QueuedCommentEditContext {
  mutationId: string;
  projectId: string;
  body: string;
  target: "observation" | "issue" | "unknown";
}

export function buildCommentEditContext(mutation: QueuedMutation): QueuedCommentEditContext | null {
  if (mutation.type !== "add-comment") return null;
  const projectId = projectIdFromMutationUrl(mutation.url);
  if (!projectId) return null;
  const body = asRecord(mutation.body);
  let target: QueuedCommentEditContext["target"] = "unknown";
  if (mutation.url.includes("/observations/")) target = "observation";
  else if (mutation.url.includes("/issues/")) target = "issue";
  return {
    mutationId: mutation.id,
    projectId,
    body: String(body.body ?? ""),
    target,
  };
}

export interface QueuedUnitStatusEditContext {
  mutationId: string;
  projectId: string;
  rowId: string;
  building: string;
  level: string;
  unit: string;
  scopeStage: string;
  scopeStatus: string;
  installCompleteBlocked: boolean;
}

export function buildUnitStatusEditContext(mutation: QueuedMutation): QueuedUnitStatusEditContext | null {
  if (mutation.type !== "unit-status") return null;
  const projectId = projectIdFromMutationUrl(mutation.url);
  const rowMatch = mutation.url.match(/\/units\/([^/?#]+)/);
  const rowId = rowMatch?.[1];
  if (!projectId || !rowId) return null;
  const body = asRecord(mutation.body);
  return {
    mutationId: mutation.id,
    projectId,
    rowId,
    building: String(body.building ?? ""),
    level: String(body.level ?? ""),
    unit: String(body.unit ?? ""),
    scopeStage: String(body.scopeStage ?? ""),
    scopeStatus: String(body.scopeStatus ?? ""),
    installCompleteBlocked: false,
  };
}

/** Async enrichment — blocking issues live in the offline snapshot. */
export async function enrichUnitStatusEditContext(
  context: QueuedUnitStatusEditContext,
): Promise<QueuedUnitStatusEditContext> {
  const issues = await readSnapshotIssuesForProject(context.projectId);
  const rows = (issues?.data ?? []) as IssueForInstallCompleteGate[];
  return {
    ...context,
    installCompleteBlocked: scopeRowHasOpenBlockingIssueForInstallComplete(rows, context.rowId),
  };
}

export interface QueuedCustomSiteEditContext {
  mutationId: string;
  projectId: string;
  name: string;
  placement: CustomSitePlacement;
  building: string;
  level: string;
}

export function buildCustomSiteEditContext(mutation: QueuedMutation): QueuedCustomSiteEditContext | null {
  if (mutation.type !== "create-custom-site-location") return null;
  const projectId = projectIdFromMutationUrl(mutation.url);
  if (!projectId) return null;
  const body = asRecord(mutation.body);
  const placement = String(body.placement ?? "standalone") as CustomSitePlacement;
  return {
    mutationId: mutation.id,
    projectId,
    name: String(body.name ?? ""),
    placement,
    building: String(body.building ?? ""),
    level: String(body.level ?? ""),
  };
}

/** Route a mutation to the appropriate edit surface. Returns false when unsupported. */
export function openQueuedMutationForEdit(mutation: QueuedMutation): boolean {
  if (mutation.type === "link-status-album-photo") {
    requestStatusPhotoRetake(mutation.id);
    return true;
  }
  requestOpenPendingMutation(mutation.id);
  return true;
}

export async function loadMutationForEdit(mutationId: string): Promise<QueuedMutation | null> {
  return getMutationById(mutationId);
}

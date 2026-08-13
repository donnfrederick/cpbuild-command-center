/**
 * Client-side readers for project data stored in the offline snapshot bundle.
 */

import { isProjectLevelUnitRef } from "@/lib/field-notes-scope";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";
import type { ProjectNoteDto } from "@/lib/project-notes/types";
import { readSnapshotData, readSnapshotModule } from "@/lib/offline/snapshot-cache";

export interface SnapshotReadResult<T> {
  data: T;
  generatedAt: string | null;
}

export async function readSnapshotIssuesForProject(
  projectId: string,
): Promise<SnapshotReadResult<unknown[]> | null> {
  const snapshot = await readSnapshotData(projectId);
  if (!snapshot?.data || !Array.isArray(snapshot.data.issues)) return null;
  return {
    data: (snapshot.data.issues as Array<{ projectId?: string }>).filter(
      (row) => row.projectId === projectId,
    ),
    generatedAt: snapshot.generatedAt ?? null,
  };
}

export async function readSnapshotObservationsForProject(
  projectId: string,
): Promise<SnapshotReadResult<unknown[]> | null> {
  const snapshot = await readSnapshotData(projectId);
  if (!snapshot?.data || !Array.isArray(snapshot.data.observations)) return null;
  return {
    data: (snapshot.data.observations as Array<{ projectId?: string; unitRef?: string | null }>).filter(
      (row) => row.projectId === projectId,
    ),
    generatedAt: snapshot.generatedAt ?? null,
  };
}

export async function readSnapshotProjectLevelObservations(
  projectId: string,
): Promise<SnapshotReadResult<unknown[]> | null> {
  const base = await readSnapshotObservationsForProject(projectId);
  if (!base) return null;
  return {
    data: (base.data as Array<{ unitRef?: string | null }>).filter((row) =>
      isProjectLevelUnitRef(row.unitRef),
    ),
    generatedAt: base.generatedAt,
  };
}

export async function readSnapshotProjectLevelIssues(
  projectId: string,
): Promise<SnapshotReadResult<unknown[]> | null> {
  const base = await readSnapshotIssuesForProject(projectId);
  if (!base) return null;
  return {
    data: (base.data as Array<{ unitRef?: string | null }>).filter((row) =>
      isProjectLevelUnitRef(row.unitRef),
    ),
    generatedAt: base.generatedAt,
  };
}

export async function readSnapshotProjectsList(): Promise<SnapshotReadResult<unknown[]> | null> {
  const cached = await readSnapshotModule<unknown[]>("projects");
  if (!cached?.data) return null;
  return { data: cached.data, generatedAt: cached.generatedAt };
}

export interface OfflineActivityPage {
  events: unknown[];
  nextCursor: string | null;
  totalCount: number;
}

export async function readSnapshotActivityPage(
  projectId: string,
): Promise<SnapshotReadResult<OfflineActivityPage> | null> {
  const cached = await readSnapshotModule<Record<string, OfflineActivityPage>>(
    "activity-pages",
    projectId,
  );
  const page = cached?.data?.[projectId];
  if (!page) return null;
  return { data: page, generatedAt: cached.generatedAt };
}

export interface OfflineAlbumEntry {
  unitRef: string;
  items: unknown[];
}

export async function readSnapshotAlbumForUnit(
  projectId: string,
  unitRef: string,
): Promise<SnapshotReadResult<unknown[]> | null> {
  const cached = await readSnapshotModule<OfflineAlbumEntry[]>("album", projectId);
  const entry = cached?.data?.find((row) => row.unitRef === unitRef);
  if (!entry || !cached) return null;
  return { data: entry.items, generatedAt: cached.generatedAt };
}

export interface OfflineEntityComments {
  issues: Record<string, unknown[]>;
  observations: Record<string, unknown[]>;
}

export async function readSnapshotCommentsForEntity(
  projectId: string,
  entityType: "issue" | "observation",
  entityId: string,
): Promise<unknown[] | null> {
  const cached = await readSnapshotModule<OfflineEntityComments>(
    "entity-comments",
    projectId,
  );
  if (!cached?.data) return null;
  const bucket = entityType === "issue" ? cached.data.issues : cached.data.observations;
  return bucket[entityId] ?? null;
}

export interface ProjectCacheManifest {
  unitCount: number;
  issueCount: number;
  observationCount: number;
  inspectionCount: number;
  generatedAt: string | null;
}

/** Counts for modules cached for a single project (from project-scoped snapshot key). */
export async function readProjectCacheManifest(
  projectId: string,
): Promise<ProjectCacheManifest | null> {
  const snapshot = await readSnapshotData(projectId);
  if (!snapshot?.data) return null;

  const data = snapshot.data;
  const units = Array.isArray(data.units)
    ? (data.units as Array<{ projectId?: string }>).filter((row) => row.projectId === projectId)
    : [];
  const issues = Array.isArray(data.issues)
    ? (data.issues as Array<{ projectId?: string }>).filter((row) => row.projectId === projectId)
    : [];
  const observations = Array.isArray(data.observations)
    ? (data.observations as Array<{ projectId?: string }>).filter(
        (row) => row.projectId === projectId,
      )
    : [];
  const inspections = Array.isArray(data["inspection-submissions"])
    ? (data["inspection-submissions"] as Array<{ projectId?: string }>).filter(
        (row) => row.projectId === projectId,
      )
    : [];

  return {
    unitCount: units.length,
    issueCount: issues.length,
    observationCount: observations.length,
    inspectionCount: inspections.length,
    generatedAt: snapshot.generatedAt ?? null,
  };
}

export async function readSnapshotCustomSiteLocations(
  projectId: string,
): Promise<SnapshotReadResult<CustomSiteLocation[]> | null> {
  const cached = await readSnapshotModule<Record<string, CustomSiteLocation[]>>(
    "custom-site-locations",
    projectId,
  );
  const locations = cached?.data?.[projectId];
  if (!locations) return null;
  return { data: locations, generatedAt: cached.generatedAt };
}

export async function readSnapshotProjectNotes(projectId: string): Promise<ProjectNoteDto[] | null> {
  const cached = await readSnapshotModule<Record<string, ProjectNoteDto[]>>(
    "project-notes",
    projectId,
  );
  const notes = cached?.data?.[projectId];
  if (!notes) return null;
  return notes;
}

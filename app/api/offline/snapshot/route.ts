/**
 * GET /api/offline/snapshot[?projectIds=id1,id2]
 *
 * Returns a bundled JSON payload of all data the authenticated user has
 * enabled for offline use. The service worker caches this response so it
 * is available when the device goes offline.
 *
 * The payload is versioned so the SW can detect staleness:
 *   { version, generatedAt, data: { [moduleId]: any } }
 *
 * When ?projectIds=<comma-separated IDs> is provided, only those projects
 * are synced (per-project sync button). Without the param, all
 * offlineProjectIds from the user's preference are synced.
 *
 * After a successful sync, OfflineProjectSync rows are upserted for each
 * synced project so the UI can show a per-project last-synced timestamp.
 */

import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { db } from "@/lib/db";
import { filterObservationAttachmentHeads } from "@/lib/observation-attachments";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
import { ALWAYS_CACHED_MODULES } from "@/lib/offline/modules";
import { enrichProjectList } from "@/lib/project-unifier-merge";
import { filterProjectIdsHiddenFromRole } from "@/lib/production-project-access";
import { serializeProjectUnitsForSnapshot } from "@/lib/project-units-serialize";
import { getSubcontractorsForPicker } from "@/lib/unifier/subcontractors";
import { loadPublishedFormsForOffline } from "@/lib/forms/load-published-forms-server";
import { serializeInspectionSubmissionsForSnapshot } from "@/lib/inspections/serialize-inspection-submissions-for-snapshot";
import { fetchInspectionsReport } from "@/lib/inspections/fetch-inspections-report";
import { fetchActivityListForOffline } from "@/lib/activity/fetch-activity-list-for-offline";
import { serializeEntityCommentsForSnapshot } from "@/lib/offline/serialize-entity-comments-for-snapshot";
import { getSubScopesForProject } from "@/lib/sub-scopes";
import { listCustomSiteLocationsForProject } from "@/lib/custom-site-locations/list-custom-site-locations-for-project";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";
import { fetchActiveIssueCatalog } from "@/lib/issues/issue-catalog";
import { fetchActiveObservationCatalog } from "@/lib/observations/observation-catalog";
import { serializeProjectNotesForSnapshot } from "@/lib/offline/serialize-project-notes-for-snapshot";

// ─── Data fetchers ────────────────────────────────────────────────────────────

type CoreFetcher = (userId: string) => Promise<unknown>;
type ProjectFetcher = (userId: string, offlineIds: string[]) => Promise<unknown>;

const CORE_FETCHERS: Record<string, CoreFetcher> = {
  "issue-catalog": async () => fetchActiveIssueCatalog(),
  "observation-catalog": async () => fetchActiveObservationCatalog(),
  "my-profile": async (userId) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: { select: { code: true, name: true } },
      },
    });
    return user
      ? { ...user, role: user.role.code, roleName: user.role.name }
      : null;
  },

  "team-directory": async () => {
    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: { select: { code: true, name: true } },
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role.code,
      createdAt: u.createdAt.toISOString(),
    }));
  },
};

const PROJECT_FETCHERS: Record<string, ProjectFetcher> = {
  projects: async (_userId, offlineIds) => {
    if (offlineIds.length === 0) return [];
    const rows = await db.project.findMany({
      where: { id: { in: offlineIds }, deletedAt: null },
    });
    try {
      return await enrichProjectList(rows);
    } catch {
      // Unifier unavailable — return raw DB rows with placeholders
      return rows.map((r) => ({
        id: r.id,
        unifierPid: r.unifierPid,
        installManagerId: r.installManagerId,
        installManagerName: r.installManagerName,
        name: r.unifierPid ?? r.id,
        siteLocation: "",
        projectManager: "",
      }));
    }
  },

  units: async (_userId, offlineIds) => serializeProjectUnitsForSnapshot(offlineIds),

  observations: async (_userId, offlineIds) => {
    if (offlineIds.length === 0) return [];
    const rows = await db.projectObservation.findMany({
      where: { projectId: { in: offlineIds } },
      select: {
        id: true,
        projectId: true,
        title: true,
        description: true,
        observationTypeCode: true,
        unitRef: true,
        createdAt: true,
        author: { select: { id: true, name: true, email: true } },
        attachments: { select: { id: true, storageUrl: true, mimeType: true, supersedesId: true } },
        scopeTags: {
          select: {
            row: {
              select: {
                id: true,
                scopeType: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      title: r.title,
      description: r.description,
      observationType: r.observationTypeCode,
      unitRef: r.unitRef,
      createdAt: r.createdAt.toISOString(),
      author: {
        id: r.author?.id ?? "",
        name: r.author?.name ?? null,
        email: r.author?.email ?? "",
      },
      scopeTags: r.scopeTags.map((t) => ({
        row: {
          id: t.row.id,
          scopeType: t.row.scopeType ? { name: t.row.scopeType.name } : null,
        },
      })),
      attachments: filterObservationAttachmentHeads(r.attachments).map((a) => ({
        id: a.id,
        storageUrl: a.storageUrl,
        mimeType: a.mimeType,
      })),
      _count: { comments: 0 },
    }));
  },

  issues: async (_userId, offlineIds) => {
    if (offlineIds.length === 0) return [];
    const rows = await db.projectIssue.findMany({
      where: { projectId: { in: offlineIds } },
      select: {
        id: true,
        projectId: true,
        shortDescription: true,
        issueTypeCode: true,
        status: true,
        isBlockingWork: true,
        unitRef: true,
        createdAt: true,
        responsiblePartyCode: true,
        responsiblePartyTags: { select: { partyCode: true }, orderBy: { id: "asc" } },
        createdBy: { select: { name: true } },
        attachments: { select: { id: true, storageUrl: true, mimeType: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      shortDescription: r.shortDescription,
      issueType: r.issueTypeCode,
      status: r.status,
      isBlockingWork: r.isBlockingWork,
      unitRef: r.unitRef,
      reporterName: r.createdBy?.name ?? null,
      createdAt: r.createdAt.toISOString(),
      responsibleParty: r.responsiblePartyCode,
      responsibleParties:
        r.responsiblePartyTags.length > 0
          ? r.responsiblePartyTags.map((t) => t.partyCode)
          : [r.responsiblePartyCode],
      attachments: r.attachments.map((a) => ({
        id: a.id,
        storageUrl: a.storageUrl,
        mimeType: a.mimeType,
      })),
    }));
  },

  subcontractors: async (_userId, offlineIds) => {
    if (offlineIds.length === 0) return [];
    try {
      return await getSubcontractorsForPicker();
    } catch (err) {
      console.warn("[offline/snapshot] subcontractors fetch failed:", err);
      return [];
    }
  },

  "published-forms": async (_userId, offlineIds) => {
    if (offlineIds.length === 0) return [];
    try {
      return await loadPublishedFormsForOffline();
    } catch (err) {
      console.warn("[offline/snapshot] published-forms fetch failed:", err);
      return [];
    }
  },

  "inspection-submissions": async (_userId, offlineIds) => {
    if (offlineIds.length === 0) return [];
    try {
      return await serializeInspectionSubmissionsForSnapshot(offlineIds);
    } catch (err) {
      console.warn("[offline/snapshot] inspection-submissions fetch failed:", err);
      return [];
    }
  },

  "inspections-reports": async (_userId, offlineIds) => {
    if (offlineIds.length === 0) return {};
    const reports: Record<string, unknown> = {};
    await Promise.all(
      offlineIds.map(async (projectId) => {
        try {
          reports[projectId] = await fetchInspectionsReport(projectId);
        } catch (err) {
          console.warn(`[offline/snapshot] inspections-report ${projectId} failed:`, err);
        }
      }),
    );
    return reports;
  },

  "activity-pages": async (userId, offlineIds) => {
    if (offlineIds.length === 0) return {};
    const user = userId
      ? await db.user.findUnique({
          where: { id: userId },
          select: { role: { select: { code: true } } },
        })
      : null;
    const roleCode = user?.role?.code ?? "MEMBER";
    const pages: Record<string, unknown> = {};
    await Promise.all(
      offlineIds.map(async (projectId) => {
        try {
          pages[projectId] = await fetchActivityListForOffline(projectId, roleCode);
        } catch (err) {
          console.warn(`[offline/snapshot] activity ${projectId} failed:`, err);
        }
      }),
    );
    return pages;
  },

  "entity-comments": async (_userId, offlineIds) => {
    if (offlineIds.length === 0) return { issues: {}, observations: {} };
    try {
      return await serializeEntityCommentsForSnapshot(offlineIds);
    } catch (err) {
      console.warn("[offline/snapshot] entity-comments fetch failed:", err);
      return { issues: {}, observations: {} };
    }
  },

  "sub-scopes": async (_userId, offlineIds) => {
    if (offlineIds.length === 0) return {};
    const groups: Record<string, unknown> = {};
    await Promise.all(
      offlineIds.map(async (projectId) => {
        try {
          groups[projectId] = await getSubScopesForProject(db, projectId);
        } catch (err) {
          console.warn(`[offline/snapshot] sub-scopes ${projectId} failed:`, err);
        }
      }),
    );
    return groups;
  },

  "custom-site-locations": async (_userId, offlineIds) => {
    if (offlineIds.length === 0) return {};
    const groups: Record<string, CustomSiteLocation[]> = {};
    await Promise.all(
      offlineIds.map(async (projectId) => {
        try {
          groups[projectId] = await listCustomSiteLocationsForProject(db, projectId);
        } catch (err) {
          console.warn(`[offline/snapshot] custom-site-locations ${projectId} failed:`, err);
        }
      }),
    );
    return groups;
  },

  "project-notes": async (_userId, offlineIds) => {
    if (offlineIds.length === 0) return {};
    try {
      return await serializeProjectNotesForSnapshot(offlineIds);
    } catch (err) {
      console.warn("[offline/snapshot] project-notes fetch failed:", err);
      return {};
    }
  },
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getEffectiveSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUserId = await resolveSessionToDbUserId(session.user);

  const pref = dbUserId
    ? await db.offlinePreference.findUnique({
        where: { userId: dbUserId },
      })
    : null;

  // Determine which project IDs to sync.
  // When ?projectIds= is provided, intersect with the user's saved offlineProjectIds
  // to prevent fetching data for projects the user hasn't authorized for offline use.
  // Exception: ?autoWarm=1 (set by EagerSyncActivator on project entry) bypasses
  // the offlineProjectIds filter so any project the user can navigate to gets cached
  // for offline access automatically. The role-based filter below still applies.
  const userOfflineIds = pref?.offlineProjectIds ?? [];
  const paramIds = request.nextUrl.searchParams.get("projectIds");
  const autoWarm = request.nextUrl.searchParams.get("autoWarm") === "1";
  const rawOfflineIds: string[] = paramIds
    ? autoWarm
      ? paramIds.split(",")
      : paramIds.split(",").filter((id) => userOfflineIds.includes(id))
    : userOfflineIds;

  const offlineIds = await filterProjectIdsHiddenFromRole(rawOfflineIds, session.user.role);

  // Core modules always included
  const enabledCoreModules = Array.from(
    new Set(["issue-catalog", "observation-catalog", ...ALWAYS_CACHED_MODULES, ...(pref?.modules ?? [])])
  );

  const data: Record<string, unknown> = {};

  // Fetch core modules
  const profileUserId = dbUserId ?? "";
  await Promise.all(
    enabledCoreModules.map(async (moduleId) => {
      const fetcher = CORE_FETCHERS[moduleId];
      if (fetcher) data[moduleId] = await fetcher(profileUserId);
    })
  );

  // Fetch project bundle modules (scoped to offlineIds)
  await Promise.all(
    Object.entries(PROJECT_FETCHERS).map(async ([moduleId, fetcher]) => {
      data[moduleId] = await fetcher(profileUserId, offlineIds);
    })
  );

  // Upsert OfflineProjectSync rows for each synced project (requires a real User.id FK)
  if (offlineIds.length > 0 && dbUserId) {
    await Promise.all(
      offlineIds.map((projectId) =>
        db.offlineProjectSync.upsert({
          where: { userId_projectId: { userId: dbUserId, projectId } },
          create: { userId: dbUserId, projectId },
          update: { syncedAt: new Date() },
        })
      )
    );
  }

  // Update global syncedAt on the preference row
  if (pref && dbUserId) {
    await db.offlinePreference.update({
      where: { userId: dbUserId },
      data: { syncedAt: new Date() },
    });
  }

  return NextResponse.json(
    {
      version: 3,
      generatedAt: new Date().toISOString(),
      modules: [...enabledCoreModules, ...Object.keys(PROJECT_FETCHERS)],
      offlineProjectIds: offlineIds,
      data,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
      },
    }
  );
}

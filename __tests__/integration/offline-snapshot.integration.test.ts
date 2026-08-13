/**
 * Integration tests for GET /api/offline/snapshot
 *
 * Verifies: auth guard, per-project scoping, null Unifier data handling,
 * correct module set in response, OfflineProjectSync upsert.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    offlinePreference: { findUnique: vi.fn(), update: vi.fn() },
    project: { findMany: vi.fn() },
    projectRow: { findMany: vi.fn() },
    projectObservation: { findMany: vi.fn() },
    projectIssue: { findMany: vi.fn() },
    issueTypeCatalog: { findMany: vi.fn() },
    responsiblePartyCatalog: { findMany: vi.fn() },
    observationTypeCatalog: { findMany: vi.fn() },
    offlineProjectSync: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectList: vi.fn(),
}));

vi.mock("@/lib/production-project-access", () => ({
  filterProjectIdsHiddenFromRole: vi.fn().mockImplementation((ids: string[]) => Promise.resolve(ids)),
}));

vi.mock("@/lib/project-units-serialize", () => ({
  serializeProjectUnitsForSnapshot: vi.fn(),
}));

vi.mock("@/lib/unifier/subcontractors", () => ({
  getSubcontractorsForPicker: vi.fn().mockResolvedValue([{ id: "sub-1", name: "Acme" }]),
}));

vi.mock("@/lib/forms/load-published-forms-server", () => ({
  loadPublishedFormsForOffline: vi.fn().mockResolvedValue([{ id: "form-1", name: "Test Form" }]),
}));

vi.mock("@/lib/inspections/serialize-inspection-submissions-for-snapshot", () => ({
  serializeInspectionSubmissionsForSnapshot: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/inspections/fetch-inspections-report", () => ({
  fetchInspectionsReport: vi.fn().mockResolvedValue({
    projectStartedAt: "2026-01-01T00:00:00.000Z",
    availableInstallers: [],
    scopeTypes: [],
  }),
}));

vi.mock("@/lib/activity/fetch-activity-list-for-offline", () => ({
  fetchActivityListForOffline: vi.fn().mockResolvedValue({
    events: [],
    nextCursor: null,
    totalCount: 0,
  }),
}));

vi.mock("@/lib/offline/serialize-entity-comments-for-snapshot", () => ({
  serializeEntityCommentsForSnapshot: vi.fn().mockResolvedValue({ issues: {}, observations: {} }),
}));

vi.mock("@/lib/sub-scopes", () => ({
  getSubScopesForProject: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/custom-site-locations/list-custom-site-locations-for-project", () => ({
  listCustomSiteLocationsForProject: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/offline/serialize-project-notes-for-snapshot", () => ({
  serializeProjectNotesForSnapshot: vi.fn().mockResolvedValue({}),
}));

import { GET } from "@/app/api/offline/snapshot/route";
import { getEffectiveSession } from "@/lib/masquerade";
import { db } from "@/lib/db";
import { enrichProjectList } from "@/lib/project-unifier-merge";
import { serializeProjectUnitsForSnapshot } from "@/lib/project-units-serialize";
import { serializeInspectionSubmissionsForSnapshot } from "@/lib/inspections/serialize-inspection-submissions-for-snapshot";
import { fetchInspectionsReport } from "@/lib/inspections/fetch-inspections-report";
import { listCustomSiteLocationsForProject } from "@/lib/custom-site-locations/list-custom-site-locations-for-project";
import { serializeProjectNotesForSnapshot } from "@/lib/offline/serialize-project-notes-for-snapshot";

const mockSession = {
  user: { id: "user-1", name: "Test User", email: "test@example.com", role: "INSTALL_MANAGER" },
  masquerade: null,
  rolePreview: null,
};

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/offline/snapshot");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

describe("GET /api/offline/snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serializeProjectUnitsForSnapshot).mockResolvedValue([]);
    vi.mocked(getEffectiveSession).mockResolvedValue(mockSession as never);
    // my-profile is always fetched (ALWAYS_CACHED_MODULES)
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
      role: { code: "INSTALL_MANAGER", name: "Install Manager" },
    } as never);
    vi.mocked(db.user.findMany).mockResolvedValue([]);
    vi.mocked(db.offlinePreference.update).mockResolvedValue({} as never);
    vi.mocked(db.issueTypeCatalog.findMany).mockResolvedValue([]);
    vi.mocked(db.responsiblePartyCatalog.findMany).mockResolvedValue([]);
    vi.mocked(db.observationTypeCatalog.findMany).mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns core modules when no offlineProjectIds are set", async () => {
    vi.mocked(db.offlinePreference.findUnique).mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: ["team-directory"],
      offlineProjectIds: [],
      syncedAt: null,
      updatedAt: new Date(),
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValue([]);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { version: number; data: Record<string, unknown> };
    expect(body.version).toBe(3);
    expect(body.data).toHaveProperty("my-profile");
    expect(body.data).toHaveProperty("projects");
    expect(body.data.projects).toEqual([]);
  });

  it("scopes project fetch to offlineProjectIds from pref", async () => {
    vi.mocked(db.offlinePreference.findUnique).mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: [],
      offlineProjectIds: ["proj-a"],
      syncedAt: null,
      updatedAt: new Date(),
    } as never);
    const mockProject = { id: "proj-a", unifierPid: "123", installManagerId: null, installManagerName: null, deletedAt: null };
    vi.mocked(db.project.findMany).mockResolvedValue([mockProject] as never);
    vi.mocked(enrichProjectList).mockResolvedValue([{ ...mockProject, projectName: "Test Project" }] as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);
    vi.mocked(db.offlineProjectSync.upsert).mockResolvedValue({} as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["proj-a"] } }) })
    );
    expect(db.offlineProjectSync.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_projectId: { userId: "user-1", projectId: "proj-a" } } })
    );
  });

  it("scopes to ?projectIds query param when provided, filtering against user offlineProjectIds", async () => {
    vi.mocked(db.offlinePreference.findUnique).mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: [],
      offlineProjectIds: ["proj-a", "proj-b"],
      syncedAt: null,
      updatedAt: new Date(),
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValue([]);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);
    vi.mocked(db.offlineProjectSync.upsert).mockResolvedValue({} as never);

    // proj-b is in offlineProjectIds — should be synced
    // proj-x is NOT in offlineProjectIds — should be filtered out even if requested
    const res = await GET(makeRequest({ projectIds: "proj-b,proj-x" }));
    expect(res.status).toBe(200);

    // Only proj-b (authorized) is fetched — proj-x is filtered out
    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["proj-b"] } }) })
    );
    expect(db.offlineProjectSync.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_projectId: { userId: "user-1", projectId: "proj-b" } } })
    );
    // proj-a and proj-x should NOT be synced
    const calls = vi.mocked(db.offlineProjectSync.upsert).mock.calls;
    const syncedIds = calls.map((c) => (c[0] as { where: { userId_projectId: { projectId: string } } }).where.userId_projectId.projectId);
    expect(syncedIds).not.toContain("proj-a");
    expect(syncedIds).not.toContain("proj-x");
  });

  it("handles null projectManagerName from Unifier gracefully", async () => {
    vi.mocked(db.offlinePreference.findUnique).mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: [],
      offlineProjectIds: ["proj-c"],
      syncedAt: null,
      updatedAt: new Date(),
    } as never);
    const mockProject = { id: "proj-c", unifierPid: null, installManagerId: null, installManagerName: null, deletedAt: null };
    vi.mocked(db.project.findMany).mockResolvedValue([mockProject] as never);
    vi.mocked(enrichProjectList).mockResolvedValue([{ ...mockProject, projectName: "Unknown", projectManagerName: null, siteLocation: "" }] as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);
    vi.mocked(db.offlineProjectSync.upsert).mockResolvedValue({} as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { projects: unknown[] } };
    expect(Array.isArray(body.data.projects)).toBe(true);
  });

  it("resolves dev-user to a real User.id for OfflineProjectSync upsert (FK safety)", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "dev-user", name: "Dev", email: "test@example.com", role: "ADMIN" },
      masquerade: null,
      rolePreview: null,
    } as never);
    vi.mocked(db.user.findUnique).mockImplementation(
      (args: { where: { id?: string; email?: string } }) => {
        if (args.where.email === "test@example.com") {
          return Promise.resolve({ id: "user-1" } as never);
        }
        if (args.where.id === "user-1") {
          return Promise.resolve({
            id: "user-1",
            name: "Test User",
            email: "test@example.com",
            role: { code: "ADMIN", name: "Admin" },
          } as never);
        }
        return Promise.resolve(null as never);
      }
    );
    vi.mocked(db.offlinePreference.findUnique).mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: [],
      offlineProjectIds: ["proj-z"],
      syncedAt: null,
      updatedAt: new Date(),
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValue([]);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);
    vi.mocked(db.offlineProjectSync.upsert).mockResolvedValue({} as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(db.offlineProjectSync.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_projectId: { userId: "user-1", projectId: "proj-z" } } })
    );
  });

  it("skips OfflineProjectSync upsert when no User row can be resolved (empty team DB)", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "no-db-user", name: "Ghost", email: "ghost@example.com", role: "MEMBER" },
      masquerade: null,
      rolePreview: null,
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue(null as never);
    vi.mocked(db.user.findFirst).mockResolvedValue(null as never);
    vi.mocked(db.offlinePreference.findUnique).mockResolvedValue(null);
    vi.mocked(db.project.findMany).mockResolvedValue([]);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);

    const res = await GET(makeRequest({ projectIds: "proj-only", autoWarm: "1" }));
    expect(res.status).toBe(200);
    expect(db.offlineProjectSync.upsert).not.toHaveBeenCalled();
  });

  it("falls back to raw DB row when enrichProjectList throws (Unifier unavailable)", async () => {
    vi.mocked(db.offlinePreference.findUnique).mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: [],
      offlineProjectIds: ["proj-d"],
      syncedAt: null,
      updatedAt: new Date(),
    } as never);
    const mockProject = { id: "proj-d", unifierPid: "999", installManagerId: null, installManagerName: null, deletedAt: null };
    vi.mocked(db.project.findMany).mockResolvedValue([mockProject] as never);
    vi.mocked(enrichProjectList).mockRejectedValue(new Error("Unifier down"));
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);
    vi.mocked(db.offlineProjectSync.upsert).mockResolvedValue({} as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { projects: Array<{ id: string }> } };
    expect(body.data.projects[0].id).toBe("proj-d");
  });

  it("returns full unit rows from shared serializer when projects are synced", async () => {
    vi.mocked(db.offlinePreference.findUnique).mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: [],
      offlineProjectIds: ["proj-u"],
      syncedAt: null,
      updatedAt: new Date(),
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValue([
      { id: "proj-u", unifierPid: "1", installManagerId: null, installManagerName: null, deletedAt: null },
    ] as never);
    vi.mocked(enrichProjectList).mockResolvedValue([{ id: "proj-u", projectName: "Unit Test" }] as never);
    vi.mocked(serializeProjectUnitsForSnapshot).mockResolvedValue([
      {
        id: "row-1",
        projectId: "proj-u",
        unifierSubId: "sub-1",
        installer: { id: "i1", code: "I1", name: "Installer" },
        issueMeta: { hasIssues: false, hasOpenIssues: false },
        subScopeInstances: [{ id: "ssi-1", subScopeId: "ss-1" }],
      },
    ]);
    vi.mocked(db.offlineProjectSync.upsert).mockResolvedValue({} as never);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { units: Array<Record<string, unknown>> } };
    expect(body.data.units[0]?.unifierSubId).toBe("sub-1");
    expect(body.data.units[0]?.installer).toBeTruthy();
    expect(body.data.units[0]?.issueMeta).toBeTruthy();
    expect(body.data.units[0]?.subScopeInstances).toHaveLength(1);
    expect(serializeProjectUnitsForSnapshot).toHaveBeenCalledWith(["proj-u"]);
  });

  it("includes inspection submissions and reports in project bundle", async () => {
    vi.mocked(db.offlinePreference.findUnique).mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: [],
      offlineProjectIds: ["proj-insp"],
      syncedAt: null,
      updatedAt: new Date(),
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValue([
      { id: "proj-insp", unifierPid: "1", installManagerId: null, installManagerName: null, deletedAt: null },
    ] as never);
    vi.mocked(enrichProjectList).mockResolvedValue([{ id: "proj-insp", projectName: "Insp Project" }] as never);
    vi.mocked(serializeProjectUnitsForSnapshot).mockResolvedValue([]);
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);
    vi.mocked(db.offlineProjectSync.upsert).mockResolvedValue({} as never);
    vi.mocked(serializeInspectionSubmissionsForSnapshot).mockResolvedValue([
      { id: "sub-1", projectId: "proj-insp" },
    ]);
    vi.mocked(fetchInspectionsReport).mockResolvedValue({
      projectStartedAt: "2026-01-01T00:00:00.000Z",
      availableInstallers: [],
      scopeTypes: [{ scopeTypeCode: "TIL", scopeTypeName: "Tile", totalInspections: 1, passCount: 1, failCount: 0, totalDeficiencies: 0, bySeverity: { Minor: 0, Major: 0, Critical: 0 }, submissions: [] }],
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as {
      data: {
        "inspection-submissions": unknown[];
        "inspections-reports": Record<string, unknown>;
      };
    };
    expect(body.data["inspection-submissions"]).toHaveLength(1);
    expect(body.data["inspections-reports"]).toHaveProperty("proj-insp");
    expect(serializeInspectionSubmissionsForSnapshot).toHaveBeenCalledWith(["proj-insp"]);
    expect(fetchInspectionsReport).toHaveBeenCalledWith("proj-insp");
  });

  it("includes custom site locations in project bundle", async () => {
    vi.mocked(db.offlinePreference.findUnique).mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: [],
      offlineProjectIds: ["proj-csl"],
      syncedAt: null,
      updatedAt: new Date(),
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValue([
      { id: "proj-csl", unifierPid: "1", installManagerId: null, installManagerName: null, deletedAt: null },
    ] as never);
    vi.mocked(enrichProjectList).mockResolvedValue([{ id: "proj-csl", projectName: "CSL Project" }] as never);
    vi.mocked(serializeProjectUnitsForSnapshot).mockResolvedValue([]);
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);
    vi.mocked(db.offlineProjectSync.upsert).mockResolvedValue({} as never);
    vi.mocked(listCustomSiteLocationsForProject).mockResolvedValue([
      {
        id: "loc-1",
        projectId: "proj-csl",
        name: "Dock",
        building: "",
        level: "",
        placement: "standalone",
        sortOrder: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        createdBy: { id: "u1", name: "Tester" },
        unitRef: "@custom|loc-1|Dock",
        observationCount: 0,
        issueCount: 0,
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as {
      data: { "custom-site-locations": Record<string, unknown[]> };
    };
    expect(body.data["custom-site-locations"]).toHaveProperty("proj-csl");
    expect(body.data["custom-site-locations"]["proj-csl"]).toHaveLength(1);
    expect(listCustomSiteLocationsForProject).toHaveBeenCalledWith(db, "proj-csl");
  });

  it("includes project-notes module keyed by project id", async () => {
    vi.mocked(db.offlinePreference.findUnique).mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      modules: [],
      offlineProjectIds: ["proj-notes"],
      syncedAt: null,
      updatedAt: new Date(),
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValue([
      { id: "proj-notes", unifierPid: "1", installManagerId: null, installManagerName: null, deletedAt: null },
    ] as never);
    vi.mocked(enrichProjectList).mockResolvedValue([{ id: "proj-notes", projectName: "Notes Project" }] as never);
    vi.mocked(serializeProjectUnitsForSnapshot).mockResolvedValue([]);
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);
    vi.mocked(db.offlineProjectSync.upsert).mockResolvedValue({} as never);
    vi.mocked(serializeProjectNotesForSnapshot).mockResolvedValue({
      "proj-notes": [
        {
          id: "note-1",
          body: "Offline note",
          author: { id: "u1", name: "Tester", email: "t@test.com" },
          createdAt: "2026-07-17T12:00:00.000Z",
          editedAt: null,
        },
      ],
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as {
      data: { "project-notes": Record<string, unknown[]> };
    };
    expect(body.data["project-notes"]).toHaveProperty("proj-notes");
    expect(body.data["project-notes"]["proj-notes"]).toHaveLength(1);
    expect(serializeProjectNotesForSnapshot).toHaveBeenCalledWith(["proj-notes"]);
  });
});

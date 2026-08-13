/**
 * snapshot-patch.unit.test.ts
 *
 * Tests for lib/offline/snapshot-patch.ts — the write-through that applies
 * queued offline mutations into the cached offline-data-v1 snapshot so the
 * UI reflects changes while still offline.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { QueuedMutation } from "@/lib/offline/mutation-queue";

// ── Cache Storage mock ────────────────────────────────────────────────────────

function makeSnapshotBody(data: Record<string, unknown>): string {
  return JSON.stringify({ version: 2, generatedAt: "2026-04-08T12:00:00Z", data });
}

// Stored snapshots map: cache key URL → snapshot body string
let storedSnapshots: Map<string, string> = new Map();
let putResponse: Response | null = null;

const mockCacheMatch = vi.fn(async (key: Request) => {
  const body = storedSnapshots.get(key.url);
  if (!body) return null;
  return new Response(body, { headers: { "Content-Type": "application/json" } });
});
const mockCachePut   = vi.fn(async (_key: unknown, res: Response) => { putResponse = res; });
const mockCacheKeys  = vi.fn(async () =>
  Array.from(storedSnapshots.keys()).map((url) => new Request(url))
);

const mockCacheOpen = vi.fn(async () => ({
  match: mockCacheMatch,
  put:   mockCachePut,
  keys:  mockCacheKeys,
}));

vi.stubGlobal("caches", { open: mockCacheOpen });

// Helper: set a single snapshot for proj-1
function setSnapshot(data: Record<string, unknown>) {
  storedSnapshots.set(
    "http://localhost/api/offline/snapshot?projectIds=proj-1",
    makeSnapshotBody(data),
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getPatched(): Promise<Record<string, unknown> | null> {
  if (!putResponse) return null;
  const json = (await putResponse.json()) as { data?: Record<string, unknown> };
  return json.data ?? null;
}

function makeMutation(overrides: Partial<QueuedMutation> & { type: QueuedMutation["type"] }): QueuedMutation {
  return {
    id: `${Date.now()}-test`,
    type: overrides.type,
    url: overrides.url ?? "/api/projects/proj-1/units/row-abc",
    method: overrides.method ?? "PATCH",
    body: overrides.body ?? {},
    attempts: 0,
    queuedAt: Date.now(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("patchOfflineSnapshot()", () => {
  beforeEach(() => {
    storedSnapshots = new Map();
    putResponse = null;
    mockCacheMatch.mockClear();
    mockCachePut.mockClear();
    mockCacheKeys.mockClear();
    mockCacheOpen.mockClear();
  });

  it("is a no-op when there is no cached snapshot", async () => {
    const { patchOfflineSnapshot } = await import("@/lib/offline/snapshot-patch");
    storedSnapshots.clear();

    const mutation = makeMutation({ type: "unit-status" });
    await patchOfflineSnapshot(mutation);

    expect(mockCachePut).not.toHaveBeenCalled();
  });

  it("selects the correct snapshot when multiple project keys exist", async () => {
    const { patchOfflineSnapshot } = await import("@/lib/offline/snapshot-patch");

    // proj-1 snapshot has units; proj-2 is a separate snapshot
    storedSnapshots.set(
      "http://localhost/api/offline/snapshot?projectIds=proj-2",
      makeSnapshotBody({ units: [{ id: "row-other", projectId: "proj-2" }] }),
    );
    storedSnapshots.set(
      "http://localhost/api/offline/snapshot?projectIds=proj-1",
      makeSnapshotBody({ units: [{ id: "row-abc", projectId: "proj-1" }] }),
    );

    const mutation = makeMutation({
      type: "unit-status",
      url: "/api/projects/proj-1/units/row-abc",
      body: { scopeStatus: "COMPLETE" },
    });

    await patchOfflineSnapshot(mutation);

    const data = await getPatched();
    const units = data!.units as Array<Record<string, unknown>>;
    // Should have patched proj-1's snapshot — only row-abc present
    expect(units).toHaveLength(1);
    expect(units[0].id).toBe("row-abc");
    expect(units[0]._pendingSync).toBe(true);
  });

  describe("unit-status", () => {
    it("merges body fields into the matching unit row and sets _pendingSync", async () => {
      const { patchOfflineSnapshot } = await import("@/lib/offline/snapshot-patch");
      setSnapshot({
        units: [
          { id: "row-abc", projectId: "proj-1", scopeStatus: "NOT_STARTED", scopeStage: null },
          { id: "row-xyz", projectId: "proj-1", scopeStatus: "NOT_STARTED", scopeStage: null },
        ],
      });

      const mutation = makeMutation({
        type: "unit-status",
        url: "/api/projects/proj-1/units/row-abc",
        method: "PATCH",
        body: { scopeStatus: "COMPLETE", scopeStage: "INSTALL" },
      });

      await patchOfflineSnapshot(mutation);

      const data = await getPatched();
      expect(data).not.toBeNull();
      const units = data!.units as Array<Record<string, unknown>>;
      const patched = units.find((u) => u.id === "row-abc");
      expect(patched?.scopeStatus).toBe("COMPLETE");
      expect(patched?.scopeStage).toBe("INSTALL");
      expect(patched?._pendingSync).toBe(true);

      // Unrelated row is untouched
      const other = units.find((u) => u.id === "row-xyz");
      expect(other?.scopeStatus).toBe("NOT_STARTED");
      expect(other?._pendingSync).toBeUndefined();
    });

    it("is a no-op when the rowId is not found in data.units", async () => {
      const { patchOfflineSnapshot } = await import("@/lib/offline/snapshot-patch");
      setSnapshot({ units: [{ id: "row-other", projectId: "proj-1", scopeStatus: "NOT_STARTED" }] });

      const mutation = makeMutation({
        type: "unit-status",
        url: "/api/projects/proj-1/units/row-MISSING",
        body: { scopeStatus: "COMPLETE" },
      });

      await patchOfflineSnapshot(mutation);
      expect(mockCachePut).not.toHaveBeenCalled();
    });
  });

  describe("create-issue", () => {
    it("appends a new optimistic issue with all required fields and _pendingSync: true", async () => {
      const { patchOfflineSnapshot } = await import("@/lib/offline/snapshot-patch");
      setSnapshot({ issues: [] });

      const mutation = makeMutation({
        id: "mut-issue-1",
        type: "create-issue",
        url: "/api/projects/proj-1/issues",
        method: "POST",
        body: {
          shortDescription: "Water leak",
          issueType: "PLUMBING",
          status: "OPEN",
          isBlockingWork: true,
          unitRef: "B1-L2-U3",
          responsibleParty: "General Contractor",
        },
      });

      await patchOfflineSnapshot(mutation);

      const data = await getPatched();
      const issues = data!.issues as Array<Record<string, unknown>>;
      expect(issues).toHaveLength(1);
      const issue = issues[0];
      expect(issue.id).toBe("mut-issue-1");
      expect(issue.projectId).toBe("proj-1");
      expect(issue.shortDescription).toBe("Water leak");
      expect(issue.issueType).toBe("PLUMBING");
      expect(issue.status).toBe("OPEN");
      expect(issue.isBlockingWork).toBe(true);
      expect(issue.unitRef).toBe("B1-L2-U3");
      expect(issue.responsibleParty).toBe("General Contractor");
      expect(issue._pendingSync).toBe(true);
      expect(typeof issue.createdAt).toBe("string");
      // Required UI fields present with safe defaults
      expect(Array.isArray(issue.attachments)).toBe(true);
      expect(Array.isArray(issue.scopeTags)).toBe(true);
      expect((issue._count as Record<string, number>).comments).toBe(0);
      expect((issue.createdBy as Record<string, unknown>).id).toBeDefined();
    });

    it("appends to existing issues without affecting them", async () => {
      const { patchOfflineSnapshot } = await import("@/lib/offline/snapshot-patch");
      setSnapshot({
        issues: [{ id: "existing-1", projectId: "proj-1", shortDescription: "Old issue" }],
      });

      const mutation = makeMutation({
        id: "mut-issue-2",
        type: "create-issue",
        url: "/api/projects/proj-1/issues",
        method: "POST",
        body: { shortDescription: "New issue", issueType: "GENERAL", status: "OPEN", isBlockingWork: false },
      });

      await patchOfflineSnapshot(mutation);

      const data = await getPatched();
      const issues = data!.issues as Array<Record<string, unknown>>;
      expect(issues).toHaveLength(2);
      expect(issues[0].id).toBe("existing-1");
      expect(issues[1].id).toBe("mut-issue-2");
      expect(issues[1]._pendingSync).toBe(true);
    });
  });

  describe("create-observation", () => {
    it("appends a new optimistic observation with all required fields and _pendingSync: true", async () => {
      const { patchOfflineSnapshot } = await import("@/lib/offline/snapshot-patch");
      setSnapshot({ observations: [] });

      const mutation = makeMutation({
        id: "mut-obs-1",
        type: "create-observation",
        url: "/api/projects/proj-1/observations",
        method: "POST",
        body: {
          title: "Crack in wall",
          description: "Near north window",
          observationType: "DEFICIENCY",
          unitRef: "B1-L1-U1",
        },
      });

      await patchOfflineSnapshot(mutation);

      const data = await getPatched();
      const obs = data!.observations as Array<Record<string, unknown>>;
      expect(obs).toHaveLength(1);
      const o = obs[0];
      expect(o.id).toBe("mut-obs-1");
      expect(o.title).toBe("Crack in wall");
      expect(o.description).toBe("Near north window");
      expect(o.observationType).toBe("DEFICIENCY");
      expect(o.unitRef).toBe("B1-L1-U1");
      expect(o._pendingSync).toBe(true);
      // Required UI fields present with safe defaults
      expect(Array.isArray(o.attachments)).toBe(true);
      expect((o._count as Record<string, number>).comments).toBe(0);
    });
  });

  describe("create-custom-site-location", () => {
    it("appends optimistic location to custom-site-locations module", async () => {
      const { patchOfflineSnapshot } = await import("@/lib/offline/snapshot-patch");
      setSnapshot({ "custom-site-locations": { "proj-1": [] } });

      const mutation = makeMutation({
        id: "mut-csl-1",
        type: "create-custom-site-location",
        url: "/api/projects/proj-1/custom-site-locations",
        method: "POST",
        actorUserId: "user-1",
        body: {
          name: "Loading Dock",
          placement: "standalone",
          building: "",
          level: "",
        },
      });

      await patchOfflineSnapshot(mutation);

      const data = await getPatched();
      const rows = (data!["custom-site-locations"] as Record<string, unknown[]>)["proj-1"];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "mut-csl-1",
        name: "Loading Dock",
        unitRef: "@custom|mut-csl-1|Loading Dock",
      });
    });
  });

  describe("add-comment", () => {
    it("is a no-op — comments are not stored in the snapshot", async () => {
      const { patchOfflineSnapshot } = await import("@/lib/offline/snapshot-patch");
      setSnapshot({ units: [], issues: [], observations: [] });

      const mutation = makeMutation({
        type: "add-comment",
        url: "/api/projects/proj-1/issues/issue-1/comments",
        method: "POST",
        body: { body: "Looks good" },
      });

      await patchOfflineSnapshot(mutation);
      expect(mockCachePut).not.toHaveBeenCalled();
    });
  });

  describe("project-notes", () => {
    it("create-project-note prepends an optimistic note", async () => {
      const { patchOfflineSnapshot } = await import("@/lib/offline/snapshot-patch");
      setSnapshot({ "project-notes": { "proj-1": [] } });

      const mutation = makeMutation({
        id: "offline-note-1",
        type: "create-project-note",
        url: "/api/projects/proj-1/notes",
        method: "POST",
        actorUserId: "user-1",
        body: { body: "Decision logged" },
      });

      await patchOfflineSnapshot(mutation);

      const data = await getPatched();
      const notes = (data!["project-notes"] as Record<string, Array<Record<string, unknown>>>)["proj-1"];
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({
        id: "offline-note-1",
        body: "Decision logged",
        _pendingSync: true,
      });
    });

    it("delete-project-note removes the note from snapshot", async () => {
      const { patchOfflineSnapshot } = await import("@/lib/offline/snapshot-patch");
      setSnapshot({
        "project-notes": {
          "proj-1": [
            {
              id: "note-1",
              body: "Gone",
              author: { id: "u1", name: "A", email: "a@test.com" },
              createdAt: "2026-07-17T12:00:00.000Z",
              editedAt: null,
              pinnedAt: null,
            },
          ],
        },
      });

      const mutation = makeMutation({
        type: "delete-project-note",
        url: "/api/projects/proj-1/notes/note-1",
        method: "DELETE",
        body: {},
      });

      await patchOfflineSnapshot(mutation);

      const data = await getPatched();
      const notes = (data!["project-notes"] as Record<string, unknown[]>)["proj-1"];
      expect(notes).toHaveLength(0);
    });

    it("pin-project-note sets pinnedAt on the snapshot note", async () => {
      const { patchOfflineSnapshot } = await import("@/lib/offline/snapshot-patch");
      setSnapshot({
        "project-notes": {
          "proj-1": [
            {
              id: "note-1",
              body: "Important",
              author: { id: "u1", name: "A", email: "a@test.com" },
              createdAt: "2026-07-17T12:00:00.000Z",
              editedAt: null,
              pinnedAt: null,
            },
          ],
        },
      });

      const mutation = makeMutation({
        type: "pin-project-note",
        url: "/api/projects/proj-1/notes/note-1",
        method: "PATCH",
        body: { pinned: true },
      });

      await patchOfflineSnapshot(mutation);

      const data = await getPatched();
      const notes = (data!["project-notes"] as Record<string, Array<Record<string, unknown>>>)["proj-1"];
      expect(notes[0].pinnedAt).toBeTruthy();
      expect(notes[0]._pendingSync).toBe(true);
    });
  });
});

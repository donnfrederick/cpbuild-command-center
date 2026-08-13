import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findSnapshotCacheKey,
  readSnapshotModule,
  readSnapshotUnitsForProject,
  SNAPSHOT_CACHE_NAME,
} from "@/lib/offline/snapshot-cache";

describe("snapshot-cache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("findSnapshotCacheKey prefers project-scoped snapshot URL", async () => {
    const globalReq = new Request("https://app/api/offline/snapshot");
    const scopedReq = new Request("https://app/api/offline/snapshot?projectIds=proj-a,proj-b");

    const mockCache = {
      keys: vi.fn().mockResolvedValue([globalReq, scopedReq]),
      match: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ generatedAt: "2026-06-12T12:00:00.000Z", data: {} }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    };
    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue(mockCache),
    });

    const key = await findSnapshotCacheKey("proj-b");
    expect(key?.url).toContain("projectIds=proj-a,proj-b");
  });

  it("findSnapshotCacheKey picks newest project-scoped snapshot for same project", async () => {
    const olderReq = new Request("https://app/api/offline/snapshot?projectIds=proj-a");
    const newerReq = new Request("https://app/api/offline/snapshot?projectIds=proj-a,proj-b");
    const match = vi.fn(async (req: Request) => {
      const generatedAt = req.url.includes("proj-b")
        ? "2026-06-15T12:00:00.000Z"
        : "2026-06-14T12:00:00.000Z";
      return new Response(JSON.stringify({ generatedAt, data: {} }), {
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({
        keys: vi.fn().mockResolvedValue([olderReq, newerReq]),
        match,
      }),
    });

    const key = await findSnapshotCacheKey("proj-a");
    expect(key?.url).toContain("proj-a,proj-b");
  });

  it("readSnapshotModule extracts module data", async () => {
    const snapshotReq = new Request("https://app/api/offline/snapshot?projectIds=proj-1");
    const payload = {
      generatedAt: "2026-06-12T12:00:00.000Z",
      data: { subcontractors: [{ id: "1", name: "Acme" }] },
    };

    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({
        keys: vi.fn().mockResolvedValue([snapshotReq]),
        match: vi.fn().mockResolvedValue(
          new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } }),
        ),
      }),
    });

    const result = await readSnapshotModule<Array<{ id: string; name: string }>>(
      "subcontractors",
      "proj-1",
    );
    expect(result?.data).toHaveLength(1);
    expect(result?.data[0]?.name).toBe("Acme");
    expect(result?.generatedAt).toBe("2026-06-12T12:00:00.000Z");
    expect(SNAPSHOT_CACHE_NAME).toBe("offline-data-v1");
  });

  it("findSnapshotCacheKey picks the newest snapshot when multiple exist", async () => {
    const olderReq = new Request("https://app/api/offline/snapshot?projectIds=proj-a");
    const newerReq = new Request("https://app/api/offline/snapshot?projectIds=proj-a,proj-b");
    const match = vi.fn(async (req: Request) => {
      if (req.url.includes("proj-a,proj-b")) {
        return new Response(
          JSON.stringify({ generatedAt: "2026-06-15T12:00:00.000Z", data: {} }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ generatedAt: "2026-06-14T12:00:00.000Z", data: {} }),
        { headers: { "Content-Type": "application/json" } },
      );
    });

    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({
        keys: vi.fn().mockResolvedValue([olderReq, newerReq]),
        match,
      }),
    });

    const key = await findSnapshotCacheKey();
    expect(key?.url).toContain("proj-a,proj-b");
  });

  it("readSnapshotUnitsForProject returns empty units when snapshot has none for project", async () => {
    const snapshotReq = new Request("https://app/api/offline/snapshot?projectIds=proj-1");
    const payload = {
      generatedAt: "2026-06-12T12:00:00.000Z",
      data: { units: [{ projectId: "other", id: "row-1" }] },
    };

    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({
        keys: vi.fn().mockResolvedValue([snapshotReq]),
        match: vi.fn().mockResolvedValue(
          new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } }),
        ),
      }),
    });

    const result = await readSnapshotUnitsForProject<{ projectId?: string; id: string }>("proj-1");
    expect(result).not.toBeNull();
    expect(result?.units).toEqual([]);
    expect(result?.generatedAt).toBe("2026-06-12T12:00:00.000Z");
  });
});

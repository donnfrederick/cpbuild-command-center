import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";

const mockReadSnapshot = vi.hoisted(() => vi.fn());
const mockEnqueueOffline = vi.hoisted(() => vi.fn());

vi.mock("@/lib/offline/snapshot-project-reads", () => ({
  readSnapshotCustomSiteLocations: (...args: unknown[]) => mockReadSnapshot(...args),
}));

vi.mock("@/lib/offline/custom-site-location-offline", () => ({
  enqueueCreateCustomSiteLocationOffline: (...args: unknown[]) => mockEnqueueOffline(...args),
  CustomSiteLocationOfflineDuplicateError: class CustomSiteLocationOfflineDuplicateError extends Error {
    name = "CustomSiteLocationOfflineDuplicateError";
  },
}));

import {
  createCustomSiteLocation,
  fetchCustomSiteLocations,
  updateCustomSiteLocation,
} from "@/lib/custom-site-locations-api";

const fixture: CustomSiteLocation = {
  id: "loc-1",
  projectId: "proj-1",
  name: "Loading Dock",
  building: "",
  level: "",
  placement: "standalone",
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: { id: "u1", name: "Tester" },
  unitRef: "@custom|loc-1|Loading Dock",
  observationCount: 0,
  issueCount: 0,
};

describe("fetchCustomSiteLocations()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadSnapshot.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns live API data when fetch succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ locations: [fixture] }),
      }),
    );

    const rows = await fetchCustomSiteLocations("proj-1");
    expect(rows).toEqual([fixture]);
    expect(mockReadSnapshot).not.toHaveBeenCalled();
  });

  it("falls back to snapshot when fetch fails offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    mockReadSnapshot.mockResolvedValue({
      data: [fixture],
      generatedAt: "2026-06-27T00:00:00.000Z",
    });

    const rows = await fetchCustomSiteLocations("proj-1");
    expect(rows).toEqual([fixture]);
    expect(mockReadSnapshot).toHaveBeenCalledWith("proj-1");
  });

  it("falls back to snapshot when API returns non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "offline" }) }),
    );
    mockReadSnapshot.mockResolvedValue({
      data: [fixture],
      generatedAt: "2026-06-27T00:00:00.000Z",
    });

    const rows = await fetchCustomSiteLocations("proj-1");
    expect(rows).toEqual([fixture]);
  });
});

describe("updateCustomSiteLocation()", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes the correct endpoint and returns the updated location", async () => {
    const updated: CustomSiteLocation = {
      ...fixture,
      name: "Renamed Dock",
      placement: "building",
      building: "Tower A",
      unitRef: "@custom|loc-1|Renamed Dock",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ location: updated }),
      }),
    );

    const result = await updateCustomSiteLocation("proj-1", "loc-1", {
      name: "Renamed Dock",
      placement: "building",
      building: "Tower A",
    });

    const mockFetch = vi.mocked(globalThis.fetch);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/projects/proj-1/custom-site-locations/loc-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(result.name).toBe("Renamed Dock");
  });

  it("throws CustomSiteLocationApiError with duplicate_name code on 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: "A custom location with this name already exists",
            code: "duplicate_name",
          }),
      }),
    );

    await expect(
      updateCustomSiteLocation("proj-1", "loc-1", {
        name: "Existing Name",
        placement: "standalone",
      }),
    ).rejects.toMatchObject({ code: "duplicate_name" });
  });
});

describe("createCustomSiteLocation()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueOffline.mockResolvedValue({
      ...fixture,
      id: "offline-mut-1",
      name: "New Dock",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("enqueues offline when navigator.onLine is false", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    const created = await createCustomSiteLocation(
      "proj-1",
      { name: "New Dock", placement: "standalone" },
      { actorUserId: "u1" },
    );

    expect(mockEnqueueOffline).toHaveBeenCalledWith(
      "proj-1",
      { name: "New Dock", placement: "standalone" },
      "u1",
    );
    expect(created.id).toBe("offline-mut-1");
  });

  it("POSTs online when navigator.onLine is true", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ location: fixture }),
      }),
    );

    const created = await createCustomSiteLocation("proj-1", {
      name: "Loading Dock",
      placement: "standalone",
    });

    expect(mockEnqueueOffline).not.toHaveBeenCalled();
    expect(created).toEqual(fixture);
  });
});

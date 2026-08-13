import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readSnapshotCustomSiteLocations: vi.fn(),
  getPendingMutations: vi.fn(),
  enqueueMutation: vi.fn(),
}));

vi.mock("@/lib/offline/snapshot-project-reads", () => ({
  readSnapshotCustomSiteLocations: mocks.readSnapshotCustomSiteLocations,
}));

vi.mock("@/lib/offline/mutation-queue", () => ({
  enqueueMutation: mocks.enqueueMutation,
  getPendingMutations: mocks.getPendingMutations,
}));

import {
  buildOptimisticCustomSiteLocation,
  enqueueCreateCustomSiteLocationOffline,
  isCustomSiteLocationNameTakenOffline,
  CustomSiteLocationOfflineDuplicateError,
} from "@/lib/offline/custom-site-location-offline";

describe("custom-site-location-offline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readSnapshotCustomSiteLocations.mockResolvedValue(null);
    mocks.getPendingMutations.mockResolvedValue([]);
    mocks.enqueueMutation.mockResolvedValue(undefined);
  });

  it("buildOptimisticCustomSiteLocation uses mutation id in unitRef", () => {
    const loc = buildOptimisticCustomSiteLocation(
      "proj-1",
      "mut-abc",
      { name: "Dock A", placement: "standalone" },
      Date.now(),
      "user-1",
    );
    expect(loc.id).toBe("mut-abc");
    expect(loc.unitRef).toBe("@custom|mut-abc|Dock A");
    expect(loc.createdBy.id).toBe("user-1");
  });

  it("isCustomSiteLocationNameTakenOffline checks snapshot names case-insensitively", async () => {
    mocks.readSnapshotCustomSiteLocations.mockResolvedValue({
      data: [
        {
          id: "loc-1",
          projectId: "proj-1",
          name: "Loading Dock",
          building: "",
          level: "",
          placement: "standalone",
          sortOrder: 0,
          createdAt: "",
          updatedAt: "",
          createdBy: { id: "u1", name: null },
          unitRef: "@custom|loc-1|Loading Dock",
          observationCount: 0,
          issueCount: 0,
        },
      ],
      generatedAt: null,
    });

    expect(await isCustomSiteLocationNameTakenOffline("proj-1", {
      name: "loading dock",
      placement: "standalone",
    })).toBe(true);
    expect(await isCustomSiteLocationNameTakenOffline("proj-1", {
      name: "Parking",
      placement: "standalone",
    })).toBe(false);
  });

  it("isCustomSiteLocationNameTakenOffline allows the same name in a different scope", async () => {
    mocks.readSnapshotCustomSiteLocations.mockResolvedValue({
      data: [
        {
          id: "loc-1",
          projectId: "proj-1",
          name: "Parking Lot",
          building: "",
          level: "",
          placement: "standalone",
          sortOrder: 0,
          createdAt: "",
          updatedAt: "",
          createdBy: { id: "u1", name: null },
          unitRef: "@custom|loc-1|Parking Lot",
          observationCount: 0,
          issueCount: 0,
        },
      ],
      generatedAt: null,
    });

    expect(
      await isCustomSiteLocationNameTakenOffline("proj-1", {
        name: "Parking Lot",
        placement: "building",
        building: "5A",
      }),
    ).toBe(false);
  });

  it("isCustomSiteLocationNameTakenOffline allows similar-prefix names in the same scope", async () => {
    mocks.readSnapshotCustomSiteLocations.mockResolvedValue({
      data: [
        {
          id: "loc-1",
          projectId: "proj-1",
          name: "Building B Level One",
          building: "Building B",
          level: "Level One",
          placement: "building_level",
          sortOrder: 0,
          createdAt: "",
          updatedAt: "",
          createdBy: { id: "u1", name: null },
          unitRef: "@custom|loc-1|Building B Level One",
          observationCount: 0,
          issueCount: 0,
        },
      ],
      generatedAt: null,
    });

    expect(
      await isCustomSiteLocationNameTakenOffline("proj-1", {
        name: "Building B Level Two",
        placement: "building_level",
        building: "Building B",
        level: "Level One",
      }),
    ).toBe(false);
  });

  it("enqueueCreateCustomSiteLocationOffline queues mutation and returns optimistic row", async () => {
    const created = await enqueueCreateCustomSiteLocationOffline(
      "proj-1",
      { name: "Dock B", placement: "building", building: "North" },
      "user-2",
    );

    expect(mocks.enqueueMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: created.id,
        type: "create-custom-site-location",
        url: "/api/projects/proj-1/custom-site-locations",
        method: "POST",
        actorUserId: "user-2",
        body: expect.objectContaining({
          name: "Dock B",
          placement: "building",
          building: "North",
        }),
      }),
    );
    expect(created.name).toBe("Dock B");
    expect(created.placement).toBe("building");
  });

  it("enqueueCreateCustomSiteLocationOffline rejects duplicate pending names", async () => {
    mocks.getPendingMutations.mockResolvedValue([
      {
        id: "pending-1",
        type: "create-custom-site-location",
        url: "/api/projects/proj-1/custom-site-locations",
        method: "POST",
        body: { name: "Dock B", placement: "standalone" },
        attempts: 0,
        queuedAt: Date.now(),
      },
    ]);

    await expect(
      enqueueCreateCustomSiteLocationOffline("proj-1", {
        name: "dock b",
        placement: "standalone",
      }),
    ).rejects.toBeInstanceOf(CustomSiteLocationOfflineDuplicateError);
    expect(mocks.enqueueMutation).not.toHaveBeenCalled();
  });
});

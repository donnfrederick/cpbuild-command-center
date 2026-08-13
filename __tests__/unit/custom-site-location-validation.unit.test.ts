import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CustomSitePlacement } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  db: {
    projectRow: { findFirst: vi.fn() },
    projectCustomSiteLocation: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import {
  customSiteLocationNameTaken,
  validateCustomSiteLocationScope,
  type CustomSiteLocationNameScope,
} from "@/lib/custom-site-location-validation";

const PROJECT = "proj-validation";
const STANDALONE: CustomSiteLocationNameScope = {
  placement: "standalone",
  building: "",
  level: "",
};
const BUILDING_5A: CustomSiteLocationNameScope = {
  placement: "building",
  building: "5A",
  level: "",
};

describe("validateCustomSiteLocationScope()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts standalone with empty building and level", async () => {
    const result = await validateCustomSiteLocationScope(PROJECT, "standalone", "", "");
    expect(result).toEqual({ ok: true });
    expect(db.projectRow.findFirst).not.toHaveBeenCalled();
  });

  it("rejects standalone when building or level is provided", async () => {
    const result = await validateCustomSiteLocationScope(PROJECT, "standalone", "Tower A", "");
    expect(result.ok).toBe(false);
  });

  it("rejects building placement without building name", async () => {
    const result = await validateCustomSiteLocationScope(PROJECT, "building", "", "");
    expect(result).toEqual({ ok: false, error: "Building is required" });
  });

  it("rejects building placement when building is not in UPM rows", async () => {
    vi.mocked(db.projectRow.findFirst).mockResolvedValue(null);
    const result = await validateCustomSiteLocationScope(PROJECT, "building", "Tower A", "");
    expect(result).toEqual({ ok: false, error: "Building not found in Location Builder data" });
  });

  it("accepts building placement when building exists", async () => {
    vi.mocked(db.projectRow.findFirst).mockResolvedValue({ id: "row-1" } as never);
    const result = await validateCustomSiteLocationScope(PROJECT, "building", "Tower A", "");
    expect(result).toEqual({ ok: true });
  });

  it("rejects building_level without level", async () => {
    vi.mocked(db.projectRow.findFirst).mockResolvedValue({ id: "row-1" } as never);
    const result = await validateCustomSiteLocationScope(PROJECT, "building_level", "Tower A", "");
    expect(result).toEqual({ ok: false, error: "Level is required" });
  });

  it("rejects building_level when level is not in UPM rows", async () => {
    vi.mocked(db.projectRow.findFirst)
      .mockResolvedValueOnce({ id: "row-1" } as never)
      .mockResolvedValueOnce(null);
    const result = await validateCustomSiteLocationScope(
      PROJECT,
      "building_level",
      "Tower A",
      "L2",
    );
    expect(result).toEqual({ ok: false, error: "Level not found for this building" });
  });

  it("accepts building_level when building and level exist", async () => {
    vi.mocked(db.projectRow.findFirst).mockResolvedValue({ id: "row-1" } as never);
    const result = await validateCustomSiteLocationScope(
      PROJECT,
      "building_level",
      "Tower A",
      "L2",
    );
    expect(result).toEqual({ ok: true });
  });
});

describe("customSiteLocationNameTaken()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for empty name", async () => {
    expect(await customSiteLocationNameTaken(PROJECT, "   ", STANDALONE)).toBe(false);
    expect(db.projectCustomSiteLocation.findMany).not.toHaveBeenCalled();
  });

  it("returns true when an exact case-insensitive match exists in the same scope", async () => {
    vi.mocked(db.projectCustomSiteLocation.findMany).mockResolvedValue([
      { name: "Parking Lot" },
    ] as never);
    expect(await customSiteLocationNameTaken(PROJECT, "parking lot", STANDALONE)).toBe(true);
    expect(db.projectCustomSiteLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: PROJECT,
          placement: "standalone",
          building: "",
          level: "",
        },
        select: { name: true },
      }),
    );
  });

  it("returns true when names match after whitespace normalization in the same scope", async () => {
    vi.mocked(db.projectCustomSiteLocation.findMany).mockResolvedValue([
      { name: "Building B Level One" },
    ] as never);
    const scope: CustomSiteLocationNameScope = {
      placement: "building_level",
      building: "Building B",
      level: "Level One",
    };
    expect(
      await customSiteLocationNameTaken(PROJECT, "  building b   level one  ", scope),
    ).toBe(true);
  });

  it("returns false for similar-prefix names in the same scope (FT-0084)", async () => {
    vi.mocked(db.projectCustomSiteLocation.findMany).mockResolvedValue([
      { name: "Building B Level One" },
    ] as never);
    const scope: CustomSiteLocationNameScope = {
      placement: "building_level",
      building: "Building B",
      level: "Level One",
    };
    expect(await customSiteLocationNameTaken(PROJECT, "Building B Level Two", scope)).toBe(false);
  });

  it("allows the same name in a different scope (FT-0084 Parking Lot scenario)", async () => {
    vi.mocked(db.projectCustomSiteLocation.findMany).mockResolvedValue([] as never);
    expect(await customSiteLocationNameTaken(PROJECT, "Parking Lot", BUILDING_5A)).toBe(false);
    expect(db.projectCustomSiteLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: PROJECT,
          placement: "building",
          building: "5A",
          level: "",
        },
      }),
    );
  });

  it("excludes the current location id when editing", async () => {
    vi.mocked(db.projectCustomSiteLocation.findMany).mockResolvedValue([] as never);
    expect(
      await customSiteLocationNameTaken(PROJECT, "Roof deck", BUILDING_5A, "loc-self"),
    ).toBe(false);
    expect(db.projectCustomSiteLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: PROJECT,
          placement: "building",
          building: "5A",
          level: "",
          NOT: { id: "loc-self" },
        },
      }),
    );
  });
});

describe("validateCustomSiteLocationScope placement exhaustiveness", () => {
  it("covers all CustomSitePlacement enum values without throwing", async () => {
    vi.mocked(db.projectRow.findFirst).mockResolvedValue({ id: "row-1" } as never);
    const placements: CustomSitePlacement[] = ["standalone", "building", "building_level"];
    for (const placement of placements) {
      const result = await validateCustomSiteLocationScope(
        PROJECT,
        placement,
        placement === "standalone" ? "" : "Tower A",
        placement === "building_level" ? "L1" : "",
      );
      expect(result.ok).toBe(true);
    }
  });
});

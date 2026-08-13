import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    projectRow: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/unifier/subcontractors", () => ({
  getSubcontractorsForPicker: vi.fn(),
}));

import { db } from "@/lib/db";
import { getSubcontractorsForPicker } from "@/lib/unifier/subcontractors";
import { hydrateSubcontractorActivityMetadata } from "@/lib/activity-subcontractor-metadata";

describe("hydrateSubcontractorActivityMetadata()", () => {
  beforeEach(() => {
    vi.mocked(db.projectRow.findMany).mockReset();
    vi.mocked(getSubcontractorsForPicker).mockReset();
  });

  it("fills missing subcontractor name from row state and normalizes legacy UPM events", async () => {
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      { id: "row-1", unifierSubId: "sub-acme" },
    ]);
    vi.mocked(getSubcontractorsForPicker).mockResolvedValue([
      { id: "sub-acme", name: "Acme Cabinetry LLC" },
    ]);

    const events = [
      {
        eventType: "UPM_ROW_UPDATED" as const,
        metadata: {
          rowId: "row-1",
          scopeName: "Cabinetry",
          changedFields: ["unifierSubId"],
        },
      },
    ];

    const hydrated = await hydrateSubcontractorActivityMetadata(events);
    expect(hydrated[0].eventType).toBe("SCOPE_SUBCONTRACTOR_UPDATED");
    expect(hydrated[0].metadata).toMatchObject({
      subcontractorName: "Acme Cabinetry LLC",
      toUnifierSubId: "sub-acme",
    });
  });

  it("leaves events unchanged when subcontractor name is already stored", async () => {
    const events = [
      {
        eventType: "SCOPE_SUBCONTRACTOR_UPDATED" as const,
        metadata: {
          rowId: "row-1",
          subcontractorName: "Acme Cabinetry LLC",
          toUnifierSubId: "sub-acme",
        },
      },
    ];

    const hydrated = await hydrateSubcontractorActivityMetadata(events);
    expect(hydrated).toEqual(events);
    expect(db.projectRow.findMany).not.toHaveBeenCalled();
  });

  it("sets toUnifierSubId to null when row has no subcontractor assigned", async () => {
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      { id: "row-1", unifierSubId: null },
    ]);
    vi.mocked(getSubcontractorsForPicker).mockResolvedValue([]);

    const events = [
      {
        eventType: "UPM_ROW_UPDATED" as const,
        metadata: {
          rowId: "row-1",
          changedFields: ["unifierSubId"],
        },
      },
    ];

    const hydrated = await hydrateSubcontractorActivityMetadata(events);
    expect(hydrated[0].metadata).toMatchObject({
      toUnifierSubId: null,
      subcontractorName: "Unassigned",
    });
  });
});

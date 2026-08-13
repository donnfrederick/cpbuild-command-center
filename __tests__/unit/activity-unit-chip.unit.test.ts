import { describe, it, expect } from "vitest";
import { activityLocationChipParts, activityScopeDescriptionText, formatActivityActor, scopeNameInLocationChip } from "@/lib/activity-unit-chip";

describe("activityLocationChipParts()", () => {
  it("includes scope name after unit location", () => {
    expect(
      activityLocationChipParts({
        building: "North",
        level: "2",
        unit: "N208",
        scopeName: "Cabinetry",
      }),
    ).toEqual(["North", "2", "N208", "Cabinetry"]);
  });
});

describe("scopeNameInLocationChip()", () => {
  it("returns true when scopeName is part of the chip", () => {
    expect(
      scopeNameInLocationChip({
        building: "North",
        level: "2",
        unit: "N208",
        scopeName: "Cabinetry",
      }),
    ).toBe(true);
  });

  it("returns false when scopeName is present without unit location", () => {
    expect(scopeNameInLocationChip({ scopeName: "Cabinetry" })).toBe(false);
  });
});

describe("activityScopeDescriptionText()", () => {
  it("returns empty when scope is on the location chip", () => {
    expect(
      activityScopeDescriptionText({
        building: "North",
        level: "2",
        unit: "N208",
        scopeName: "Cabinetry",
      }),
    ).toBe("");
  });
});

describe("formatActivityActor()", () => {
  it("prefers the viewer display name for their own events over a stale stored userName", () => {
    expect(
      formatActivityActor(
        { userId: "dev-user", userName: "Hannah Farr", metadata: {} },
        "dev-user",
        "Pending sync",
        "Phil Salter",
      ),
    ).toBe("Phil Salter");
  });

  it('returns "You" when userId matches and no viewer display name is provided', () => {
    expect(
      formatActivityActor(
        { userId: "dev-user", userName: "Hannah Farr", metadata: {} },
        "dev-user",
      ),
    ).toBe("You");
  });

  it('returns "You" when userId matches and no userName is stored', () => {
    expect(
      formatActivityActor(
        { userId: "u1", userName: null, metadata: {} },
        "u1",
      ),
    ).toBe("You");
  });

  it("falls back to userName for other actors", () => {
    expect(
      formatActivityActor(
        { userId: "u2", userName: "Hannah Farr", metadata: {} },
        "u1",
      ),
    ).toBe("Hannah Farr");
  });
});

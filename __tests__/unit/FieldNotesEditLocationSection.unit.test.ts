import { describe, expect, it } from "vitest";
import {
  fieldNotesEditLocationFromRecord,
  unitRefFromEditLocation,
} from "@/components/projects/FieldNotesEditLocationSection";

describe("unitRefFromEditLocation()", () => {
  const customRef = "@custom|loc-1|Exterior Photos";

  it("preserves custom site unitRef instead of rebuilding as ||", () => {
    const state = fieldNotesEditLocationFromRecord(customRef, []);
    expect(state.unit).toBe("");
    expect(unitRefFromEditLocation(state)).toBe("||");
    expect(unitRefFromEditLocation(state, customRef)).toBe(customRef);
  });

  it("still builds UPM unit refs when source is not custom", () => {
    const state = fieldNotesEditLocationFromRecord("North|L0|N010", []);
    expect(unitRefFromEditLocation(state, "North|L0|N010")).toBe("North|L0|N010");
  });
});

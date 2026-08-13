import { describe, it, expect } from "vitest";
import { canEditObservation } from "@/lib/offline/observation-edit-eligibility";

describe("canEditObservation", () => {
  it("returns true for pending sync observations on device", () => {
    expect(
      canEditObservation(
        { author: { id: "" }, _pendingSync: true },
        "user-1",
      ),
    ).toBe(true);
  });

  it("returns true when author id matches current user", () => {
    expect(
      canEditObservation({ author: { id: "user-1" } }, "user-1"),
    ).toBe(true);
  });

  it("returns false for another user's synced observation", () => {
    expect(
      canEditObservation({ author: { id: "other" } }, "user-1"),
    ).toBe(false);
  });
});

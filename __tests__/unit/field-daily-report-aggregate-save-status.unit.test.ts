import { describe, expect, it } from "vitest";
import { aggregateFieldDailySaveStatus } from "@/lib/field-daily-report/aggregate-save-status";

describe("aggregateFieldDailySaveStatus", () => {
  it("returns idle when no sections are tracked", () => {
    expect(aggregateFieldDailySaveStatus([])).toBe("idle");
  });

  it("prioritizes error over saving and saved", () => {
    expect(aggregateFieldDailySaveStatus(["saved", "error", "saving"])).toBe("error");
  });

  it("returns saving when any section is dirty or saving", () => {
    expect(aggregateFieldDailySaveStatus(["idle", "dirty"])).toBe("saving");
    expect(aggregateFieldDailySaveStatus(["saved", "saving"])).toBe("saving");
  });

  it("returns saved when at least one section saved and none are in flight", () => {
    expect(aggregateFieldDailySaveStatus(["idle", "saved"])).toBe("saved");
  });
});

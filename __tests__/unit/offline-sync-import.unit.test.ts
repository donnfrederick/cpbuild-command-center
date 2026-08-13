/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { useInspectionSync } from "@/lib/inspections/useInspectionSync";

describe("useInspectionSync export", () => {
  it("is a function", () => {
    expect(typeof useInspectionSync).toBe("function");
  });
});

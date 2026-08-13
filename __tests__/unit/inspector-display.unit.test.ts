import { describe, expect, it } from "vitest";
import { resolveInspectorId, resolveInspectorName } from "@/lib/inspections/inspector-display";

describe("resolveInspectorName()", () => {
  it("returns trimmed User name from clearInspection join", () => {
    expect(
      resolveInspectorName({
        inspectedBy: { name: "  Pat Inspector  " },
      }),
    ).toBe("Pat Inspector");
  });

  it("returns fallback when join is missing", () => {
    expect(resolveInspectorName(null)).toBe("—");
    expect(resolveInspectorName(undefined, "Unknown")).toBe("Unknown");
  });
});

describe("resolveInspectorId()", () => {
  it("prefers inspectedBy.id over inspectedById column", () => {
    expect(
      resolveInspectorId({
        inspectedById: "col-id",
        inspectedBy: { id: "join-id" },
      }),
    ).toBe("join-id");
  });

  it("falls back to inspectedById when join is absent", () => {
    expect(resolveInspectorId({ inspectedById: "col-id", inspectedBy: null })).toBe("col-id");
  });
});

import { describe, it, expect, vi } from "vitest";
import { scopeRefKeysFromRowIds } from "@/lib/field-notes/scope-ref-keys";

describe("scopeRefKeysFromRowIds", () => {
  it("returns durable full row keys for resolved rows", async () => {
    const db = {
      projectRow: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "r1",
            building: "A",
            level: "1",
            unit: "101",
            description: "Floor",
          },
        ]),
      },
    };

    const keys = await scopeRefKeysFromRowIds(db as never, "p1", ["r1"]);
    expect(keys).toEqual(["a|1|101|floor"]);
  });

  it("deduplicates keys when multiple row ids map to same scope", async () => {
    const db = {
      projectRow: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "r1",
            building: "A",
            level: "1",
            unit: "101",
            description: "Floor",
          },
          {
            id: "r2",
            building: "A",
            level: "1",
            unit: "101",
            description: "Floor",
          },
        ]),
      },
    };

    const keys = await scopeRefKeysFromRowIds(db as never, "p1", ["r1", "r2"]);
    expect(keys).toEqual(["a|1|101|floor"]);
  });

  it("throws when a row id is missing from the project", async () => {
    const db = {
      projectRow: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    await expect(scopeRefKeysFromRowIds(db as never, "p1", ["missing"])).rejects.toThrow(
      "SCOPE_ROWS_NOT_FOUND",
    );
  });

  it("returns empty array for empty row id list", async () => {
    const db = {
      projectRow: {
        findMany: vi.fn(),
      },
    };

    const keys = await scopeRefKeysFromRowIds(db as never, "p1", []);
    expect(keys).toEqual([]);
    expect(db.projectRow.findMany).not.toHaveBeenCalled();
  });
});

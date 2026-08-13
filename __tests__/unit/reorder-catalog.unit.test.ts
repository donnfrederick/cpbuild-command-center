import { describe, it, expect } from "vitest";
import {
  assignSequentialSortOrders,
  catalogItemsNeedingSortPatch,
  reorderByIndex,
} from "@/lib/project-settings/reorder-catalog";

describe("reorderByIndex()", () => {
  it("moves an item from one index to another", () => {
    expect(reorderByIndex(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("returns the same array when from equals to", () => {
    expect(reorderByIndex(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("assignSequentialSortOrders()", () => {
  it("assigns 10, 20, 30 sort orders", () => {
    const result = assignSequentialSortOrders([
      { code: "A", sortOrder: 99 },
      { code: "B", sortOrder: 1 },
    ]);
    expect(result).toEqual([
      { code: "A", sortOrder: 10 },
      { code: "B", sortOrder: 20 },
    ]);
  });
});

describe("catalogItemsNeedingSortPatch()", () => {
  it("returns only items whose sortOrder changed", () => {
    const before = [
      { code: "A", sortOrder: 10 },
      { code: "B", sortOrder: 20 },
    ];
    const after = [
      { code: "A", sortOrder: 20 },
      { code: "B", sortOrder: 10 },
    ];
    expect(catalogItemsNeedingSortPatch(before, after).map((item) => item.code)).toEqual(["A", "B"]);
  });
});

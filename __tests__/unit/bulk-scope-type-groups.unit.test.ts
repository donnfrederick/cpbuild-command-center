import { describe, expect, it } from "vitest";
import { computeBulkScopeTypeGroups } from "@/lib/bulk-scope-type-groups";

describe("computeBulkScopeTypeGroups()", () => {
  it("counts distinct units per type, not duplicate rows in the same unit", () => {
    const u200 = "B|2|200";
    const u219 = "B|2|219";
    const cou = "st-cou";
    const rows = [
      {
        unitKey: u200,
        scopeTypeId: cou,
        scopeTypeName: "Countertop",
        canonicalScopeTypeId: "canon-cou",
        canonicalDisplayName: "Countertop",
        subScopes: [],
      },
      {
        unitKey: u200,
        scopeTypeId: cou,
        scopeTypeName: "Countertop",
        canonicalScopeTypeId: "canon-cou",
        canonicalDisplayName: "Countertop",
        subScopes: [],
      },
      {
        unitKey: u219,
        scopeTypeId: cou,
        scopeTypeName: "Countertop",
        canonicalScopeTypeId: "canon-cou",
        canonicalDisplayName: "Countertop",
        subScopes: [],
      },
      {
        unitKey: "B|2|221",
        scopeTypeId: cou,
        scopeTypeName: "Countertop",
        canonicalScopeTypeId: "canon-cou",
        canonicalDisplayName: "Countertop",
        subScopes: [],
      },
    ];
    const groups = computeBulkScopeTypeGroups(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.unitCount).toBe(3);
  });

  it("returns one group per canonical type with correct unit totals", () => {
    const rows = [
      {
        unitKey: "a|1|1",
        scopeTypeId: "t1",
        scopeTypeName: "A",
        canonicalScopeTypeId: "c1",
        canonicalDisplayName: "Alpha",
        subScopes: [],
      },
      {
        unitKey: "a|1|2",
        scopeTypeId: "t1",
        scopeTypeName: "A",
        canonicalScopeTypeId: "c1",
        canonicalDisplayName: "Alpha",
        subScopes: [],
      },
    ];
    const groups = computeBulkScopeTypeGroups(rows);
    expect(groups[0]!.unitCount).toBe(2);
  });
});

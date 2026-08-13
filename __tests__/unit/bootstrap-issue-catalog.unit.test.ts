import { describe, it, expect } from "vitest";
import {
  ISSUE_TYPE_CATALOG_DEFINITIONS,
  RESPONSIBLE_PARTY_CATALOG_DEFINITIONS,
} from "@/lib/issues/issue-catalog-definitions";

describe("bootstrap issue catalog definitions", () => {
  it("includes UN-0047 issue types MATERIAL_IN_THE_WAY and OTHER_TRADES_OBSTRUCTION", () => {
    const codes = ISSUE_TYPE_CATALOG_DEFINITIONS.map((row) => row.code);
    expect(codes).toContain("MATERIAL_IN_THE_WAY");
    expect(codes).toContain("OTHER_TRADES_OBSTRUCTION");
  });

  it("includes legacy issue types and responsible parties", () => {
    const typeCodes = ISSUE_TYPE_CATALOG_DEFINITIONS.map((row) => row.code);
    expect(typeCodes).toContain("SUBSTRATE_CONDITION");
    expect(typeCodes).toContain("OTHER");

    const partyCodes = RESPONSIBLE_PARTY_CATALOG_DEFINITIONS.map((row) => row.code);
    expect(partyCodes).toContain("CP_BUILD");
    expect(partyCodes).toContain("LOW_VOLTAGE");
  });

  it("marks visual-required types in seed data", () => {
    const damaged = ISSUE_TYPE_CATALOG_DEFINITIONS.find((r) => r.code === "DAMAGED_MATERIALS");
    const trade = ISSUE_TYPE_CATALOG_DEFINITIONS.find((r) => r.code === "TRADE_DAMAGE_REPAIR");
    expect(damaged?.requiresVisual).toBe(true);
    expect(trade?.requiresVisual).toBe(true);
  });
});

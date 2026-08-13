/**
 * Unit tests for the unlinked scope type detection logic in insertProjectRows.
 *
 * The function inserts project rows in bulk and then queries for any scope_types
 * from the upload that have no canonical_scope_type_id. The detection is independent
 * of whether the scope type row was newly created or already existed — it only matters
 * whether it has a canonical link.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { insertProjectRows } from "@/lib/project-rows";

// We test the logic by creating a minimal mock TxClient that mirrors the real DB calls.

type MockTxClient = {
  $executeRawUnsafe: ReturnType<typeof vi.fn>;
  $queryRawUnsafe: ReturnType<typeof vi.fn>;
};

function makeMockTx(
  unlinked: Array<{ id: string; rawCode: string }> = []
): MockTxClient {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    // First calls will be the scope_type upsert (returns [{ id }]); last call is the unlinked check.
    $queryRawUnsafe: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("canonical_scope_type_id IS NULL")) {
        return Promise.resolve(unlinked);
      }
      return Promise.resolve([{ id: "lookup-id" }]);
    }),
  };
}

// Minimal spreadsheet row — only needs the fields mapRowToColumns reads.
function makeRow(scopeType = "Cabinetry"): Record<string, string> {
  return {
    "Scope Type": scopeType,
    Building: "A",
    Level: "1",
    "Unit #": "101",
    Area: "Kitchen",
    "Ship Phase": "1",
    "Build Phase": "1",
    Scheme: "S1",
    "Unit Type": "2BD",
    Description: "Cabinet install",
    "CSI Prime": "06",
    "CSI Detail": "06.40",
    Location: "INT",
    "Cost Type": "LABOR",
    Installer: "Team A",
    QTY: "10",
    UOM: "EA",
    "Unit Rate": "100",
    "Budgeted Man Hours": "5",
    "Start Date": "",
    "Finish Date": "",
    "% Complete": "0",
    "Actual Man Hours": "0",
  };
}

describe("insertProjectRows — unlinked scope type detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty unlinkedScopeTypes when all scopes are linked", async () => {
    const tx = makeMockTx([]);
    const result = await insertProjectRows(tx as never, "proj-1", [makeRow("Cabinetry")], 0);
    expect(result.unlinkedScopeTypes).toEqual([]);
  });

  it("returns unlinked scope types when a scope has no canonical link", async () => {
    const unlinked = [{ id: "st-new", rawCode: "BrandNewScope" }];
    const tx = makeMockTx(unlinked);
    const result = await insertProjectRows(tx as never, "proj-1", [makeRow("BrandNewScope")], 0);
    expect(result.unlinkedScopeTypes).toHaveLength(1);
    expect(result.unlinkedScopeTypes[0].rawCode).toBe("BrandNewScope");
    expect(result.unlinkedScopeTypes[0].id).toBe("st-new");
  });

  it("returns empty unlinkedScopeTypes when rows array is empty", async () => {
    const tx = makeMockTx([]);
    const result = await insertProjectRows(tx as never, "proj-1", [], 0);
    expect(result.unlinkedScopeTypes).toEqual([]);
    // No unlinked check should be made when there are no scope codes
    const unlinkedCheckCalls = (tx.$queryRawUnsafe.mock.calls as string[][]).filter(
      ([sql]) => typeof sql === "string" && sql.includes("canonical_scope_type_id IS NULL")
    );
    expect(unlinkedCheckCalls.length).toBe(0);
  });

  it("deduplicates — same scope type in many rows results in one unlinked check query", async () => {
    const tx = makeMockTx([]);
    const rows = [makeRow("Cabinetry"), makeRow("Cabinetry"), makeRow("Cabinetry")];
    await insertProjectRows(tx as never, "proj-1", rows, 0);

    // The unlinked check query should fire exactly once (scope codes are cached)
    const unlinkedCheckCalls = (tx.$queryRawUnsafe.mock.calls as string[][]).filter(
      ([sql]) => typeof sql === "string" && sql.includes("canonical_scope_type_id IS NULL")
    );
    expect(unlinkedCheckCalls.length).toBe(1);
    // The query parameters should contain "Cabinetry" exactly once (deduplicated)
    const [, ...params] = unlinkedCheckCalls[0];
    expect(params).toEqual(["Cabinetry"]);
  });

  it("returns multiple unlinked scope types from a mixed upload", async () => {
    const unlinked = [
      { id: "st-1", rawCode: "NewScopeA" },
      { id: "st-2", rawCode: "NewScopeB" },
    ];
    const tx = makeMockTx(unlinked);
    const rows = [makeRow("NewScopeA"), makeRow("NewScopeB"), makeRow("Cabinetry")];
    const result = await insertProjectRows(tx as never, "proj-1", rows, 0);
    expect(result.unlinkedScopeTypes).toHaveLength(2);
    const codes = result.unlinkedScopeTypes.map((u) => u.rawCode).sort();
    expect(codes).toEqual(["NewScopeA", "NewScopeB"]);
  });

  it("skips blank scope type codes — empty string is excluded from unlinked check", async () => {
    const tx = makeMockTx([]);
    const rowWithNoScope: Record<string, string> = { ...makeRow(""), "Scope Type": "" };
    await insertProjectRows(tx as never, "proj-1", [rowWithNoScope], 0);

    // An unlinked check query may or may not fire, but must not include empty string as a param
    const unlinkedCheckCalls = (tx.$queryRawUnsafe.mock.calls as string[][]).filter(
      ([sql]) => typeof sql === "string" && sql.includes("canonical_scope_type_id IS NULL")
    );
    if (unlinkedCheckCalls.length > 0) {
      const [, ...params] = unlinkedCheckCalls[0];
      expect(params).not.toContain("");
    }
  });
});

/**
 * Unit tests for lib/sub-scopes.ts service functions.
 *
 * Tests `hasSubScopeInstances`, `autoCreateInstancesForNewRows`, and
 * `createSubScopesWithInstances` in isolation with a mocked PrismaClient.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hasSubScopeInstances,
  autoCreateInstancesForNewRows,
  createSubScopesWithInstances,
} from "@/lib/sub-scopes";
import type { PrismaClient } from "@prisma/client";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

type MockRow = { id: string; unitType: string; scopeTypeId: string | null; qty?: { toNumber(): number } | null };
type MockDef = { id: string; unitType: string; scopeTypeId: string; qty?: { toNumber(): number } | null };

function makeMockDb(overrides: Partial<{
  instanceCount: number;
  newRows: MockRow[];
  definitions: MockDef[];
  createdDefinitions: Array<{ id: string; name: string; displayOrder: number; qty: unknown; unitType: string; scopeTypeId: string; createdAt: Date }>;
}> = {}): PrismaClient {
  const {
    instanceCount = 0,
    newRows = [],
    definitions = [],
    createdDefinitions = [],
  } = overrides;

  return {
    projectSubScopeInstance: {
      count: vi.fn().mockResolvedValue(instanceCount),
      create: vi.fn().mockResolvedValue({}),
    },
    projectRow: {
      findMany: vi.fn().mockResolvedValue(newRows),
    },
    projectSubScope: {
      findMany: vi.fn().mockResolvedValue(definitions),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: `def-${Math.random()}`,
          name: data.name,
          displayOrder: data.displayOrder ?? 0,
          qty: data.qty ?? null,
          unitType: data.unitType,
          scopeTypeId: data.scopeTypeId,
          createdAt: new Date(),
        })
      ),
    },
    $transaction: vi.fn().mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) {
        const results = [];
        for (const op of ops) results.push(await op);
        return results;
      }
      return ops;
    }) as unknown,
  } as unknown as PrismaClient;
}

/** Returns a Decimal-like object matching Prisma's Decimal shape */
function dec(n: number) {
  return { toNumber: () => n };
}

// ─── hasSubScopeInstances ─────────────────────────────────────────────────────

describe("hasSubScopeInstances()", () => {
  it("returns false when count is 0", async () => {
    const db = makeMockDb({ instanceCount: 0 });
    expect(await hasSubScopeInstances(db, "row1")).toBe(false);
  });

  it("returns true when count is greater than 0", async () => {
    const db = makeMockDb({ instanceCount: 3 });
    expect(await hasSubScopeInstances(db, "row1")).toBe(true);
  });

  it("queries by the provided rowId", async () => {
    const db = makeMockDb({ instanceCount: 1 });
    await hasSubScopeInstances(db, "specific-row-id");
    expect(db.projectSubScopeInstance.count).toHaveBeenCalledWith({
      where: { rowId: "specific-row-id" },
    });
  });
});

// ─── createSubScopesWithInstances ─────────────────────────────────────────────

describe("createSubScopesWithInstances()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("even mode: creates instances with qty = parentRow.qty / numSubScopes", async () => {
    const rows: MockRow[] = [
      { id: "row1", unitType: "2BR", scopeTypeId: "st1", qty: dec(10) },
      { id: "row2", unitType: "2BR", scopeTypeId: "st1", qty: dec(8) },
    ];

    const db = makeMockDb({ newRows: rows });

    // Stub $transaction for definitions to return 2 mocked definitions
    const createdDefs = [
      { id: "def1", name: "Kitchen", displayOrder: 0, qty: null, unitType: "2BR", scopeTypeId: "st1", createdAt: new Date() },
      { id: "def2", name: "Bath", displayOrder: 1, qty: null, unitType: "2BR", scopeTypeId: "st1", createdAt: new Date() },
    ];
    const txFn = db.$transaction as ReturnType<typeof vi.fn>;

    // First $transaction call = definition creates → return 2 defs
    // Second $transaction call = instance creates → return empty
    txFn
      .mockResolvedValueOnce(createdDefs)
      .mockResolvedValueOnce([]);

    await createSubScopesWithInstances(db, {
      projectId: "p1",
      unitType: "2BR",
      scopeTypeId: "st1",
      distributionMode: "even",
      subScopes: [{ name: "Kitchen" }, { name: "Bath" }],
      createdById: "u1",
    });

    // Instance creates: 2 defs × 2 rows = 4 instances
    const instanceCreateCalls = (db.projectSubScopeInstance.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(instanceCreateCalls).toHaveLength(4);

    // row1 (qty=10) ÷ 2 sub-scopes = 5 per instance
    const row1Calls = instanceCreateCalls.filter((c) => c[0].data.rowId === "row1");
    expect(row1Calls).toHaveLength(2);
    expect(row1Calls[0][0].data.qty).toBe(5);
    expect(row1Calls[1][0].data.qty).toBe(5);

    // row2 (qty=8) ÷ 2 sub-scopes = 4 per instance
    const row2Calls = instanceCreateCalls.filter((c) => c[0].data.rowId === "row2");
    expect(row2Calls).toHaveLength(2);
    expect(row2Calls[0][0].data.qty).toBe(4);
    expect(row2Calls[1][0].data.qty).toBe(4);
  });

  it("even mode: instance qty is null when parentRow.qty is null", async () => {
    const rows: MockRow[] = [
      { id: "row1", unitType: "2BR", scopeTypeId: "st1", qty: null },
    ];
    const db = makeMockDb({ newRows: rows });

    const createdDefs = [
      { id: "def1", name: "Kitchen", displayOrder: 0, qty: null, unitType: "2BR", scopeTypeId: "st1", createdAt: new Date() },
      { id: "def2", name: "Bath", displayOrder: 1, qty: null, unitType: "2BR", scopeTypeId: "st1", createdAt: new Date() },
    ];
    const txFn = db.$transaction as ReturnType<typeof vi.fn>;
    txFn.mockResolvedValueOnce(createdDefs).mockResolvedValueOnce([]);

    await createSubScopesWithInstances(db, {
      projectId: "p1",
      unitType: "2BR",
      scopeTypeId: "st1",
      distributionMode: "even",
      subScopes: [{ name: "Kitchen" }, { name: "Bath" }],
      createdById: "u1",
    });

    const instanceCreateCalls = (db.projectSubScopeInstance.create as ReturnType<typeof vi.fn>).mock.calls;
    // All instances should have qty = null since parent qty is null
    for (const call of instanceCreateCalls) {
      expect(call[0].data.qty).toBeNull();
    }
  });

  it("manual mode: instances get the sub-scope's specified qty regardless of row qty", async () => {
    const rows: MockRow[] = [
      { id: "row1", unitType: "2BR", scopeTypeId: "st1", qty: dec(10) },
      { id: "row2", unitType: "2BR", scopeTypeId: "st1", qty: dec(8) },
    ];
    const db = makeMockDb({ newRows: rows });

    const createdDefs = [
      { id: "def1", name: "Kitchen", displayOrder: 0, qty: dec(6), unitType: "2BR", scopeTypeId: "st1", createdAt: new Date() },
      { id: "def2", name: "Bath", displayOrder: 1, qty: dec(4), unitType: "2BR", scopeTypeId: "st1", createdAt: new Date() },
    ];
    const txFn = db.$transaction as ReturnType<typeof vi.fn>;
    txFn.mockResolvedValueOnce(createdDefs).mockResolvedValueOnce([]);

    await createSubScopesWithInstances(db, {
      projectId: "p1",
      unitType: "2BR",
      scopeTypeId: "st1",
      distributionMode: "manual",
      subScopes: [{ name: "Kitchen", qty: 6 }, { name: "Bath", qty: 4 }],
      createdById: "u1",
    });

    const instanceCreateCalls = (db.projectSubScopeInstance.create as ReturnType<typeof vi.fn>).mock.calls;
    // def1 (Kitchen, qty=6) should produce qty=6 on all rows
    const kitchenCalls = instanceCreateCalls.filter((c) => c[0].data.subScopeId === "def1");
    expect(kitchenCalls).toHaveLength(2);
    expect(kitchenCalls[0][0].data.qty).toBe(6);
    expect(kitchenCalls[1][0].data.qty).toBe(6);

    // def2 (Bath, qty=4) should produce qty=4 on all rows
    const bathCalls = instanceCreateCalls.filter((c) => c[0].data.subScopeId === "def2");
    expect(bathCalls).toHaveLength(2);
    expect(bathCalls[0][0].data.qty).toBe(4);
    expect(bathCalls[1][0].data.qty).toBe(4);
  });

  it("manual mode: stores qty on definition records", async () => {
    const rows: MockRow[] = [
      { id: "row1", unitType: "2BR", scopeTypeId: "st1", qty: null },
    ];
    const db = makeMockDb({ newRows: rows });

    const createdDefs = [
      { id: "def1", name: "Kitchen", displayOrder: 0, qty: null, unitType: "2BR", scopeTypeId: "st1", createdAt: new Date() },
      { id: "def2", name: "Bath", displayOrder: 1, qty: null, unitType: "2BR", scopeTypeId: "st1", createdAt: new Date() },
    ];
    const txFn = db.$transaction as ReturnType<typeof vi.fn>;
    txFn.mockResolvedValueOnce(createdDefs).mockResolvedValueOnce([]);

    await createSubScopesWithInstances(db, {
      projectId: "p1",
      unitType: "2BR",
      scopeTypeId: "st1",
      distributionMode: "manual",
      subScopes: [{ name: "Kitchen", qty: 6 }, { name: "Bath", qty: 4 }],
      createdById: "u1",
    });

    // The definition create calls should include the qty on the data payload
    const scopeCreateCalls = (db.projectSubScope.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(scopeCreateCalls[0][0].data.qty).toBe(6);
    expect(scopeCreateCalls[1][0].data.qty).toBe(4);
  });

  it("no instances are created when there are no matching rows", async () => {
    const db = makeMockDb({ newRows: [] });

    const createdDefs = [
      { id: "def1", name: "Kitchen", displayOrder: 0, qty: null, unitType: "2BR", scopeTypeId: "st1", createdAt: new Date() },
      { id: "def2", name: "Bath", displayOrder: 1, qty: null, unitType: "2BR", scopeTypeId: "st1", createdAt: new Date() },
    ];
    const txFn = db.$transaction as ReturnType<typeof vi.fn>;
    txFn.mockResolvedValueOnce(createdDefs);

    await createSubScopesWithInstances(db, {
      projectId: "p1",
      unitType: "2BR",
      scopeTypeId: "st1",
      distributionMode: "even",
      subScopes: [{ name: "Kitchen" }, { name: "Bath" }],
      createdById: "u1",
    });

    // Only 1 $transaction call (for definitions). No second call for instances.
    expect(txFn).toHaveBeenCalledTimes(1);
    expect(db.projectSubScopeInstance.create).not.toHaveBeenCalled();
  });
});

// ─── autoCreateInstancesForNewRows ────────────────────────────────────────────

describe("autoCreateInstancesForNewRows()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns early when newRowIds is empty — no DB calls made", async () => {
    const db = makeMockDb();
    await autoCreateInstancesForNewRows(db, "p1", []);
    expect(db.projectRow.findMany).not.toHaveBeenCalled();
  });

  it("returns early when no new rows are found in the DB", async () => {
    const db = makeMockDb({ newRows: [] });
    await autoCreateInstancesForNewRows(db, "p1", ["row1"]);
    expect(db.projectSubScope.findMany).not.toHaveBeenCalled();
  });

  it("returns early when new rows have no scopeTypeId (null)", async () => {
    const db = makeMockDb({
      newRows: [{ id: "row1", unitType: "2BR", scopeTypeId: null }],
    });
    await autoCreateInstancesForNewRows(db, "p1", ["row1"]);
    expect(db.projectSubScope.findMany).not.toHaveBeenCalled();
  });

  it("returns early when no matching sub-scope definitions exist", async () => {
    const db = makeMockDb({
      newRows: [{ id: "row1", unitType: "2BR", scopeTypeId: "st1" }],
      definitions: [],
    });
    await autoCreateInstancesForNewRows(db, "p1", ["row1"]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("creates instances only for rows whose (unitType, scopeTypeId) matches a definition", async () => {
    const db = makeMockDb({
      newRows: [
        { id: "row1", unitType: "2BR", scopeTypeId: "st1", qty: null },   // matches
        { id: "row2", unitType: "STUDIO", scopeTypeId: "st2", qty: null }, // no match
      ],
      definitions: [
        { id: "def1", unitType: "2BR", scopeTypeId: "st1", qty: null },
        { id: "def2", unitType: "2BR", scopeTypeId: "st1", qty: null },
      ],
    });

    await autoCreateInstancesForNewRows(db, "p1", ["row1", "row2"]);

    // Should create 2 instances: row1 × def1, row1 × def2
    const txFn = db.$transaction as ReturnType<typeof vi.fn>;
    expect(txFn).toHaveBeenCalledTimes(1);
    const passedOps = txFn.mock.calls[0][0] as unknown[];
    expect(passedOps).toHaveLength(2);
  });

  it("creates instances for multiple rows matching the same definition", async () => {
    const db = makeMockDb({
      newRows: [
        { id: "row1", unitType: "2BR", scopeTypeId: "st1", qty: null },
        { id: "row2", unitType: "2BR", scopeTypeId: "st1", qty: null },
      ],
      definitions: [{ id: "def1", unitType: "2BR", scopeTypeId: "st1", qty: null }],
    });

    await autoCreateInstancesForNewRows(db, "p1", ["row1", "row2"]);

    const txFn = db.$transaction as ReturnType<typeof vi.fn>;
    expect(txFn).toHaveBeenCalledTimes(1);
    const passedOps = txFn.mock.calls[0][0] as unknown[];
    // 2 rows × 1 definition = 2 instances
    expect(passedOps).toHaveLength(2);
  });

  it("even mode (def.qty null): instance qty = row.qty / numSubScopesInGroup", async () => {
    const db = makeMockDb({
      newRows: [
        { id: "row1", unitType: "2BR", scopeTypeId: "st1", qty: dec(10) },
      ],
      definitions: [
        { id: "def1", unitType: "2BR", scopeTypeId: "st1", qty: null }, // even
        { id: "def2", unitType: "2BR", scopeTypeId: "st1", qty: null }, // even
      ],
    });

    await autoCreateInstancesForNewRows(db, "p1", ["row1"]);

    const instanceCreateCalls = (db.projectSubScopeInstance.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(instanceCreateCalls).toHaveLength(2);
    // 10 / 2 = 5 each
    expect(instanceCreateCalls[0][0].data.qty).toBe(5);
    expect(instanceCreateCalls[1][0].data.qty).toBe(5);
  });

  it("manual mode (def.qty set): instance qty = def.qty, ignoring row qty", async () => {
    const db = makeMockDb({
      newRows: [
        { id: "row1", unitType: "2BR", scopeTypeId: "st1", qty: dec(999) },
      ],
      definitions: [
        { id: "def1", unitType: "2BR", scopeTypeId: "st1", qty: dec(6) }, // manual
        { id: "def2", unitType: "2BR", scopeTypeId: "st1", qty: dec(4) }, // manual
      ],
    });

    await autoCreateInstancesForNewRows(db, "p1", ["row1"]);

    const instanceCreateCalls = (db.projectSubScopeInstance.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(instanceCreateCalls).toHaveLength(2);
    // Should use def.qty, not row.qty
    const qtyValues = instanceCreateCalls.map((c) => c[0].data.qty);
    expect(qtyValues).toContain(6);
    expect(qtyValues).toContain(4);
  });
});

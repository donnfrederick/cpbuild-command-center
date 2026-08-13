import { describe, it, expect } from "vitest";
import { computeOverviewStats, type RowForStats } from "@/lib/overview-stats";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function row(
  overrides: Partial<RowForStats> = {},
  subScopeInstances: RowForStats["subScopeInstances"] = [],
  clearInspections: RowForStats["clearInspections"] = []
): RowForStats {
  return {
    qty: 1,
    scopeStage: null,
    scopeStatus: null,
    scopeType: null,
    clearInspections,
    subScopeInstances,
    ...overrides,
  };
}

// ─── Empty input ──────────────────────────────────────────────────────────────

describe("computeOverviewStats — empty input", () => {
  it("returns zero overall pct for empty rows", () => {
    const s = computeOverviewStats([]);
    expect(s.overall.pct).toBe(0);
    expect(s.totalScopes).toBe(0);
  });
});

// ─── Overall % ────────────────────────────────────────────────────────────────

describe("computeOverviewStats — overall %", () => {
  it("counts INSTALL+COMPLETE as install complete", () => {
    const rows: RowForStats[] = [
      row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE" }),
      row({ scopeStage: "INSTALL", scopeStatus: "IN_PROGRESS" }),
      row({ scopeStage: "ASSEMBLY", scopeStatus: "IN_PROGRESS" }),
      row({ scopeStage: null, scopeStatus: null }),
    ];
    const s = computeOverviewStats(rows);
    expect(s.overall.installCompleteQty).toBe(1);
    expect(s.overall.totalQty).toBe(4);
    expect(s.overall.pct).toBe(25);
    expect(s.overall.installCompleteEntries).toBe(1);
  });

  it("uses qty for weighted calculation", () => {
    const rows: RowForStats[] = [
      row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", qty: 3 }),
      row({ scopeStage: "ASSEMBLY", scopeStatus: "IN_PROGRESS", qty: 1 }),
    ];
    const s = computeOverviewStats(rows);
    expect(s.overall.installCompleteQty).toBe(3);
    expect(s.overall.totalQty).toBe(4);
    expect(s.overall.pct).toBe(75);
  });

  it("falls back to qty=1 when qty is null", () => {
    const rows: RowForStats[] = [
      row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", qty: null }),
      row({ scopeStage: "ASSEMBLY", scopeStatus: null, qty: null }),
    ];
    const s = computeOverviewStats(rows);
    expect(s.overall.totalQty).toBe(2);
    expect(s.overall.installCompleteQty).toBe(1);
    expect(s.overall.pct).toBe(50);
  });

  it("uses sub-scope instances instead of row when instances exist", () => {
    const rows: RowForStats[] = [
      row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", qty: 10 }, [
        { qty: 2, scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
        { qty: 2, scopeStage: "ASSEMBLY", scopeStatus: "IN_PROGRESS" },
      ]),
    ];
    const s = computeOverviewStats(rows);
    // Row-level qty (10) is ignored; only instances count
    expect(s.overall.totalQty).toBe(4);
    expect(s.overall.installCompleteQty).toBe(2);
    expect(s.overall.pct).toBe(50);
    expect(s.totalScopes).toBe(2);
    expect(s.overall.installCompleteEntries).toBe(1);
  });

  it("counts PENDING_VERIFICATION as Install Complete-Unverified but not verified complete", () => {
    const rows: RowForStats[] = [
      row({ scopeStage: "INSTALL", scopeStatus: "PENDING_VERIFICATION", qty: 4, scopeType: { name: "Millwork" } }),
      row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", qty: 2, scopeType: { name: "Millwork" } }),
    ];

    const s = computeOverviewStats(rows);
    const millwork = s.byScope.find((b) => b.name === "Millwork")!;

    expect(s.overall.totalQty).toBe(6);
    expect(s.overall.installCompleteQty).toBe(2);
    expect(s.overall.pct).toBe(33);
    expect(s.overall.installCompleteEntries).toBe(1);
    expect(millwork.stages.installCompleteSub).toBe(1);
    expect(millwork.stages.installComplete).toBe(1);
    expect(millwork.installCompleteQty).toBe(2);
    expect(millwork.pct).toBe(33);
  });
});

// ─── Per-scope stages ─────────────────────────────────────────────────────────

describe("computeOverviewStats — per-scope stages", () => {
  it("tracks stage distribution within each scope type", () => {
    const rows: RowForStats[] = [
      row({ scopeStage: null, scopeType: { name: "Framing" } }),
      row({ scopeStage: "STAGING", scopeStatus: "IN_PROGRESS", scopeType: { name: "Framing" } }),
      row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", scopeType: { name: "Framing" } }),
      row({ scopeStage: "ASSEMBLY", scopeStatus: "IN_PROGRESS", scopeType: { name: "Drywall" } }),
    ];
    const s = computeOverviewStats(rows);
    const framing = s.byScope.find((b) => b.name === "Framing")!;
    expect(framing.stages.notStarted).toBe(1);
    expect(framing.stages.staging).toBe(1);
    expect(framing.stages.installComplete).toBe(1);
    const drywall = s.byScope.find((b) => b.name === "Drywall")!;
    expect(drywall.stages.assembly).toBe(1);
  });

  it("tracks stage distribution from sub-scope instances", () => {
    const rows: RowForStats[] = [
      row({ scopeType: { name: "Cabinetry" } }, [
        { qty: 1, scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
        { qty: 1, scopeStage: "STAGING", scopeStatus: "IN_PROGRESS" },
        { qty: 1, scopeStage: null, scopeStatus: null },
      ]),
    ];
    const s = computeOverviewStats(rows);
    const cab = s.byScope.find((b) => b.name === "Cabinetry")!;
    expect(cab.stages.installComplete).toBe(1);
    expect(cab.stages.staging).toBe(1);
    expect(cab.stages.notStarted).toBe(1);
  });

  it("exposes installCompleteEntries for count-based display", () => {
    const rows: RowForStats[] = [
      row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", scopeType: { name: "Framing" } }),
      row({ scopeStage: "ASSEMBLY", scopeStatus: "IN_PROGRESS", scopeType: { name: "Framing" } }),
    ];
    const s = computeOverviewStats(rows);
    const framing = s.byScope.find((b) => b.name === "Framing")!;
    expect(framing.installCompleteEntries).toBe(1);
    expect(framing.totalEntries).toBe(2);
  });
});

// ─── By scope grouping ────────────────────────────────────────────────────────

describe("computeOverviewStats — byScope", () => {
  it("groups rows by scope type name", () => {
    const rows: RowForStats[] = [
      row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", scopeType: { name: "Framing" } }),
      row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", scopeType: { name: "Framing" } }),
      row({ scopeStage: "ASSEMBLY", scopeStatus: "IN_PROGRESS", scopeType: { name: "Drywall" } }),
    ];
    const s = computeOverviewStats(rows);
    expect(s.byScope).toHaveLength(2);
    const framing = s.byScope.find((b) => b.name === "Framing")!;
    expect(framing.pct).toBe(100);
    const drywall = s.byScope.find((b) => b.name === "Drywall")!;
    expect(drywall.pct).toBe(0);
  });

  it("groups rows with null scopeType under 'Other'", () => {
    const s = computeOverviewStats([row({ scopeType: null })]);
    expect(s.byScope[0].name).toBe("Other");
  });

  it("sorts byScope by pct descending", () => {
    const rows: RowForStats[] = [
      row({ scopeStage: "ASSEMBLY", scopeStatus: "IN_PROGRESS", scopeType: { name: "Low" } }),
      row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE", scopeType: { name: "High" } }),
    ];
    const s = computeOverviewStats(rows);
    expect(s.byScope[0].name).toBe("High");
    expect(s.byScope[1].name).toBe("Low");
  });
});

// ─── Clear inspections ────────────────────────────────────────────────────────

describe("computeOverviewStats — clearInspections", () => {
  it("counts project-level PASSED and FAILED clear inspection events", () => {
    const rows: RowForStats[] = [
      row({}, [], [{ status: "PASSED" }, { status: "PASSED" }]),
      row({}, [], [{ status: "FAILED" }]),
      row({}, [], []),
    ];
    const s = computeOverviewStats(rows);
    expect(s.clearInspections.passed).toBe(2);
    expect(s.clearInspections.failed).toBe(1);
  });

  it("aggregates clear inspections per scope type", () => {
    const rows: RowForStats[] = [
      row({ scopeType: { name: "Framing" } }, [], [{ status: "PASSED" }, { status: "PASSED" }]),
      row({ scopeType: { name: "Framing" } }, [], [{ status: "FAILED" }]),
      row({ scopeType: { name: "Drywall" } }, [], [{ status: "PASSED" }]),
    ];
    const s = computeOverviewStats(rows);
    const framing = s.byScope.find((b) => b.name === "Framing")!;
    expect(framing.clearInspections.passed).toBe(2);
    expect(framing.clearInspections.failed).toBe(1);
    const drywall = s.byScope.find((b) => b.name === "Drywall")!;
    expect(drywall.clearInspections.passed).toBe(1);
    expect(drywall.clearInspections.failed).toBe(0);
  });

  it("does not double-count clear inspections when row has sub-scope instances", () => {
    // Clear inspections are at row level — sub-scope instances don't add more
    const rows: RowForStats[] = [
      row(
        { scopeType: { name: "Cabinetry" } },
        [
          { qty: 1, scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
          { qty: 1, scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
        ],
        [{ status: "PASSED" }]
      ),
    ];
    const s = computeOverviewStats(rows);
    expect(s.clearInspections.passed).toBe(1);
    const cab = s.byScope.find((b) => b.name === "Cabinetry")!;
    expect(cab.clearInspections.passed).toBe(1);
  });

  it("returns zero inspections when no clear inspection events exist", () => {
    const s = computeOverviewStats([row()]);
    expect(s.clearInspections.passed).toBe(0);
    expect(s.clearInspections.failed).toBe(0);
  });
});

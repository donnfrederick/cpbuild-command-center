import { describe, expect, it } from "vitest";
import {
  buildPortfolioListItem,
  buildPortfolioProjectSnapshot,
} from "@/lib/reports/compute-portfolio-progress";
import type { PortfolioProgressDbRow } from "@/lib/reports/compute-portfolio-progress";
import type { PortfolioProgressDeltaResult } from "@/lib/reports/compute-portfolio-deltas";

const emptyDeltas: PortfolioProgressDeltaResult = {
  startReportRows: [],
  scopeDeltas: {},
  cellDeltas: {},
  updatedUnitKeys: new Set(),
  verifiedOnByUnitKey: new Map(),
  startedOnByCell: new Map(),
  lastUpdatedOnByCell: new Map(),
  completedOnByCell: new Map(),
};

const TEST_PROJECT = {
  id: "p1",
  name: "Test",
  unifierPid: null as string | null,
  projectManagerName: "",
  installManagerName: null as string | null,
};

describe("buildPortfolioListItem", () => {
  it("returns empty scope summaries for project with no scoped rows", () => {
    const item = buildPortfolioListItem(
      TEST_PROJECT,
      [],
      emptyDeltas,
    );
    expect(item.scopeSummaries).toEqual([]);
    expect(item.hasChangesInPeriod).toBe(false);
  });

  it("aggregates verified and sub pct by scope name", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "",
        level: "1",
        unit: "101",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
      {
        id: "r2",
        building: "",
        level: "1",
        unit: "102",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "PENDING_VERIFICATION",
        inspectionStatus: null,
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const item = buildPortfolioListItem(
      { ...TEST_PROJECT, unifierPid: "UNI-1" },
      rows,
      emptyDeltas,
    );
    expect(item.scopeSummaries).toHaveLength(1);
    expect(item.scopeSummaries[0]?.verifiedPct).toBe(50);
    expect(item.scopeSummaries[0]?.subPct).toBe(50);
  });

  it("excludes INSTALL+COMPLETE rows with FAILED inspectionStatus from verifiedPct", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "",
        level: "1",
        unit: "101",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "PASSED",
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
      {
        id: "r2",
        building: "",
        level: "1",
        unit: "102",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "FAILED",
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const item = buildPortfolioListItem(TEST_PROJECT, rows, emptyDeltas);
    expect(item.scopeSummaries[0]?.verifiedPct).toBe(50);
  });

  it("excludes INSTALL+COMPLETE rows with READY inspectionStatus from verifiedPct", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "",
        level: "1",
        unit: "101",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "PASSED",
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
      {
        id: "r2",
        building: "",
        level: "1",
        unit: "102",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "READY",
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const item = buildPortfolioListItem(TEST_PROJECT, rows, emptyDeltas);
    // READY inspection: pending QC — counted in subPct (installCompleteSubQty), not verifiedPct
    expect(item.scopeSummaries[0]?.verifiedPct).toBe(50);
    expect(item.scopeSummaries[0]?.subPct).toBe(50);
  });

  it("counts INSTALL+COMPLETE with PASSED inspectionStatus as verified", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "",
        level: "1",
        unit: "101",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "PASSED",
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const item = buildPortfolioListItem(TEST_PROJECT, rows, emptyDeltas);
    expect(item.scopeSummaries[0]?.verifiedPct).toBe(100);
  });

  it("excludes INSTALL+COMPLETE rows with open issues (hasOpenIssue=true) from verifiedPct", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "",
        level: "1",
        unit: "101",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
      {
        id: "r2",
        building: "",
        level: "1",
        unit: "102",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        hasOpenIssue: true,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const item = buildPortfolioListItem(TEST_PROJECT, rows, emptyDeltas);
    expect(item.scopeSummaries[0]?.verifiedPct).toBe(50);
  });
});

describe("buildPortfolioProjectSnapshot", () => {
  it("builds building and level grid from scoped rows", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: { name: "Premier LLC" },
        subScopeInstances: [],
      },
    ];
    const startedOnByCell = new Map([["2|Cabinets", "2025-01-06"]]);
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower", unifierPid: "UNI-1" },
      rows,
      emptyDeltas,
      startedOnByCell,
      new Map(),
      new Map(),
    );
    expect(snapshot.buildings).toHaveLength(1);
    expect(snapshot.buildings[0]?.buildingName).toBe("Main");
    expect(snapshot.buildings[0]?.levels[0]?.cells[0]?.verifiedPct).toBe(100);
    expect(snapshot.buildings[0]?.levels[0]?.units?.[0]?.subcontractor).toBe("Premier LLC");
    expect(snapshot.buildings[0]?.levels[0]?.cells[0]?.startedOn).toBe("2025-01-06");
  });

  it("uses levelToBuilding for single-building projects without a building prefix in level keys", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "North Tower",
        level: "3",
        unit: "301",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      new Map(),
      new Map(),
    );
    expect(snapshot.buildings[0]?.buildingName).toBe("North Tower");
  });

  it("uses parent scope name for sub-scope unit detail rows", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: null,
        scopeStage: null,
        scopeStatus: null,
        inspectionStatus: null,
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [
          {
            id: "inst-1",
            qty: 10,
            scopeStage: "INSTALL",
            scopeStatus: "COMPLETE",
            inspectionStatus: null,
            hasOpenIssue: false,
            subScope: { name: "Upper Cabinets" },
          },
        ],
      },
    ];
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      new Map(),
      new Map(),
    );
    const units = snapshot.buildings[0]?.levels[0]?.units;
    expect(units?.[0]?.scopeName).toBe("Cabinets");
  });

  it("includes lastUpdatedOn from lastUpdatedOnByCell map", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const lastUpdatedOnByCell = new Map([["2|Cabinets", "2025-05-20"]]);
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      lastUpdatedOnByCell,
      new Map(),
    );
    expect(snapshot.buildings[0]?.levels[0]?.cells[0]?.lastUpdatedOn).toBe("2025-05-20");
  });

  it("suppresses completedOn when pct < 100 even if history has a completed date", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "IN_PROGRESS",
        inspectionStatus: null,
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const completedOnByCell = new Map([["2|Cabinets", "2025-04-01"]]);
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      new Map(),
      completedOnByCell,
    );
    // Level is not 100% — finish date must be suppressed
    expect(snapshot.buildings[0]?.levels[0]?.cells[0]?.completedOn).toBeNull();
  });

  it("shows completedOn when pct is 100 and no open issues", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const completedOnByCell = new Map([["2|Cabinets", "2025-06-01"]]);
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      new Map(),
      completedOnByCell,
    );
    expect(snapshot.buildings[0]?.levels[0]?.cells[0]?.completedOn).toBe("2025-06-01");
  });

  it("suppresses completedOn when pct is 100 but an open issue exists on the row", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        hasOpenIssue: true,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const completedOnByCell = new Map([["2|Cabinets", "2025-06-01"]]);
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      new Map(),
      completedOnByCell,
    );
    // 100% complete but has an open issue — finish date must be suppressed
    expect(snapshot.buildings[0]?.levels[0]?.cells[0]?.completedOn).toBeNull();
  });

  it("shows completedOn when pct is 100 and the only issue is resolved", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const completedOnByCell = new Map([["2|Cabinets", "2025-06-01"]]);
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      new Map(),
      completedOnByCell,
    );
    // 100% complete and no open issues — finish date must appear
    expect(snapshot.buildings[0]?.levels[0]?.cells[0]?.completedOn).toBe("2025-06-01");
  });

  it("suppresses completedOn when pct is 100 but a unit has a failed inspection", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        inspectionStatus: "FAILED",
        subScopeInstances: [],
      },
    ];
    const completedOnByCell = new Map([["2|Cabinets", "2025-06-01"]]);
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      new Map(),
      completedOnByCell,
    );
    // 100% complete but failed inspection — finish date must be suppressed
    expect(snapshot.buildings[0]?.levels[0]?.cells[0]?.completedOn).toBeNull();
  });

  it("suppresses completedOn when pct is 100 but a sub-scope instance has a failed inspection", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: null,
        scopeStage: null,
        scopeStatus: null,
        inspectionStatus: null,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [
          {
            id: "inst-1",
            qty: 10,
            scopeStage: "INSTALL",
            scopeStatus: "COMPLETE",
            inspectionStatus: "FAILED",
            hasOpenIssue: false,
            subScope: { name: "Upper Cabinets" },
          },
        ],
      },
    ];
    const completedOnByCell = new Map([["2|Cabinets", "2025-06-01"]]);
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      new Map(),
      completedOnByCell,
    );
    // 100% complete but sub-scope has a failed inspection — finish date must be suppressed
    expect(snapshot.buildings[0]?.levels[0]?.cells[0]?.completedOn).toBeNull();
  });

  it("sets hasChangesInPeriod when scope delta exists", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "",
        level: "1",
        unit: "101",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const deltas: PortfolioProgressDeltaResult = {
      ...emptyDeltas,
      scopeDeltas: {
        Cabinets: {
          verifiedDelta: 10,
          verifiedUnitDelta: 1,
          subDelta: null,
          subUnitDelta: null,
        },
      },
    };
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      deltas,
      new Map(),
      new Map(),
      new Map(),
    );
    expect(snapshot.hasChangesInPeriod).toBe(true);
  });

  it("excludes INSTALL+COMPLETE+FAILED unit from cell verifiedPct", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "PASSED",
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
      {
        id: "r2",
        building: "Main",
        level: "2",
        unit: "202",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "FAILED",
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      new Map(),
      new Map(),
    );
    const cell = snapshot.buildings[0]?.levels[0]?.cells[0];
    expect(cell?.verifiedPct).toBe(50);
  });

  it("unit drill-down shows 0% verifiedPct for FAILED inspection row", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "FAILED",
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      new Map(),
      new Map(),
    );
    const unit = snapshot.buildings[0]?.levels[0]?.units[0];
    expect(unit?.verifiedPct).toBe(0);
  });

  it("unit drill-down shows 50% verifiedPct for READY inspection row", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "READY",
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      new Map(),
      new Map(),
    );
    const unit = snapshot.buildings[0]?.levels[0]?.units[0];
    expect(unit?.verifiedPct).toBe(50);
  });

  it("excludes INSTALL+COMPLETE+hasOpenIssue unit from cell verifiedPct", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "Main",
        level: "2",
        unit: "201",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
      {
        id: "r2",
        building: "Main",
        level: "2",
        unit: "202",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        hasOpenIssue: true,
        unifierSubId: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        installer: null,
        subScopeInstances: [],
      },
    ];
    const snapshot = buildPortfolioProjectSnapshot(
      { ...TEST_PROJECT, name: "Tower" },
      rows,
      emptyDeltas,
      new Map(),
      new Map(),
      new Map(),
    );
    const cell = snapshot.buildings[0]?.levels[0]?.cells[0];
    expect(cell?.verifiedPct).toBe(50);

    const units = snapshot.buildings[0]?.levels[0]?.units;
    const unitWithIssue = units?.find((u) => u.unitLabel === "202");
    expect(unitWithIssue?.verifiedPct).toBe(0);
  });

  it("sub-scope instances inherit parent row FAILED inspectionStatus when they have none of their own", () => {
    // This is the real-world case: a row-level clear inspection sets inspectionStatus=FAILED
    // on the ProjectRow, but sub-scope instances keep inspectionStatus=null. The instances
    // must still be excluded from verifiedPct.
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "B",
        level: "1",
        unit: "101",
        qty: null,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "FAILED",  // row-level failed inspection
        hasOpenIssue: false,
        unifierSubId: null,
        scopeType: { name: "Flooring", canonicalScopeType: { displayName: "Flooring" } },
        installer: null,
        subScopeInstances: [
          {
            id: "inst-1",
            qty: 5,
            scopeStage: "INSTALL",
            scopeStatus: "COMPLETE",
            inspectionStatus: null,  // instance has no independent inspection result
            hasOpenIssue: false,
            subScope: { name: "Bedroom" },
          },
          {
            id: "inst-2",
            qty: 5,
            scopeStage: "INSTALL",
            scopeStatus: "COMPLETE",
            inspectionStatus: null,
            hasOpenIssue: false,
            subScope: { name: "Living Room" },
          },
        ],
      },
    ];
    const item = buildPortfolioListItem(TEST_PROJECT, rows, emptyDeltas);
    // With a FAILED parent row inspection, none of the sub-scope instances should count as verified
    expect(item.scopeSummaries[0]?.verifiedPct).toBe(0);
  });

  it("sub-scope instances inherit parent row hasOpenIssue when they have no issue of their own", () => {
    const rows: PortfolioProgressDbRow[] = [
      {
        id: "r1",
        building: "B",
        level: "1",
        unit: "101",
        qty: null,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        hasOpenIssue: true,  // row-level open issue
        unifierSubId: null,
        scopeType: { name: "Flooring", canonicalScopeType: { displayName: "Flooring" } },
        installer: null,
        subScopeInstances: [
          {
            id: "inst-1",
            qty: 10,
            scopeStage: "INSTALL",
            scopeStatus: "COMPLETE",
            inspectionStatus: null,
            hasOpenIssue: false,  // instance has no independent issue
            subScope: { name: "Bedroom" },
          },
        ],
      },
    ];
    const item = buildPortfolioListItem(TEST_PROJECT, rows, emptyDeltas);
    expect(item.scopeSummaries[0]?.verifiedPct).toBe(0);
  });
});

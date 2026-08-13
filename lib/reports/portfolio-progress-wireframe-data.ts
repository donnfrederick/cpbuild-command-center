/**
 * Mock fixtures for the portfolio level–scope progress report wireframe (tests only).
 */

import type { LevelScopeCellData, LevelScopeReportData } from "@/lib/level-scope-report";
import type {
  PortfolioProjectSnapshot,
  LevelUnitDetailSnapshot,
  LevelDetailSnapshot,
} from "@/lib/reports/portfolio-progress-types";

export type {
  BuildingDetailSnapshot,
  LevelDetailSnapshot,
  LevelScopeCellSnapshot,
  LevelUnitDetailSnapshot,
  PortfolioProjectSnapshot,
  ScopeProgressSnapshot,
} from "@/lib/reports/portfolio-progress-types";

/** Derive location count change from % delta when wireframe fixtures omit an explicit count. */
export function unitDeltaFromPctDelta(
  deltaPct: number | null,
  totalQty: number,
): number | null {
  if (deltaPct === null || deltaPct === 0) return deltaPct === 0 ? 0 : null;
  const raw = Math.round((Math.abs(deltaPct) / 100) * Math.max(totalQty, 1));
  const magnitude = raw === 0 ? 1 : raw;
  return deltaPct > 0 ? magnitude : -magnitude;
}

function wireframeCell(
  pct: number,
  totalUnits: number,
  startedOn: string | null = null,
  completedOn: string | null = null,
  verifiedDelta: number | null = null,
  verifiedUnitDelta: number | null | undefined = undefined,
  subPct = 0,
  lastUpdatedOn: string | null = null,
): LevelScopeCellData {
  const totalQty = Math.max(0, totalUnits);
  const installedQty =
    totalQty > 0 ? Math.min(totalQty, Math.round((pct / 100) * totalQty)) : 0;
  const subQtyRaw =
    totalQty > 0 ? Math.min(totalQty, Math.round((subPct / 100) * totalQty)) : 0;
  const subQty = Math.min(subQtyRaw, Math.max(0, totalQty - installedQty));
  const unitDelta =
    verifiedUnitDelta !== undefined
      ? verifiedUnitDelta
      : unitDeltaFromPctDelta(verifiedDelta, totalQty);
  return {
    pct,
    subPct,
    installedQty,
    totalQty,
    notStartedQty: Math.max(0, totalQty - installedQty - subQty),
    stagingQty: 0,
    assemblyQty: 0,
    installInProgressQty: 0,
    installCompleteSubQty: subQty,
    startedOn,
    lastUpdatedOn,
    completedOn: pct >= 100 ? completedOn : null,
    verifiedDelta,
    verifiedUnitDelta: unitDelta,
  };
}

/** Converts wireframe fixtures into LevelScopeReportData for LevelScopeReportGrid. */
export function wireframeProjectToLevelScopeReport(
  project: PortfolioProjectSnapshot,
): LevelScopeReportData {
  const buildingNames = project.buildings.map((b) => b.buildingName);
  const multiBuilding = buildingNames.length > 1;
  const levels: string[] = [];
  const levelToBuilding: Record<string, string> = {};
  const data: LevelScopeReportData["data"] = {};

  for (const building of project.buildings) {
    for (const level of building.levels) {
      const lk =
        multiBuilding && building.buildingName
          ? `${building.buildingName} › ${level.levelLabel}`
          : level.levelLabel;
      levels.push(lk);
      levelToBuilding[lk] = building.buildingName;
      data[lk] = {};
      for (const cell of level.cells) {
        data[lk][cell.scopeName] = wireframeCell(
          cell.verifiedPct,
          cell.totalUnits ?? 18,
          cell.startedOn ?? null,
          cell.completedOn ?? null,
          cell.verifiedDelta ?? null,
          cell.verifiedUnitDelta,
          cell.subPct,
          cell.lastUpdatedOn ?? null,
        );
      }
    }
  }

  // Match summary table order — same scopes as scopeSummaries (not alphabetical).
  const scopes = project.scopeSummaries.map((s) => s.scopeName);
  const sortedLevels = Array.from(new Set(levels)).sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
  );

  const overallByLevel: Record<string, number> = {};
  const levelOverallUnits: LevelScopeReportData["levelOverallUnits"] = {};
  for (const lk of sortedLevels) {
    const cells = data[lk];
    if (!cells) continue;
    const totalQty = Math.max(0, ...scopes.map((s) => cells[s]?.totalQty ?? 0));
    const installedQty = Math.max(0, ...scopes.map((s) => cells[s]?.installedQty ?? 0));
    levelOverallUnits[lk] = { installedQty, totalQty };
    const pcts = scopes
      .map((scopeName) => cells[scopeName]?.pct)
      .filter((pct): pct is number => pct !== undefined);
    overallByLevel[lk] = pcts.length
      ? Math.round(pcts.reduce((sum, p) => sum + p, 0) / pcts.length)
      : 0;
  }

  const overallByScope: Record<string, number> = {};
  for (const summary of project.scopeSummaries) {
    overallByScope[summary.scopeName] = summary.verifiedPct;
  }

  const grandTotalPct =
    project.scopeSummaries.length === 0
      ? 0
      : Math.round(
          project.scopeSummaries.reduce((sum, s) => sum + s.verifiedPct, 0) /
            project.scopeSummaries.length,
        );

  return {
    levels: sortedLevels,
    scopes,
    data,
    overallByLevel,
    overallByScope,
    grandTotalPct,
    levelOverallUnits,
    buildings: Array.from(new Set(buildingNames)).sort((a, b) =>
      a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
    ),
    levelToBuilding,
    overallDeltaByScope: Object.fromEntries(
      project.scopeSummaries.map((s) => [s.scopeName, s.verifiedDelta]),
    ),
    overallUnitDeltaByScope: Object.fromEntries(
      project.scopeSummaries.map((s) => [
        s.scopeName,
        s.verifiedUnitDelta ?? unitDeltaFromPctDelta(s.verifiedDelta, 100),
      ]),
    ),
  };
}

const MARINA_BAY_SCOPE_NAMES = ["Cabinets", "Countertops", "Tile"] as const;

/** Sample location rows for level drill-down wireframe (Marina Bay Building A). */
function marinaBayLevelUnits(levelLabel: string): LevelUnitDetailSnapshot[] | undefined {
  if (levelLabel === "Level 3") {
    const premier = "Premier Cabinets LLC";
    const hfc = "HFC Cabinets";
    const stone = "Stone & Surface Pro";
    const tileCo = "Bay Tile Co";
    const cabinetRows: LevelUnitDetailSnapshot[] = [
      { unitLabel: "301", scopeName: "Cabinets", verifiedPct: 100, updatedThisPeriod: true, subcontractor: premier, verifiedOn: "2025-05-20" },
      { unitLabel: "302", scopeName: "Cabinets", verifiedPct: 100, updatedThisPeriod: false, subcontractor: premier, verifiedOn: "2025-05-18" },
      { unitLabel: "303", scopeName: "Cabinets", verifiedPct: 100, updatedThisPeriod: true, subcontractor: hfc, verifiedOn: "2025-05-22" },
      { unitLabel: "304", scopeName: "Cabinets", verifiedPct: 100, updatedThisPeriod: false, subcontractor: null, verifiedOn: "2025-05-10" },
      { unitLabel: "305", scopeName: "Cabinets", verifiedPct: 100, updatedThisPeriod: true, subcontractor: null, verifiedOn: "2025-05-23" },
      { unitLabel: "306", scopeName: "Cabinets", verifiedPct: 100, updatedThisPeriod: false, subcontractor: null, verifiedOn: "2025-05-15" },
      { unitLabel: "307", scopeName: "Cabinets", verifiedPct: 85, updatedThisPeriod: false, subcontractor: null, verifiedOn: null },
    ];
    /** 8/18 verified complete — units 301–308 on this level. */
    const countertopRows: LevelUnitDetailSnapshot[] = ["301", "302", "303", "304", "305", "306", "307", "308"].map(
      (unitLabel, i) => ({
        unitLabel,
        scopeName: "Countertops",
        verifiedPct: 100,
        updatedThisPeriod: i === 7,
        subcontractor: stone,
        verifiedOn: `2025-05-${10 + i}`,
      }),
    );
    /** ~5/18 tile started — units 301–305; 303 verified this compare period (+1 unit). */
    const tileRows: LevelUnitDetailSnapshot[] = ["301", "302", "303", "304", "305"].map((unitLabel, i) => ({
      unitLabel,
      scopeName: "Tile",
      verifiedPct: i < 3 ? 100 : 40,
      updatedThisPeriod: unitLabel === "303",
      subcontractor: tileCo,
      verifiedOn: i < 3 ? "2025-05-12" : null,
    }));
    return [...cabinetRows, ...countertopRows, ...tileRows];
  }
  if (levelLabel === "Level 5") {
    return [
      { unitLabel: "501", scopeName: "Cabinets", verifiedPct: 100, updatedThisPeriod: true, subcontractor: "Premier Cabinets LLC", verifiedOn: "2025-05-18" },
      { unitLabel: "502", scopeName: "Cabinets", verifiedPct: 100, updatedThisPeriod: true, subcontractor: "Premier Cabinets LLC", verifiedOn: "2025-05-19" },
      { unitLabel: "503", scopeName: "Countertops", verifiedPct: 70, updatedThisPeriod: false, subcontractor: "Stone & Surface Pro", verifiedOn: null },
    ];
  }
  if (levelLabel === "Level 7") {
    return [
      { unitLabel: "701", scopeName: "Cabinets", verifiedPct: 100, updatedThisPeriod: true, subcontractor: "Premier Cabinets LLC", verifiedOn: "2025-05-25" },
      { unitLabel: "702", scopeName: "Cabinets", verifiedPct: 0, updatedThisPeriod: false, subcontractor: "Premier Cabinets LLC", verifiedOn: null },
      { unitLabel: "701", scopeName: "Tile", verifiedPct: 0, updatedThisPeriod: false, subcontractor: "Bay Tile Co", verifiedOn: null },
    ];
  }
  return undefined;
}

/**
 * Per-level verified % for Marina Bay Building A — matches the units list on the
 * project Locations page (Level 2–12). Overall column ≈ average of the three scopes.
 */
function marinaBayBuildingALevels(): LevelDetailSnapshot[] {
  /** Per-level Cabinets installs verified this compare period (wireframe). */
  const cabinetsUnitsThisPeriod: Record<string, number> = {
    "Level 3": 6,
    "Level 5": 2,
    "Level 6": 1,
    "Level 7": 1,
  };

  const rows: Array<{
    label: string;
    units: number;
    pcts: [number, number, number];
    startedOn?: string;
    lastUpdatedOn?: string;
    completedOn?: string;
  }> = [
    { label: "Level 2", units: 9, pcts: [0, 0, 0] },
    { label: "Level 3", units: 18, pcts: [70, 45, 30], startedOn: "2025-01-06", lastUpdatedOn: "2025-05-23" },
    { label: "Level 4", units: 18, pcts: [100, 100, 100], startedOn: "2024-11-01", lastUpdatedOn: "2024-12-20", completedOn: "2024-12-20" },
    { label: "Level 5", units: 18, pcts: [85, 70, 52], startedOn: "2025-02-10", lastUpdatedOn: "2025-05-19" },
    { label: "Level 6", units: 18, pcts: [28, 22, 16], startedOn: "2025-03-01", lastUpdatedOn: "2025-05-10" },
    { label: "Level 7", units: 18, pcts: [5, 2, 0], startedOn: "2025-04-15", lastUpdatedOn: "2025-05-25" },
    { label: "Level 8", units: 18, pcts: [0, 0, 0] },
    { label: "Level 9", units: 18, pcts: [0, 0, 0] },
    { label: "Level 10", units: 34, pcts: [0, 0, 0] },
    { label: "Level 11", units: 34, pcts: [0, 0, 0] },
    { label: "Level 12", units: 34, pcts: [0, 0, 0] },
  ];

  return rows.map(({ label, units, pcts, startedOn, lastUpdatedOn, completedOn }) => ({
    levelLabel: label,
    units: marinaBayLevelUnits(label),
    cells: MARINA_BAY_SCOPE_NAMES.map((scopeName, i) => {
      const verifiedPct = pcts[i] ?? 0;
      const subPct = Math.min(100, verifiedPct + (verifiedPct > 0 ? 8 : 0));
      const inProgress = verifiedPct > 0 && verifiedPct < 100;
      const verifiedDelta = inProgress ? 3 : null;
      let verifiedUnitDelta: number | null = null;
      if (inProgress && scopeName === "Cabinets") {
        verifiedUnitDelta = cabinetsUnitsThisPeriod[label] ?? 1;
      } else if (inProgress) {
        verifiedUnitDelta = unitDeltaFromPctDelta(verifiedDelta, units);
      }
      return {
        scopeName,
        verifiedPct,
        verifiedDelta,
        verifiedUnitDelta,
        subPct,
        subDelta: null,
        totalUnits: units,
        startedOn: verifiedPct > 0 ? startedOn ?? null : null,
        lastUpdatedOn: verifiedPct > 0 ? lastUpdatedOn ?? null : null,
        completedOn: verifiedPct >= 100 ? completedOn ?? null : null,
      };
    }),
  }));
}

/** Sorted A→Z to match the projects table default sort. */
export const PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS: readonly PortfolioProjectSnapshot[] = [
  {
    id: "UNI-10145",
    name: "Marina Bay Condos",
    projectManagerName: "Jon Hiller",
    installManagerName: "Mike Hansen",
    hasChangesInPeriod: true,
    scopeSummaries: [
      {
        scopeName: "Cabinets",
        verifiedPct: 62,
        verifiedDelta: 4,
        verifiedUnitDelta: 6,
        subPct: 71,
        subDelta: 2,
        subUnitDelta: 3,
      },
      {
        scopeName: "Countertops",
        verifiedPct: 41,
        verifiedDelta: null,
        verifiedUnitDelta: null,
        subPct: 55,
        subDelta: 8,
        subUnitDelta: 5,
      },
      {
        scopeName: "Tile",
        verifiedPct: 28,
        verifiedDelta: -2,
        verifiedUnitDelta: -1,
        subPct: 34,
        subDelta: 1,
        subUnitDelta: 1,
      },
    ],
    buildings: [
      {
        buildingName: "Building A",
        levels: marinaBayBuildingALevels(),
      },
    ],
  },
  {
    id: "UNI-10189",
    name: "Oak Grove Residences",
    projectManagerName: "Ed Perkins",
    installManagerName: null,
    hasChangesInPeriod: false,
    scopeSummaries: [
      { scopeName: "Cabinets", verifiedPct: 100, verifiedDelta: null, subPct: 100, subDelta: null },
      { scopeName: "Countertops", verifiedPct: 100, verifiedDelta: null, subPct: 100, subDelta: null },
    ],
    buildings: [
      {
        buildingName: "Main",
        levels: [
          {
            levelLabel: "Level 4",
            cells: [
              {
                scopeName: "Cabinets",
                totalUnits: 24,
                verifiedPct: 100,
                verifiedDelta: null,
                subPct: 100,
                subDelta: null,
                startedOn: "2024-06-10",
                lastUpdatedOn: "2024-10-02",
                completedOn: "2024-10-02",
              },
              {
                scopeName: "Countertops",
                totalUnits: 24,
                verifiedPct: 100,
                verifiedDelta: null,
                subPct: 100,
                subDelta: null,
                startedOn: "2024-07-01",
                lastUpdatedOn: "2024-10-15",
                completedOn: "2024-10-15",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "UNI-10045",
    name: "Riverside Apartments Phase 2",
    projectManagerName: "Jon Hiller",
    installManagerName: "Wes Hamilton",
    hasChangesInPeriod: true,
    scopeSummaries: [
      {
        scopeName: "Cabinets",
        verifiedPct: 88,
        verifiedDelta: 12,
        verifiedUnitDelta: 4,
        subPct: 92,
        subDelta: 4,
        subUnitDelta: 2,
      },
      {
        scopeName: "LVT Flooring",
        verifiedPct: 52,
        verifiedDelta: 6,
        verifiedUnitDelta: 2,
        subPct: 61,
        subDelta: 9,
        subUnitDelta: 3,
      },
    ],
    buildings: [
      {
        buildingName: "Tower A",
        levels: [
          {
            levelLabel: "Level 1",
            cells: [
              {
                scopeName: "Cabinets",
                totalUnits: 32,
                verifiedPct: 90,
                verifiedDelta: 10,
                subPct: 95,
                subDelta: 5,
                startedOn: "2025-03-04",
                lastUpdatedOn: "2025-05-20",
                completedOn: null,
              },
              {
                scopeName: "LVT Flooring",
                totalUnits: 32,
                verifiedPct: 55,
                verifiedDelta: 7,
                subPct: 65,
                subDelta: 10,
                startedOn: "2025-03-18",
                lastUpdatedOn: "2025-05-18",
                completedOn: null,
              },
            ],
          },
        ],
      },
    ],
  },
];

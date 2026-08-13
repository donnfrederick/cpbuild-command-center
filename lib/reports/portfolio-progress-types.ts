/**
 * Shared types for the Global Progress Report (portfolio level–scope progress).
 */

export interface ScopeProgressSnapshot {
  scopeName: string;
  verifiedPct: number;
  verifiedDelta: number | null;
  verifiedUnitDelta?: number | null;
  subPct: number;
  subDelta: number | null;
  subUnitDelta?: number | null;
}

export interface LevelScopeCellSnapshot {
  scopeName: string;
  verifiedPct: number;
  verifiedDelta: number | null;
  verifiedUnitDelta?: number | null;
  subPct: number;
  subDelta: number | null;
  subUnitDelta?: number | null;
  startedOn?: string | null;
  lastUpdatedOn?: string | null;
  completedOn?: string | null;
  totalUnits?: number;
}

export interface LevelUnitDetailSnapshot {
  unitLabel: string;
  scopeName: string;
  verifiedPct: number;
  updatedThisPeriod: boolean;
  subcontractor: string | null;
  verifiedOn?: string | null;
}

export interface LevelDetailSnapshot {
  levelLabel: string;
  cells: LevelScopeCellSnapshot[];
  units?: LevelUnitDetailSnapshot[];
}

export interface BuildingDetailSnapshot {
  buildingName: string;
  levels: LevelDetailSnapshot[];
}

export interface PortfolioProjectSnapshot {
  id: string;
  name: string;
  unifierPid?: string | null;
  projectManagerName: string;
  installManagerName: string | null;
  hasChangesInPeriod: boolean;
  scopeSummaries: ScopeProgressSnapshot[];
  buildings: BuildingDetailSnapshot[];
}

export interface PortfolioProjectListItem {
  id: string;
  name: string;
  unifierPid: string | null;
  projectManagerName: string;
  installManagerName: string | null;
  hasChangesInPeriod: boolean;
  scopeSummaries: ScopeProgressSnapshot[];
}

export interface PortfolioProgressListResponse {
  comparePeriod: { preset: string; from: string; to: string };
  projects: PortfolioProjectListItem[];
}

export interface PortfolioProgressDetailResponse {
  comparePeriod: { preset: string; from: string; to: string };
  project: PortfolioProjectSnapshot;
}

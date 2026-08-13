/**
 * Project-level overview statistics.
 *
 * Computes four stat groups from the flat list of project rows (with optional
 * sub-scope instances) fetched server-side:
 *
 *  - overall          — qty-based % install complete (material utilization)
 *  - byScope          — same metric + stage pipeline + clear inspections per scope type
 *  - clearInspections — project-level pass/fail counts from ClearInspection log events
 */

export interface RowForStats {
  qty: number | null;
  scopeStage: string | null;
  scopeStatus: string | null;
  scopeType: { name: string } | null;
  /** ClearInspection log events linked to this row (deletedAt: null). */
  clearInspections: { status: string }[];
  subScopeInstances: {
    qty: number | null;
    scopeStage: string | null;
    scopeStatus: string | null;
  }[];
}

export interface ScopeStageBreakdown {
  notStarted: number;
  staging: number;
  assembly: number;
  installInProgress: number;
  installCompleteSub: number;   // INSTALL + PENDING_VERIFICATION
  installComplete: number;      // INSTALL + COMPLETE (verified only)
}

export interface ScopeStats {
  name: string;
  /** Qty-based totals for the overall % bar. */
  totalQty: number;
  installCompleteQty: number;
  pct: number;
  /** Count-based totals for human-readable "X of Y scopes" labels. */
  totalEntries: number;
  installCompleteEntries: number;
  /** Count-based pipeline distribution for this scope type. */
  stages: ScopeStageBreakdown;
  /** Clear inspection log event counts for this scope type. */
  clearInspections: { passed: number; failed: number };
}

export interface OverviewStats {
  overall: {
    totalQty: number;
    installCompleteQty: number;
    pct: number;
    /** Count-based install-complete entries for the "N of M scopes" label. */
    installCompleteEntries: number;
  };
  byScope: ScopeStats[];
  /** Project-level clear inspection log event counts (all scope types combined). */
  clearInspections: { passed: number; failed: number };
  /** Total count of trackable scope entries (rows or sub-scope instances). */
  totalScopes: number;
}

function stageBucket(
  stage: string | null,
  status: string | null
): keyof ScopeStageBreakdown {
  if (!stage) return "notStarted";
  if (stage === "STAGING") return "staging";
  if (stage === "ASSEMBLY") return "assembly";
  if (stage === "INSTALL") {
    if (status === "COMPLETE") return "installComplete";
    if (status === "PENDING_VERIFICATION") return "installCompleteSub";
    return "installInProgress";
  }
  return "notStarted";
}

type ScopeBucket = {
  totalQty: number;
  installCompleteQty: number;
  totalEntries: number;
  installCompleteEntries: number;
  stages: ScopeStageBreakdown;
  clearInspections: { passed: number; failed: number };
};

function newScopeBucket(): ScopeBucket {
  return {
    totalQty: 0,
    installCompleteQty: 0,
    totalEntries: 0,
    installCompleteEntries: 0,
    stages: {
      notStarted: 0,
      staging: 0,
      assembly: 0,
      installInProgress: 0,
      installCompleteSub: 0,
      installComplete: 0,
    },
    clearInspections: { passed: 0, failed: 0 },
  };
}

export function computeOverviewStats(rows: RowForStats[]): OverviewStats {
  let totalQty = 0;
  let installCompleteQty = 0;
  let installCompleteEntries = 0;
  let totalScopes = 0;
  const projectClearInspections = { passed: 0, failed: 0 };

  const scopeMap = new Map<string, ScopeBucket>();

  const getScope = (name: string): ScopeBucket => {
    if (!scopeMap.has(name)) scopeMap.set(name, newScopeBucket());
    return scopeMap.get(name)!;
  };

  for (const row of rows) {
    const scopeName = row.scopeType?.name ?? "Other";
    const scope = getScope(scopeName);

    // Clear inspections are always at the row level (ClearInspection.rowId → ProjectRow).
    for (const ci of row.clearInspections) {
      if (ci.status === "PASSED") {
        projectClearInspections.passed += 1;
        scope.clearInspections.passed += 1;
      } else if (ci.status === "FAILED") {
        projectClearInspections.failed += 1;
        scope.clearInspections.failed += 1;
      }
    }

    if (row.subScopeInstances.length > 0) {
      // Rows with sub-scopes: each instance is the trackable unit.
      for (const inst of row.subScopeInstances) {
        const q = inst.qty ?? 1;
        totalQty += q;
        scope.totalQty += q;
        totalScopes += 1;
        scope.totalEntries += 1;

        const isComplete =
          inst.scopeStage === "INSTALL" && inst.scopeStatus === "COMPLETE";
        if (isComplete) {
          installCompleteQty += q;
          scope.installCompleteQty += q;
          installCompleteEntries += 1;
          scope.installCompleteEntries += 1;
        }

        scope.stages[stageBucket(inst.scopeStage, inst.scopeStatus)] += 1;
      }
    } else {
      const q = row.qty ?? 1;
      totalQty += q;
      scope.totalQty += q;
      totalScopes += 1;
      scope.totalEntries += 1;

      const isComplete =
        row.scopeStage === "INSTALL" && row.scopeStatus === "COMPLETE";
      if (isComplete) {
        installCompleteQty += q;
        scope.installCompleteQty += q;
        installCompleteEntries += 1;
        scope.installCompleteEntries += 1;
      }

      scope.stages[stageBucket(row.scopeStage, row.scopeStatus)] += 1;
    }
  }

  const pct =
    totalQty === 0 ? 0 : Math.round((installCompleteQty / totalQty) * 100);

  const byScope: ScopeStats[] = Array.from(scopeMap.entries())
    .map(([name, data]) => ({
      name,
      totalQty: data.totalQty,
      installCompleteQty: data.installCompleteQty,
      pct:
        data.totalQty === 0
          ? 0
          : Math.round((data.installCompleteQty / data.totalQty) * 100),
      totalEntries: data.totalEntries,
      installCompleteEntries: data.installCompleteEntries,
      stages: data.stages,
      clearInspections: data.clearInspections,
    }))
    .sort((a, b) => b.pct - a.pct);

  return {
    overall: { totalQty, installCompleteQty, pct, installCompleteEntries },
    byScope,
    clearInspections: projectClearInspections,
    totalScopes,
  };
}

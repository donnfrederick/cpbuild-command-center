import type { PortfolioProjectSnapshot } from "@/lib/reports/portfolio-progress-types";

export interface ProjectVerifiedRollup {
  /** Equal-weight average verified install % across scopes. */
  verifiedPct: number;
  /** Sum of per-scope verified % change in the compare window; null when no scope moved. */
  verifiedDelta: number | null;
}

/** Collapsed-card rollup — verified installs only (matches expanded grid metric). */
export function projectVerifiedRollup(project: PortfolioProjectSnapshot): ProjectVerifiedRollup {
  const scopes = project.scopeSummaries;
  if (scopes.length === 0) {
    return { verifiedPct: 0, verifiedDelta: null };
  }

  const verifiedPct = Math.round(
    scopes.reduce((sum, scope) => sum + scope.verifiedPct, 0) / scopes.length,
  );

  const deltas = scopes
    .map((scope) => scope.verifiedDelta)
    .filter((delta): delta is number => delta !== null && delta !== undefined);

  const verifiedDelta =
    deltas.length === 0 ? null : deltas.reduce((sum, delta) => sum + delta, 0);

  return { verifiedPct, verifiedDelta };
}

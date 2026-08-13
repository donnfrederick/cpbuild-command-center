import { describe, it, expect } from "vitest";
import { projectVerifiedRollup } from "@/lib/reports/portfolio-progress-rollups";
import { PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS } from "@/lib/reports/portfolio-progress-wireframe-data";

describe("projectVerifiedRollup", () => {
  it("averages verified % and sums scope deltas for Marina Bay", () => {
    const marina = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS.find((p) => p.name === "Marina Bay Condos");
    expect(marina).toBeDefined();
    const rollup = projectVerifiedRollup(marina!);
    expect(rollup.verifiedPct).toBe(44);
    expect(rollup.verifiedDelta).toBe(2);
  });

  it("ranks Riverside higher total change than Marina Bay", () => {
    const marina = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS.find((p) => p.name === "Marina Bay Condos")!;
    const riverside = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS.find(
      (p) => p.name === "Riverside Apartments Phase 2",
    )!;
    expect(projectVerifiedRollup(riverside).verifiedDelta).toBeGreaterThan(
      projectVerifiedRollup(marina).verifiedDelta ?? 0,
    );
    expect(projectVerifiedRollup(riverside).verifiedPct).toBe(70);
    expect(projectVerifiedRollup(riverside).verifiedDelta).toBe(18);
  });

  it("returns null delta when every scope is unchanged", () => {
    const oak = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS.find((p) => p.name === "Oak Grove Residences")!;
    expect(projectVerifiedRollup(oak)).toEqual({ verifiedPct: 100, verifiedDelta: null });
  });
});

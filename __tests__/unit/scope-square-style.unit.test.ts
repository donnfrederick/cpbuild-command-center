import { describe, it, expect } from "vitest";
import {
  getScopeSquareStyle,
  gridInspectionShieldAbbrev,
  resolveScopeSquareSemantic,
  scopeAbbrevFromRow,
  isScopeInstallComplete,
  isScopeInstallCompleteSub,
  SCOPE_STATUS_DOT_COLOR,
  subScopeDotColor,
} from "@/lib/scope-square-style";

describe("resolveScopeSquareSemantic()", () => {
  it("returns failed_inspection when inspection FAILED even if BLOCKED", () => {
    expect(
      resolveScopeSquareSemantic({
        scopeStage: "INSTALL",
        scopeStatus: "BLOCKED",
        inspectionStatus: "FAILED",
      })
    ).toBe("failed_inspection");
  });

  it("returns blocked when BLOCKED and no failed inspection", () => {
    expect(
      resolveScopeSquareSemantic({
        scopeStage: "INSTALL",
        scopeStatus: "BLOCKED",
        inspectionStatus: null,
      })
    ).toBe("blocked");
  });

  it("returns inspection_passed when INSTALL+COMPLETE and PASSED", () => {
    expect(
      resolveScopeSquareSemantic({
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "PASSED",
      })
    ).toBe("inspection_passed");
  });

  it("returns not_started when stage and status null", () => {
    expect(
      resolveScopeSquareSemantic({
        scopeStage: null,
        scopeStatus: null,
        inspectionStatus: null,
      })
    ).toBe("not_started");
  });
});

describe("getScopeSquareStyle()", () => {
  it("uses solid border for FAILED inspection", () => {
    const s = getScopeSquareStyle({
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      inspectionStatus: "FAILED",
    });
    expect(s.semantic).toBe("failed_inspection");
    expect(s.borderStyle).toBe("solid");
    expect(s.borderWidth).toBe(0); // no stroke on solid red fill
  });

  it("uses unified pass/fail colors and shield-label for FIELD_VERIFICATION", () => {
    const s = getScopeSquareStyle({
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      inspectionStatus: "PASSED",
      latestInspectionCategory: "FIELD_VERIFICATION",
    });
    expect(s.backgroundColor).toBe("var(--scope-tile-passed-bg)");
    expect(s.icon).toBe("shield-label");
    expect(s.shieldLabel).toBe("FV");
    expect(s.shieldStrokeColor).toBe("var(--scope-tile-passed-shield-stroke)");
    expect(s.shieldFillColor).toBe("var(--scope-tile-passed-shield-fill)");
    expect(s.showPassedCheck).toBe(false);
    expect(s.showFailedX).toBe(false);
  });

  it("uses shield-label with 2C for TWO_AREA_CLEAR fail", () => {
    const s = getScopeSquareStyle({
      scopeStage: "STAGING",
      scopeStatus: "IN_PROGRESS",
      inspectionStatus: "FAILED",
      latestInspectionCategory: "TWO_AREA_CLEAR",
    });
    expect(s.backgroundColor).toBe("var(--scope-tile-failed-bg)");
    expect(s.shieldLabel).toBe("2C");
    expect(s.shieldStrokeColor).toBe("var(--scope-tile-failed-shield-stroke)");
    expect(s.shieldFillColor).toBe("var(--scope-tile-failed-shield-fill)");
  });

  it("uses solid border and no stroke for pre-install IN_PROGRESS (STAGING/ASSEMBLY)", () => {
    const s = getScopeSquareStyle({
      scopeStage: "ASSEMBLY",
      scopeStatus: "IN_PROGRESS",
      inspectionStatus: null,
    });
    expect(s.borderStyle).toBe("solid");
    expect(s.borderWidth).toBe(0);
    expect(s.semantic).toBe("assembly");
    expect(s.icon).toBe("stack");
  });

  it("uses light blue package tile for STAGING (distinct from not started gray dash)", () => {
    const staging = getScopeSquareStyle({
      scopeStage: "STAGING",
      scopeStatus: "IN_PROGRESS",
      inspectionStatus: null,
    });
    expect(staging.backgroundColor).toBe("var(--scope-tile-staging-bg)");
    expect(staging.foregroundColor).toBe("var(--scope-tile-staging-fg)");
    expect(staging.icon).toBe("package");

    const notStarted = getScopeSquareStyle({
      scopeStage: null,
      scopeStatus: "NOT_STARTED",
      inspectionStatus: null,
    });
    expect(notStarted.backgroundColor).toBe("var(--scope-tile-not-started-bg)");
    expect(notStarted.icon).toBe("dash");
    expect(notStarted.backgroundColor).not.toBe(staging.backgroundColor);
  });

  it("uses readable warning styling for INSTALL+IN_PROGRESS", () => {
    const s = getScopeSquareStyle({
      scopeStage: "INSTALL",
      scopeStatus: "IN_PROGRESS",
      inspectionStatus: null,
    });
    expect(s.borderStyle).toBe("solid");
    expect(s.borderWidth).toBe(0);
    expect(s.backgroundColor).toBe("var(--scope-tile-install-bg)");
    expect(s.semantic).toBe("install_in_progress");
  });

  it("uses mint styling for INSTALL+PENDING_VERIFICATION", () => {
    const s = getScopeSquareStyle({
      scopeStage: "INSTALL",
      scopeStatus: "PENDING_VERIFICATION",
      inspectionStatus: null,
    });
    expect(s.semantic).toBe("install_complete_sub");
    expect(s.borderStyle).toBe("solid");
    expect(s.borderWidth).toBe(0);
    expect(s.backgroundColor).toBe("var(--scope-tile-sub-bg)");
  });

  it("uses solid border when INSTALL+COMPLETE", () => {
    const s = getScopeSquareStyle({
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      inspectionStatus: null,
    });
    expect(s.borderStyle).toBe("solid");
    expect(s.semantic).toBe("install_complete");
  });

  it("READY after install complete looks identical to install_complete (no stripe)", () => {
    // Intentional: READY visually matches plain install-complete (green fill, no stripe)
    // so the grid stays green rather than switching to a confusing blue/stripe treatment.
    const s = getScopeSquareStyle({
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      inspectionStatus: "READY",
    });
    expect(s.inspectionStripeColor).toBeNull();
    expect(s.semantic).toBe("inspection_ready");
    expect(s.backgroundColor).toBe("var(--scope-tile-verified-bg)");
  });
});

describe("isScopeInstallComplete()", () => {
  it("is true only for INSTALL+COMPLETE", () => {
    expect(
      isScopeInstallComplete({
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
      })
    ).toBe(true);
    expect(
      isScopeInstallComplete({
        scopeStage: "ASSEMBLY",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
      })
    ).toBe(false);
    expect(
      isScopeInstallComplete({
        scopeStage: "INSTALL",
        scopeStatus: "PENDING_VERIFICATION",
        inspectionStatus: null,
      })
    ).toBe(false);
  });
});

describe("isScopeInstallCompleteSub()", () => {
  it("is true only for INSTALL+PENDING_VERIFICATION", () => {
    expect(
      isScopeInstallCompleteSub({
        scopeStage: "INSTALL",
        scopeStatus: "PENDING_VERIFICATION",
        inspectionStatus: null,
      })
    ).toBe(true);
    expect(
      isScopeInstallCompleteSub({
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
      })
    ).toBe(false);
  });
});

describe("SCOPE_STATUS_DOT_COLOR", () => {
  it("uses readable saturated color for IN_PROGRESS badges", () => {
    expect(SCOPE_STATUS_DOT_COLOR.IN_PROGRESS).toBe("var(--scope-tile-install-fg)");
  });
});

describe("subScopeDotColor()", () => {
  it("always returns error-600 when sub-scope is BLOCKED regardless of parent", () => {
    expect(subScopeDotColor("INSTALL", "COMPLETE", "BLOCKED")).toBe("var(--error-600)");
    expect(subScopeDotColor("STAGING", "IN_PROGRESS", "BLOCKED")).toBe("var(--error-600)");
    expect(subScopeDotColor(null, null, "BLOCKED")).toBe("var(--error-600)");
  });

  it("returns neutral-500 when parent stage is null", () => {
    expect(subScopeDotColor(null, null, "IN_PROGRESS")).toBe("var(--neutral-500)");
    expect(subScopeDotColor(null, "NOT_STARTED", "NOT_STARTED")).toBe("var(--neutral-500)");
  });

  it("returns primary-400 for STAGING parent stage", () => {
    expect(subScopeDotColor("STAGING", "IN_PROGRESS", "IN_PROGRESS")).toBe("var(--scope-tile-staging-fg)");
    expect(subScopeDotColor("STAGING", "COMPLETE", "COMPLETE")).toBe("var(--scope-tile-staging-fg)");
  });

  it("returns primary-400 for ASSEMBLY parent stage", () => {
    expect(subScopeDotColor("ASSEMBLY", "IN_PROGRESS", "IN_PROGRESS")).toBe("var(--scope-tile-assembly-fg)");
  });

  it("returns success-500 for INSTALL+IN_PROGRESS parent (install in-progress)", () => {
    expect(subScopeDotColor("INSTALL", "IN_PROGRESS", "IN_PROGRESS")).toBe("var(--scope-tile-install-fg)");
    expect(subScopeDotColor("INSTALL", "NOT_STARTED", "NOT_STARTED")).toBe("var(--scope-tile-install-fg)");
  });

  it("returns contrasting fg on INSTALL+COMPLETE parent (verified green tile)", () => {
    expect(subScopeDotColor("INSTALL", "COMPLETE", "COMPLETE")).toBe("var(--scope-tile-verified-fg)");
    expect(subScopeDotColor("INSTALL", "COMPLETE", "NOT_STARTED")).toBe(
      "color-mix(in srgb, var(--scope-tile-verified-fg) 40%, transparent)",
    );
    expect(subScopeDotColor("INSTALL", "COMPLETE", "IN_PROGRESS")).toBe(
      "color-mix(in srgb, var(--scope-tile-verified-fg) 70%, transparent)",
    );
  });
});

describe("gridInspectionShieldAbbrev()", () => {
  it("maps inspection categories to grid shield labels", () => {
    expect(gridInspectionShieldAbbrev("CLEAR_INSPECTION")).toBe("CI");
    expect(gridInspectionShieldAbbrev("BACKFILL")).toBe("CI");
    expect(gridInspectionShieldAbbrev("FIELD_VERIFICATION")).toBe("FV");
    expect(gridInspectionShieldAbbrev("TWO_AREA_CLEAR")).toBe("2C");
    expect(gridInspectionShieldAbbrev(null)).toBe("CI");
  });
});

describe("scopeAbbrevFromRow()", () => {
  it("uses short code as-is", () => {
    expect(scopeAbbrevFromRow({ code: "FLR", name: "Flooring" }, "")).toBe("FLR");
  });

  it("truncates long code", () => {
    expect(scopeAbbrevFromRow({ code: "FLOOR", name: "Flooring" }, "")).toBe("FLO");
  });

  it("uses two-word initials when no code", () => {
    expect(scopeAbbrevFromRow(null, "Game Room")).toBe("GR");
  });
});

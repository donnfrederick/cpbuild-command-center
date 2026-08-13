import { describe, it, expect } from "vitest";
import {
  SCOPE_COMBINED_OPTIONS,
  getScopeCombinedOptions,
  scopeTypeSkipsAssemblyStage,
  effectiveStageStatusForCombinedUi,
  combinedOptionDisplay,
  isCombinedMatch,
  type ScopeTypeShape,
} from "@/lib/scope-combined-options";

// ── scopeTypeSkipsAssemblyStage ───────────────────────────────────────────────

describe("scopeTypeSkipsAssemblyStage()", () => {
  it("returns true when scopeType.code is TOP", () => {
    expect(scopeTypeSkipsAssemblyStage({ id: "1", code: "TOP", name: "Tops" })).toBe(true);
  });

  it("returns true when canonicalScopeType.code is TOP", () => {
    expect(
      scopeTypeSkipsAssemblyStage({
        id: "1",
        code: "CUSTOM",
        name: "Custom Tops",
        canonicalScopeType: { id: "c1", code: "TOP", displayName: "Countertop" },
      })
    ).toBe(true);
  });

  it("returns true when scopeType.name contains 'countertop' (case-insensitive)", () => {
    expect(scopeTypeSkipsAssemblyStage({ id: "1", code: "X", name: "Granite Countertop" })).toBe(true);
    expect(scopeTypeSkipsAssemblyStage({ id: "1", code: "X", name: "COUNTERTOP MARBLE" })).toBe(true);
  });

  it("returns false for non-countertop scope types", () => {
    expect(scopeTypeSkipsAssemblyStage({ id: "1", code: "CAB", name: "Cabinets" })).toBe(false);
    expect(scopeTypeSkipsAssemblyStage({ id: "1", code: "FLR", name: "Flooring" })).toBe(false);
  });

  it("returns false for null scopeType", () => {
    expect(scopeTypeSkipsAssemblyStage(null)).toBe(false);
  });

  it("returns false when only canonicalScopeType is present with a non-TOP code", () => {
    const scopeType: ScopeTypeShape = {
      id: "1",
      code: "X",
      name: "Custom",
      canonicalScopeType: { id: "c1", code: "CAB", displayName: "Cabinets" },
    };
    expect(scopeTypeSkipsAssemblyStage(scopeType)).toBe(false);
  });
});

// ── getScopeCombinedOptions ───────────────────────────────────────────────────

describe("getScopeCombinedOptions()", () => {
  it("returns all 5 options when skipAssembly is false", () => {
    const opts = getScopeCombinedOptions(false);
    expect(opts).toHaveLength(5);
    expect(opts.map((o) => o.key)).toContain("in_assembly");
  });

  it("returns 4 options when skipAssembly is true, excluding in_assembly", () => {
    const opts = getScopeCombinedOptions(true);
    expect(opts).toHaveLength(4);
    expect(opts.map((o) => o.key)).not.toContain("in_assembly");
  });

  it("still includes in_staging, install_progress, install_complete when skipAssembly is true", () => {
    const keys = getScopeCombinedOptions(true).map((o) => o.key);
    expect(keys).toContain("in_staging");
    expect(keys).toContain("install_progress");
    expect(keys).toContain("install_complete");
  });

  it("returns the same reference as SCOPE_COMBINED_OPTIONS when skipAssembly is false", () => {
    expect(getScopeCombinedOptions(false)).toBe(SCOPE_COMBINED_OPTIONS);
  });

  it("uses light blue for In Staging and In Assembly — not brand primary orange", () => {
    const staging = SCOPE_COMBINED_OPTIONS.find((o) => o.key === "in_staging")!;
    const assembly = SCOPE_COMBINED_OPTIONS.find((o) => o.key === "in_assembly")!;
    expect(staging.color).toBe("var(--scope-tile-staging-fg)");
    expect(staging.bg).toBe("var(--scope-tile-staging-bg)");
    expect(staging.icon).toBe("package");
    expect(assembly.color).toBe("var(--scope-tile-assembly-fg)");
    expect(assembly.bg).toBe("var(--scope-tile-assembly-bg)");
    expect(assembly.icon).toBe("stack");
    expect(staging.color).not.toContain("primary-500");
    expect(assembly.color).not.toContain("primary-500");
  });
});

// ── effectiveStageStatusForCombinedUi ────────────────────────────────────────

describe("effectiveStageStatusForCombinedUi()", () => {
  it("remaps ASSEMBLY/IN_PROGRESS → STAGING/IN_PROGRESS when skipAssembly is true", () => {
    expect(
      effectiveStageStatusForCombinedUi("ASSEMBLY", "IN_PROGRESS", true)
    ).toEqual({ stage: "STAGING", status: "IN_PROGRESS" });
  });

  it("does not remap ASSEMBLY/IN_PROGRESS when skipAssembly is false", () => {
    expect(
      effectiveStageStatusForCombinedUi("ASSEMBLY", "IN_PROGRESS", false)
    ).toEqual({ stage: "ASSEMBLY", status: "IN_PROGRESS" });
  });

  it("does not remap ASSEMBLY/BLOCKED (only IN_PROGRESS is legacy)", () => {
    expect(
      effectiveStageStatusForCombinedUi("ASSEMBLY", "BLOCKED", true)
    ).toEqual({ stage: "ASSEMBLY", status: "BLOCKED" });
  });

  it("passes through STAGING/IN_PROGRESS unchanged", () => {
    expect(
      effectiveStageStatusForCombinedUi("STAGING", "IN_PROGRESS", true)
    ).toEqual({ stage: "STAGING", status: "IN_PROGRESS" });
  });

  it("passes through null stage unchanged", () => {
    expect(
      effectiveStageStatusForCombinedUi(null, "NOT_STARTED", true)
    ).toEqual({ stage: null, status: "NOT_STARTED" });
  });
});

// ── combinedOptionDisplay ─────────────────────────────────────────────────────

describe("combinedOptionDisplay()", () => {
  it("returns the matching option display for INSTALL/COMPLETE", () => {
    const result = combinedOptionDisplay("INSTALL", "COMPLETE");
    expect(result.label).toBe("Install Complete-Verified");
  });

  it("uses readable warning colors for install in-progress", () => {
    const result = combinedOptionDisplay("INSTALL", "IN_PROGRESS");
    expect(result.color).toBe("var(--warning-600)");
    expect(result.bg).toBe("var(--warning-100)");
    expect(result.dotColor).toBe("var(--warning-600)");
  });

  it("uses design tokens for install complete displays", () => {
    const sub = combinedOptionDisplay("INSTALL", "PENDING_VERIFICATION");
    expect(sub.color).toBe("var(--success-500)");
    expect(sub.bg).toBe("var(--success-50)");
    expect(sub.triggerBg).toBe("var(--success-50)");
    expect(sub.textColor).toBe("var(--success-700)");

    const verified = combinedOptionDisplay("INSTALL", "COMPLETE");
    expect(verified.color).toBe("var(--success-700)");
    expect(verified.bg).toBe("var(--success-100)");
    expect(verified.triggerBg).toBe("var(--success-600)");
    expect(verified.textColor).toBe("var(--neutral-0)");
  });

  it("returns In Staging display for STAGING/IN_PROGRESS", () => {
    const result = combinedOptionDisplay("STAGING", "IN_PROGRESS");
    expect(result.label).toBe("In Staging");
  });

  it("returns In Assembly display for ASSEMBLY/IN_PROGRESS when skipAssembly is false", () => {
    const result = combinedOptionDisplay("ASSEMBLY", "IN_PROGRESS", false);
    expect(result.label).toBe("In Assembly");
  });

  it("remaps ASSEMBLY/IN_PROGRESS to In Staging when skipAssembly is true", () => {
    const result = combinedOptionDisplay("ASSEMBLY", "IN_PROGRESS", true);
    expect(result.label).toBe("In Staging");
  });

  it("returns Blocked for BLOCKED status regardless of stage", () => {
    const result = combinedOptionDisplay("INSTALL", "BLOCKED");
    expect(result.label).toBe("Blocked");
  });

  it("returns Not started for null stage/status", () => {
    const result = combinedOptionDisplay(null, null);
    expect(result.label).toBe("Not started");
  });
});

// ── isCombinedMatch ───────────────────────────────────────────────────────────

describe("isCombinedMatch()", () => {
  const stagingOpt = SCOPE_COMBINED_OPTIONS.find((o) => o.key === "in_staging")!;
  const assemblyOpt = SCOPE_COMBINED_OPTIONS.find((o) => o.key === "in_assembly")!;

  it("matches exactly when stage and status equal the option", () => {
    expect(isCombinedMatch("STAGING", "IN_PROGRESS", stagingOpt)).toBe(true);
    expect(isCombinedMatch("ASSEMBLY", "IN_PROGRESS", assemblyOpt)).toBe(true);
  });

  it("does not match the wrong option", () => {
    expect(isCombinedMatch("STAGING", "IN_PROGRESS", assemblyOpt)).toBe(false);
    expect(isCombinedMatch("ASSEMBLY", "IN_PROGRESS", stagingOpt)).toBe(false);
  });

  it("matches the in_staging option for ASSEMBLY/IN_PROGRESS when skipAssembly is true (legacy remap)", () => {
    expect(isCombinedMatch("ASSEMBLY", "IN_PROGRESS", stagingOpt, true)).toBe(true);
  });

  it("does not match in_assembly option for ASSEMBLY/IN_PROGRESS when skipAssembly is true", () => {
    expect(isCombinedMatch("ASSEMBLY", "IN_PROGRESS", assemblyOpt, true)).toBe(false);
  });

  it("still matches ASSEMBLY/IN_PROGRESS against assemblyOpt when skipAssembly is false", () => {
    expect(isCombinedMatch("ASSEMBLY", "IN_PROGRESS", assemblyOpt, false)).toBe(true);
  });
});

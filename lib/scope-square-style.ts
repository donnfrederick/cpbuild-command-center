/**
 * Presentation tokens for Field Tracker grid scope tiles.
 *
 * The grid card uses a compact status tile system:
 *   Staging                 → light blue tile + package
 *   In Assembly             → blue tile + overlapping squares (stack)
 *   Install In Progress     → yellow tile + hammer
 *   Install Complete-Unverified → mint tile + clipboard
 *   Install Complete-Verified → green tile + clipboard check
 *   Clear / FV / 2AC / … Inspection Passed → green tile + shield with type abbrev (CI, FV, 2C)
 *   Clear / FV / 2AC / … Inspection Failed  → red tile + shield with type abbrev
 *   Issue Flagged           → layered by the component via issue props
 */

import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";
import type { InspectionCategory } from "@/components/forms/formTypes";

export type InspectionStatus = "READY" | "PASSED" | "FAILED" | null;

/** Latest non-calibration category driving grid tile shield colors (derived at read time). */
export type ScopeTileInspectionCategory = InspectionCategory | "BACKFILL" | null;

export interface ScopeRowStyleInput {
  scopeStage: ScopeStage;
  scopeStatus: ScopeStatus;
  inspectionStatus: InspectionStatus;
  /** When set with PASSED/FAILED, selects shield label/abbrev on grid tiles (tile bg uses unified pass/fail colors). */
  latestInspectionCategory?: ScopeTileInspectionCategory;
}

export type ScopeSquareSemantic =
  | "failed_inspection"
  | "blocked"
  | "assembly"
  | "install_in_progress"
  | "inspection_ready"
  | "inspection_passed"
  | "install_complete"
  | "install_complete_sub"
  | "staging_assembly_progress"
  | "not_started"
  | "neutral";

export interface ScopeSquareStyleResult {
  semantic: ScopeSquareSemantic;
  backgroundColor: string;
  foregroundColor: string;
  borderColor: string;
  borderStyle: "solid" | "dashed";
  borderWidth: number;
  /** Bottom stripe when inspection READY after install complete */
  inspectionStripeColor: string | null;
  /** Icon used by the visual scope tile. */
  icon: "dash" | "package" | "stack" | "hammer" | "clipboard" | "clipboard-check" | "shield-label" | "alert";
  /** When icon is shield-label, abbreviation rendered inside the shield (CI, FV, 2C, …). */
  shieldLabel?: string;
  /** Muted shield outline — tinted by tile bg, not pure white. */
  shieldStrokeColor?: string;
  /** Soft shield interior fill. */
  shieldFillColor?: string;
  /** @deprecated use icon instead. */
  showFailedX: boolean;
  /** @deprecated use icon instead. */
  showPassedCheck: boolean;
  /** When true, abbreviation and symbol render in white (dark fill) */
  invertText: boolean;
}

/** Sub-scope dot color by status — used in ScopeStatusSquare and sub-scope badges. */
export const SCOPE_STATUS_DOT_COLOR: Record<ScopeStatus & string, string> = {
  NOT_STARTED:          "rgba(0,0,0,0.28)",
  IN_PROGRESS:          "var(--scope-tile-install-fg)",
  PENDING_VERIFICATION: "var(--scope-tile-sub-fg)",
  COMPLETE:             "var(--scope-tile-verified-bg)",
  BLOCKED:              "var(--scope-tile-issue-fg)",
};

/**
 * Dot color for a single sub-scope instance.
 * Blocked sub-scopes always show red regardless of parent state.
 * All other sub-scopes echo a slightly darker shade of the parent scope's fill color.
 */
export function subScopeDotColor(
  parentStage: ScopeStage,
  parentStatus: ScopeStatus,
  subScopeStatus: ScopeStatus
): string {
  if (subScopeStatus === "BLOCKED") return "var(--error-600)";
  if (!parentStage) return "var(--neutral-500)";
  if (parentStage === "STAGING") return "var(--scope-tile-staging-fg)";
  if (parentStage === "ASSEMBLY") return "var(--scope-tile-assembly-fg)";
  if (parentStage === "INSTALL" && parentStatus === "PENDING_VERIFICATION") return "var(--scope-tile-sub-fg)";
  if (parentStage === "INSTALL" && parentStatus === "COMPLETE") {
    // Verified install tiles use a green fill — dots must contrast (fg), not match the bg.
    if (subScopeStatus === "NOT_STARTED") {
      return "color-mix(in srgb, var(--scope-tile-verified-fg) 40%, transparent)";
    }
    if (subScopeStatus === "IN_PROGRESS") {
      return "color-mix(in srgb, var(--scope-tile-verified-fg) 70%, transparent)";
    }
    return "var(--scope-tile-verified-fg)";
  }
  if (parentStage === "INSTALL") return "var(--scope-tile-install-fg)";
  return "var(--scope-tile-staging-fg)";
}

/** True for INSTALL+COMPLETE (verified) only — used for inspection gates and stats. */
export function isScopeInstallComplete(s: ScopeRowStyleInput): boolean {
  return s.scopeStage === "INSTALL" && s.scopeStatus === "COMPLETE";
}

/** True for INSTALL+PENDING_VERIFICATION — sub-reported complete, not yet verified. */
export function isScopeInstallCompleteSub(s: ScopeRowStyleInput): boolean {
  return s.scopeStage === "INSTALL" && s.scopeStatus === "PENDING_VERIFICATION";
}

/** Exposed for tests — matches resolver precedence. */
export function resolveScopeSquareSemantic(s: ScopeRowStyleInput): ScopeSquareSemantic {
  if (s.inspectionStatus === "FAILED") return "failed_inspection";
  if (s.inspectionStatus === "PASSED") return "inspection_passed";
  if (s.scopeStatus === "BLOCKED") return "blocked";
  if (isScopeInstallComplete(s)) {
    if (s.inspectionStatus === "READY") return "inspection_ready";
    return "install_complete";
  }
  if (isScopeInstallCompleteSub(s)) return "install_complete_sub";
  if (s.scopeStage === "ASSEMBLY") return "assembly";
  if (s.scopeStage === "INSTALL" && s.scopeStatus === "IN_PROGRESS") return "install_in_progress";
  if (s.scopeStatus === "IN_PROGRESS") return "staging_assembly_progress";
  if (s.scopeStatus === "NOT_STARTED" || (!s.scopeStage && !s.scopeStatus)) return "not_started";
  if (s.scopeStatus === "COMPLETE" && s.scopeStage !== "INSTALL") return "staging_assembly_progress";
  return "neutral";
}

/** Abbreviation rendered inside grid inspection shields (Hannah v1 — CI / FV / 2C). */
export function gridInspectionShieldAbbrev(
  category: ScopeTileInspectionCategory,
): string {
  switch (category) {
    case "FIELD_VERIFICATION":
      return "FV";
    case "TWO_AREA_CLEAR":
      return "2C";
    case "GYPCRETE_MOISTURE_TEST":
      return "GY";
    case "OTHER":
      return "OT";
    case "BACKFILL":
    case "CLEAR_INSPECTION":
    case null:
    default:
      return "CI";
  }
}

function inspectionOutcomeTileStyle(
  inspectionStatus: InspectionStatus,
  category: ScopeTileInspectionCategory,
): ScopeSquareStyleResult | null {
  if (inspectionStatus !== "FAILED" && inspectionStatus !== "PASSED") {
    return null;
  }

  const failed = inspectionStatus === "FAILED";
  const semantic: ScopeSquareSemantic = failed ? "failed_inspection" : "inspection_passed";

  return {
    semantic,
    backgroundColor: failed ? "var(--scope-tile-failed-bg)" : "var(--scope-tile-passed-bg)",
    foregroundColor: failed ? "var(--scope-tile-failed-fg)" : "var(--scope-tile-passed-fg)",
    borderColor: "transparent",
    borderStyle: "solid",
    borderWidth: 0,
    inspectionStripeColor: null,
    icon: "shield-label",
    shieldLabel: gridInspectionShieldAbbrev(category),
    shieldStrokeColor: failed ? "var(--scope-tile-failed-shield-stroke)" : "var(--scope-tile-passed-shield-stroke)",
    shieldFillColor: failed ? "var(--scope-tile-failed-shield-fill)" : "var(--scope-tile-passed-shield-fill)",
    showFailedX: false,
    showPassedCheck: false,
    invertText: true,
  };
}

export function getScopeSquareStyle(s: ScopeRowStyleInput): ScopeSquareStyleResult {
  const inspectionTile = inspectionOutcomeTileStyle(s.inspectionStatus, s.latestInspectionCategory ?? null);
  if (inspectionTile) {
    return inspectionTile;
  }

  // ── Override: blocked ────────────────────────────────────────────────────────
  if (s.scopeStatus === "BLOCKED") {
    return {
      semantic: "blocked",
      backgroundColor: "var(--scope-tile-issue-bg)",
      foregroundColor: "var(--scope-tile-issue-fg)",
      borderColor: "transparent",
      borderStyle: "solid",
      borderWidth: 0,
      inspectionStripeColor: null,
      icon: "alert",
      showFailedX: false,
      showPassedCheck: false,
      invertText: false,
    };
  }

  // ── Install complete (the #1 scan target) ────────────────────────────────────
  if (isScopeInstallComplete(s)) {
    let inspectionStripeColor: string | null = null;
    let semantic: ScopeSquareSemantic = "install_complete";
    let borderColor = "transparent";
    let backgroundColor = "var(--scope-tile-verified-bg)";
    let foregroundColor = "var(--scope-tile-verified-fg)";
    let icon: ScopeSquareStyleResult["icon"] = "clipboard-check";
    let invertText = true;

    if (s.inspectionStatus === "READY") {
      // READY = inspection has been started but not submitted yet.
      // Visually identical to plain install-complete so the grid stays
      // green rather than switching to a blue/stripe treatment that
      // confuses users who expect the square to stay green.
      semantic = "inspection_ready";
      // Visual language stays verified-green while inspection is pending.
    } else if (s.inspectionStatus === "PASSED") {
      semantic = "inspection_passed";
      inspectionStripeColor = null;
      borderColor = "transparent";
      backgroundColor = "var(--scope-tile-passed-bg)";
      foregroundColor = "var(--scope-tile-passed-fg)";
      icon = "shield-label";
      invertText = true;
    }

    return {
      semantic,
      backgroundColor,
      foregroundColor,
      borderColor,
      borderStyle: "solid",
      borderWidth: 0,
      inspectionStripeColor,
      icon,
      ...(icon === "shield-label"
        ? {
            shieldLabel: gridInspectionShieldAbbrev(s.latestInspectionCategory ?? null),
            shieldStrokeColor: "var(--scope-tile-passed-shield-stroke)",
            shieldFillColor: "var(--scope-tile-passed-shield-fill)",
          }
        : {}),
      showFailedX: false,
      showPassedCheck: false,
      invertText,
    };
  }

  // ── Install: Complete-Unverified (PENDING_VERIFICATION) — dashed green box (sub says done, unverified) ──
  if (isScopeInstallCompleteSub(s)) {
    return {
      semantic: "install_complete_sub",
      backgroundColor: "var(--scope-tile-sub-bg)",
      foregroundColor: "var(--scope-tile-sub-fg)",
      borderColor: "transparent",
      borderStyle: "solid",
      borderWidth: 0,
      inspectionStripeColor: null,
      icon: "clipboard",
      showFailedX: false,
      showPassedCheck: false,
      invertText: false,
    };
  }

  // ── Install: In Progress — light yellow fill, no border ──────────────────────
  if (s.scopeStage === "INSTALL" && s.scopeStatus === "IN_PROGRESS") {
    return {
      semantic: "install_in_progress",
      backgroundColor: "var(--scope-tile-install-bg)",
      foregroundColor: "var(--scope-tile-install-fg)",
      borderColor: "transparent",
      borderStyle: "solid",
      borderWidth: 0,
      inspectionStripeColor: null,
      icon: "hammer",
      showFailedX: false,
      showPassedCheck: false,
      invertText: false,
    };
  }

  // ── Not started ──────────────────────────────────────────────────────────────
  if (s.scopeStatus === "NOT_STARTED" || (!s.scopeStage && !s.scopeStatus)) {
    return {
      semantic: "not_started",
      backgroundColor: "var(--scope-tile-not-started-bg)",
      foregroundColor: "var(--scope-tile-not-started-fg)",
      borderColor: "transparent",
      borderStyle: "solid",
      borderWidth: 0,
      inspectionStripeColor: null,
      icon: "dash",
      showFailedX: false,
      showPassedCheck: false,
      invertText: false,
    };
  }

  // ── In Staging ───────────────────────────────────────────────────────────────
  if (s.scopeStage === "STAGING") {
    return {
      semantic: "staging_assembly_progress",
      backgroundColor: "var(--scope-tile-staging-bg)",
      foregroundColor: "var(--scope-tile-staging-fg)",
      borderColor: "transparent",
      borderStyle: "solid",
      borderWidth: 0,
      inspectionStripeColor: null,
      icon: "package",
      showFailedX: false,
      showPassedCheck: false,
      invertText: false,
    };
  }

  // ── In Assembly ──────────────────────────────────────────────────────────────
  if (s.scopeStage === "ASSEMBLY") {
    return {
      semantic: "assembly",
      backgroundColor: "var(--scope-tile-assembly-bg)",
      foregroundColor: "var(--scope-tile-assembly-fg)",
      borderColor: "transparent",
      borderStyle: "solid",
      borderWidth: 0,
      inspectionStripeColor: null,
      icon: "stack",
      showFailedX: false,
      showPassedCheck: false,
      invertText: false,
    };
  }

  // ── Fallback (no stage set, some status) ─────────────────────────────────────
  return {
    semantic: "neutral",
    backgroundColor: "var(--scope-tile-not-started-bg)",
    foregroundColor: "var(--scope-tile-not-started-fg)",
    borderColor: "transparent",
    borderStyle: "solid",
    borderWidth: 0,
    inspectionStripeColor: null,
    icon: "dash",
    showFailedX: false,
    showPassedCheck: false,
    invertText: false,
  };
}

/** v1 abbrev: code when short, else initials / truncation from name or description. */
export function scopeAbbrevFromRow(
  scopeType: { code: string; name: string } | null,
  description: string
): string {
  const code = scopeType?.code?.trim();
  if (code) {
    if (code.length <= 4) return code.toUpperCase();
    return code.slice(0, 3).toUpperCase();
  }
  const name = (scopeType?.name ?? "").trim() || description.trim();
  if (!name || name === "—") return "—";
  if (name.length <= 3) return name.toUpperCase();
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const a = words[0][0] ?? "";
    const b = words[1][0] ?? "";
    return (a + b).toUpperCase().slice(0, 3);
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Shared combined scope stage+status options used across all scope pickers.
 *
 * Countertop scopes (scopeType code "TOP") skip the Assembly stage entirely.
 * `getScopeCombinedOptions(skipAssembly)` returns the filtered list, and
 * `effectiveStageStatusForCombinedUi` remaps legacy ASSEMBLY/IN_PROGRESS data
 * to STAGING/IN_PROGRESS so the UI shows a valid state without a DB migration.
 */

import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";
import type { ScopeSquareStyleResult } from "@/lib/scope-square-style";

/** Icons aligned with Field Tracker scope tiles (see scope-square-style.ts). */
export type CombinedScopeOptionIcon = Extract<
  ScopeSquareStyleResult["icon"],
  "package" | "dash" | "stack" | "hammer" | "clipboard" | "clipboard-check"
>;

// Matches ScopeRow.scopeType from UnitCards.tsx (inlined to avoid a circular import).
export type ScopeTypeShape = {
  id: string;
  code: string;
  name: string;
  canonicalScopeType?: { id: string; code: string; displayName: string } | null;
} | null;

export interface CombinedScopeOption {
  key: string;
  label: string;
  stage: ScopeStage;
  status: ScopeStatus;
  color: string;
  /** Background used in the bottom sheet / dropdown option row. */
  bg: string;
  /** When set, the card trigger button uses this solid fill instead of `bg`. */
  triggerBg?: string;
  /** Text colour on the trigger button when `triggerBg` is set (e.g. white on solid green). */
  textColor?: string;
  /** When set, overrides `color` for the indicator dot only (useful when bg == dot color). */
  dotColor?: string;
  icon: CombinedScopeOptionIcon;
}

export const SCOPE_COMBINED_OPTIONS: CombinedScopeOption[] = [
  {
    key: "in_staging",
    label: "In Staging",
    stage: "STAGING",
    status: "IN_PROGRESS",
    color: "var(--scope-tile-staging-fg)",
    bg: "var(--scope-tile-staging-bg)",
    dotColor: "var(--scope-tile-staging-fg)",
    icon: "package",
  },
  {
    key: "in_assembly",
    label: "In Assembly",
    stage: "ASSEMBLY",
    status: "IN_PROGRESS",
    color: "var(--scope-tile-assembly-fg)",
    bg: "var(--scope-tile-assembly-bg)",
    dotColor: "var(--scope-tile-assembly-fg)",
    icon: "stack",
  },
  {
    key: "install_progress",
    label: "Install: In Progress",
    stage: "INSTALL",
    status: "IN_PROGRESS",
    color: "var(--warning-600)",
    bg: "var(--warning-100)",
    dotColor: "var(--warning-600)",
    icon: "hammer",
  },
  {
    key: "install_complete_sub",
    label: "Install Complete-Unverified",
    stage: "INSTALL",
    status: "PENDING_VERIFICATION",
    color: "var(--success-500)",
    bg: "var(--success-50)",
    triggerBg: "var(--success-50)",
    textColor: "var(--success-700)",
    icon: "clipboard",
  },
  {
    key: "install_complete",
    label: "Install Complete-Verified",
    stage: "INSTALL",
    status: "COMPLETE",
    color: "var(--success-700)",
    bg: "var(--success-100)",
    triggerBg: "var(--success-600)",
    textColor: "var(--neutral-0)",
    icon: "clipboard-check",
  },
];

/**
 * Returns the options list, optionally excluding "In Assembly" for countertop scopes.
 */
export function getScopeCombinedOptions(skipAssembly: boolean): CombinedScopeOption[] {
  if (!skipAssembly) return SCOPE_COMBINED_OPTIONS;
  return SCOPE_COMBINED_OPTIONS.filter((o) => o.key !== "in_assembly");
}

/** Both verified and sub-reported install-complete picker keys (server blocks both when a blocking issue is open). */
export function isInstallCompleteCombinedOptionKey(key: string): boolean {
  return key === "install_complete" || key === "install_complete_sub";
}

/** Install Complete-Verified picker key only — gated separately when no subcontractor is assigned. */
export function isInstallCompleteVerifiedCombinedOptionKey(key: string): boolean {
  return key === "install_complete";
}

/**
 * Returns true when the given scopeType represents a countertop scope that should
 * skip the Assembly stage in the UI.
 *
 * Detection logic (any one of):
 *   - canonicalScopeType.code === "TOP"
 *   - scopeType.code === "TOP"
 *   - scopeType.name contains "countertop" (case-insensitive)
 */
export function scopeTypeSkipsAssemblyStage(scopeType: ScopeTypeShape): boolean {
  if (!scopeType) return false;
  if (scopeType.canonicalScopeType?.code === "TOP") return true;
  if (scopeType.code === "TOP") return true;
  if (scopeType.name.toLowerCase().includes("countertop")) return true;
  return false;
}

/**
 * When a countertop scope has legacy ASSEMBLY/IN_PROGRESS data stored in the DB,
 * remap it to STAGING/IN_PROGRESS for display purposes only. No DB write occurs.
 */
export function effectiveStageStatusForCombinedUi(
  stage: ScopeStage,
  status: ScopeStatus,
  skipAssembly: boolean
): { stage: ScopeStage; status: ScopeStatus } {
  if (skipAssembly && stage === "ASSEMBLY" && status === "IN_PROGRESS") {
    return { stage: "STAGING", status: "IN_PROGRESS" };
  }
  return { stage, status };
}

/**
 * Returns the display metadata (label, color, bg) for a combined stage+status value.
 * Respects the `skipAssembly` flag to remap legacy assembly data.
 */
export function combinedOptionDisplay(
  stage: ScopeStage,
  status: ScopeStatus,
  skipAssembly = false
): {
  label: string;
  color: string;
  bg: string;
  triggerBg?: string;
  textColor?: string;
  icon?: CombinedScopeOptionIcon;
} {
  const effective = effectiveStageStatusForCombinedUi(stage, status, skipAssembly);
  const matched = SCOPE_COMBINED_OPTIONS.find(
    (o) => o.stage === effective.stage && o.status === effective.status
  );
  if (matched) return matched;
  if (status === "BLOCKED") return { label: "Blocked", color: "var(--error-600)", bg: "var(--error-100)" };
  return { label: "Not started", color: "var(--neutral-400)", bg: "var(--neutral-100)" };
}

/**
 * Returns true when the given stage+status matches the option, accounting for the
 * legacy ASSEMBLY/IN_PROGRESS → STAGING/IN_PROGRESS remap when `skipAssembly` is true.
 */
export function isCombinedMatch(
  stage: ScopeStage,
  status: ScopeStatus,
  opt: CombinedScopeOption,
  skipAssembly = false
): boolean {
  const effective = effectiveStageStatusForCombinedUi(stage, status, skipAssembly);
  return effective.stage === opt.stage && effective.status === opt.status;
}

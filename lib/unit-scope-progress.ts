/**
 * Unit-level progress for Field Tracker UI.
 *
 * Two calculation modes:
 *   - countInstallCompleteScopes / unitInstallCompletePercent: scope-count-based.
 *     Each scope is one equal share of 100%. Used for unit/location card headers,
 *     progress bars, and location rollups in Field Tracker.
 *   - unitQtyInstallCompletePercent: QTY-based within a scope (or across scopes when
 *     material weighting is required). Used for spreadsheet columns, level-scope
 *     reports, and per-scope rows in the progress breakdown tree.
 */

/** Matches `scopeStage` on project row APIs / Prisma. */
export type ScopeStage = "STAGING" | "ASSEMBLY" | "INSTALL" | null;

/** Matches `scopeStatus` on project row APIs / Prisma. */
export type ScopeStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "PENDING_VERIFICATION" | "COMPLETE" | null;

export type ScopeForUnitProgress = {
  scopeStage: ScopeStage;
  scopeStatus: ScopeStatus;
};

/** Sub-scope instance shape needed for qty-based progress. */
export type SubScopeForQtyProgress = {
  qty: number | null;
  scopeStage: ScopeStage;
  scopeStatus: ScopeStatus;
};

/** Scope shape needed for qty-based progress. */
export type ScopeForQtyProgress = {
  qty: number | null;
  scopeStage: ScopeStage;
  scopeStatus: ScopeStatus;
  subScopeInstances: ReadonlyArray<SubScopeForQtyProgress>;
};

/** INSTALL + COMPLETE (verified) or INSTALL + PENDING_VERIFICATION (sub-reported). */
export function isScopeInstallComplete(
  scopeStage: ScopeStage,
  scopeStatus: ScopeStatus
): boolean {
  return (
    scopeStage === "INSTALL" &&
    (scopeStatus === "COMPLETE" || scopeStatus === "PENDING_VERIFICATION")
  );
}

export function countInstallCompleteScopes(scopes: ReadonlyArray<ScopeForUnitProgress>): number {
  let n = 0;
  for (const s of scopes) {
    if (isScopeInstallComplete(s.scopeStage, s.scopeStatus)) n += 1;
  }
  return n;
}

/** Scope-count-based percent for unit/location cards — equal weight per scope. */
export function unitInstallCompletePercent(scopes: ReadonlyArray<ScopeForUnitProgress>): number {
  const total = scopes.length;
  if (total === 0) return 0;
  return Math.round((countInstallCompleteScopes(scopes) / total) * 100);
}

/**
 * QTY-based percent complete.
 *
 * For scopes with sub-scopes: each sub-scope instance contributes its qty
 * (falls back to 1 when qty is null) to both the numerator (if install-complete)
 * and the denominator.
 *
 * For scopes without sub-scopes: the scope's own qty (falls back to 1) is used.
 *
 * This measures how much material has been installed vs the total to be installed.
 */
export function unitQtyInstallCompletePercent(scopes: ReadonlyArray<ScopeForQtyProgress>): number {
  let totalQty = 0;
  let installedQty = 0;

  for (const scope of scopes) {
    if (scope.subScopeInstances.length > 0) {
      for (const inst of scope.subScopeInstances) {
        const q = inst.qty ?? 1;
        totalQty += q;
        if (inst.scopeStage === "INSTALL" && inst.scopeStatus === "COMPLETE") {
          installedQty += q;
        }
      }
    } else {
      const q = scope.qty ?? 1;
      totalQty += q;
      if (scope.scopeStage === "INSTALL" && scope.scopeStatus === "COMPLETE") {
        installedQty += q;
      }
    }
  }

  if (totalQty === 0) return 0;
  return Math.round((installedQty / totalQty) * 100);
}

/**
 * QTY-based percent for PENDING_VERIFICATION (unverified / SUB-reported complete).
 * Same weight logic as `unitQtyInstallCompletePercent` but counts
 * INSTALL + PENDING_VERIFICATION instead of INSTALL + COMPLETE.
 */
export function unitQtyInstallSubPercent(scopes: ReadonlyArray<ScopeForQtyProgress>): number {
  let totalQty = 0;
  let subQty = 0;

  for (const scope of scopes) {
    if (scope.subScopeInstances.length > 0) {
      for (const inst of scope.subScopeInstances) {
        const q = inst.qty ?? 1;
        totalQty += q;
        if (inst.scopeStage === "INSTALL" && inst.scopeStatus === "PENDING_VERIFICATION") {
          subQty += q;
        }
      }
    } else {
      const q = scope.qty ?? 1;
      totalQty += q;
      if (scope.scopeStage === "INSTALL" && scope.scopeStatus === "PENDING_VERIFICATION") {
        subQty += q;
      }
    }
  }

  if (totalQty === 0) return 0;
  return Math.round((subQty / totalQty) * 100);
}

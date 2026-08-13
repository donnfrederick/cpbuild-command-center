/**
 * Floor-covering canonical scope types — units with at least one of these
 * scopes are eligible for unit-level Gypcrete moisture tests.
 */
export const FLOORING_CANONICAL_SCOPE_CODES = [
  "CPB",
  "CPT",
  "HDW",
  "LVT",
  "RAF",
  "RBF",
  "TIL",
  "VCT",
  "VYL",
] as const;

export type FlooringCanonicalScopeCode = (typeof FLOORING_CANONICAL_SCOPE_CODES)[number];

const FLOORING_CODE_SET = new Set<string>(FLOORING_CANONICAL_SCOPE_CODES);

/** Minimal scope shape for eligibility checks (avoids importing UnitCards). */
export interface ScopeForFlooringCheck {
  scopeType?: {
    code?: string | null;
    canonicalScopeType?: { code?: string | null } | null;
  } | null;
}

/** Canonical scope code first, then legacy ScopeType.code fallback. */
export function resolveScopeCanonicalCode(scope: ScopeForFlooringCheck): string | null {
  const code =
    scope.scopeType?.canonicalScopeType?.code ?? scope.scopeType?.code ?? null;
  return code?.trim() ? code.trim() : null;
}

export function isFlooringCanonicalCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return FLOORING_CODE_SET.has(code.trim());
}

/** True when the unit contains at least one floor-covering scope row. */
export function unitHasFlooringScope(scopes: ScopeForFlooringCheck[]): boolean {
  return scopes.some((scope) => isFlooringCanonicalCode(resolveScopeCanonicalCode(scope)));
}

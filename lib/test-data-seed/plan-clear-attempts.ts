import type { InspectionOutcome } from "@/lib/inspections/submissionsApi";
import { DEFAULT_FAIL_THEN_PASS_RATIO } from "./constants";
import { shuffleInPlace } from "./random";

/**
 * Demo patterns assigned across a batch so small seeds still show pass-first,
 * fail-then-pass retries, and stuck-failed scopes in the inspections report.
 */
const GUARANTEED_CLEAR_PATTERNS: InspectionOutcome[][] = [
  ["PASS"],
  ["FAIL", "PASS"],
  ["FAIL"],
  ["FAIL", "FAIL"],
];

/**
 * Plans a chronological sequence of clear-inspection outcomes for one scope row.
 * - Some pass on the first attempt
 * - Some fail once then pass on retry
 * - Some fail and remain failed (1–3 failed attempts)
 */
export function planClearInspectionOutcomes(
  passedRatio: number,
  rng: () => number
): InspectionOutcome[] {
  const endsPassed = rng() < passedRatio;

  if (endsPassed) {
    const failThenPass = rng() < DEFAULT_FAIL_THEN_PASS_RATIO;
    return failThenPass ? ["FAIL", "PASS"] : ["PASS"];
  }

  const failAttempts = 1 + Math.floor(rng() * 3);
  return Array.from({ length: failAttempts }, () => "FAIL" as const);
}

/**
 * Plans outcomes for an entire clear-inspection seed batch.
 * Guarantees at least one of each major pattern when scope count allows,
 * then fills any remainder using {@link planClearInspectionOutcomes}.
 */
export function planClearInspectionOutcomesForBatch(
  scopeCount: number,
  passedRatio: number,
  rng: () => number
): InspectionOutcome[][] {
  if (scopeCount <= 0) return [];

  const guaranteedCount = Math.min(scopeCount, GUARANTEED_CLEAR_PATTERNS.length);
  const shuffledPatterns = shuffleInPlace(
    GUARANTEED_CLEAR_PATTERNS.map((pattern) => [...pattern]),
    rng
  );
  const results = shuffledPatterns.slice(0, guaranteedCount);

  while (results.length < scopeCount) {
    results.push(planClearInspectionOutcomes(passedRatio, rng));
  }

  return shuffleInPlace(results, rng);
}

/** Ensures calibration batches include both pass and fail when count ≥ 2. */
export function planCalibrationOutcomesForBatch(
  count: number,
  passedRatio: number,
  rng: () => number
): InspectionOutcome[] {
  if (count <= 0) return [];
  if (count === 1) {
    return [rng() < passedRatio ? "PASS" : "FAIL"];
  }

  const outcomes: InspectionOutcome[] = ["PASS", "FAIL"];
  while (outcomes.length < count) {
    outcomes.push(rng() < passedRatio ? "PASS" : "FAIL");
  }
  return shuffleInPlace(outcomes, rng);
}

export function finalInspectionStatusFromOutcomes(
  outcomes: InspectionOutcome[]
): "PASSED" | "FAILED" {
  const last = outcomes[outcomes.length - 1];
  return last === "FAIL" ? "FAILED" : "PASSED";
}

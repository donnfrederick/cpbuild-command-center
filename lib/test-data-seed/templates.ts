import { TEST_SEED_PREFIX } from "./constants";

export const ISSUE_DESCRIPTIONS = [
  `${TEST_SEED_PREFIX} Damaged trim at unit entry — touch-up required before turnover.`,
  `${TEST_SEED_PREFIX} Missing hardware on cabinet doors in kitchen scope.`,
  `${TEST_SEED_PREFIX} Substrate not ready — drywall patch needed prior to install.`,
  `${TEST_SEED_PREFIX} Flooring transition gap noted during walkthrough.`,
  `${TEST_SEED_PREFIX} Paint overspray on adjacent millwork.`,
];

export const ISSUE_NOTES = [
  `${TEST_SEED_PREFIX} Flagged during field walk; photos attached.`,
  `${TEST_SEED_PREFIX} Subcontractor notified; awaiting response.`,
  `${TEST_SEED_PREFIX} Blocking adjacent scope until resolved.`,
  "",
];

export const ISSUE_COMMENTS = [
  `${TEST_SEED_PREFIX} Verified on site — still open.`,
  `${TEST_SEED_PREFIX} Materials ordered; ETA next week.`,
  `${TEST_SEED_PREFIX} Resolved after re-inspection.`,
];

export const OBSERVATION_TITLES = [
  `${TEST_SEED_PREFIX} Progress check`,
  `${TEST_SEED_PREFIX} Quality note`,
  `${TEST_SEED_PREFIX} Safety observation`,
  `${TEST_SEED_PREFIX} Field note`,
];

export const OBSERVATION_DESCRIPTIONS = [
  `${TEST_SEED_PREFIX} Scope progressing on schedule; minor punch items remain.`,
  `${TEST_SEED_PREFIX} Good workmanship on visible surfaces; document for turnover packet.`,
  `${TEST_SEED_PREFIX} Housekeeping improved since last visit.`,
  `${TEST_SEED_PREFIX} Coordinate with PM before next inspection window.`,
];

export function unitRefFromRow(row: { building: string; level: string; unit: string }): string {
  return `${row.building}|${row.level}|${row.unit}`;
}

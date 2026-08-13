/** Visible prefix on all human-readable seeded text fields. */
export const TEST_SEED_PREFIX = "[TEST-SEED]";

export const MAX_SEED_ISSUES = 500;
export const MAX_SEED_OBSERVATIONS = 500;
export const MAX_SEED_CLEAR_INSPECTIONS = 500;
export const MAX_SEED_CALIBRATIONS = 500;

export const TEST_INSTALL_TEAM_CODE = "TEST_SUB";
export const TEST_INSTALL_TEAM_NAME = "Test Subcontractor";
export const TEST_SEED_SUB_UNIFIER_ID = "__TEST_SEED_SUB__";

export const DEFAULT_DATE_RANGE_DAYS = 90;
export const DEFAULT_RESOLVED_RATIO = 0.3;
export const DEFAULT_COMMENT_RATIO = 0.3;
export const DEFAULT_MEDIA_RATIO = 0.4;
export const DEFAULT_PASSED_RATIO = 0.7;
/** Of scopes that end PASSED, share that failed once before passing on retry. */
export const DEFAULT_FAIL_THEN_PASS_RATIO = 0.25;

export interface SeedCounts {
  issues: number;
  observations: number;
  clearInspections: number;
  calibrations: number;
  comments: number;
  activityLogs: number;
}

export interface SeedTestDataInput {
  issues?: { count: number; resolvedRatio?: number; commentRatio?: number };
  observations?: { count: number; withMediaRatio?: number };
  clearInspections?: { count: number; passedRatio?: number };
  calibrations?: { count: number; passedRatio?: number };
  dateRangeDays?: number;
  userIds: string[];
  randomSeed?: number;
}

export interface SeedTestDataResult {
  batchId: string;
  counts: SeedCounts;
  warnings?: string[];
  skipped?: {
    clearInspections: number;
    reason: string;
    noPublishedForm?: number;
    calibrations?: number;
    calibrationsReason?: string;
  };
}

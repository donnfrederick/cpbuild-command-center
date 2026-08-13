const DEV_LIKE = ["dev", "development", "staging"] as const;

function isDevLike(value: string | undefined): boolean {
  if (!value) return false;
  return DEV_LIKE.includes(value.toLowerCase() as (typeof DEV_LIKE)[number]);
}

/**
 * True when this Node process is serving the canonical production deployment:
 * NODE_ENV=production and not a dev/staging Railway environment (by APP_ENV,
 * RAILWAY_ENVIRONMENT_NAME, or RAILWAY_GIT_BRANCH=dev).
 *
 * Used for stricter rules on real customer project data. Intentionally does not
 * treat DEVTOOLS_ENABLED as non-production — that flag must not relax these rules.
 */
export function isStrictProductionDeployment(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (isDevLike(process.env.APP_ENV)) return false;
  if (isDevLike(process.env.RAILWAY_ENVIRONMENT_NAME)) return false;
  if (process.env.RAILWAY_GIT_BRANCH?.toLowerCase() === "dev") return false;
  return true;
}

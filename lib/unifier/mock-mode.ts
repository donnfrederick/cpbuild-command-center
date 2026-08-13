/** Allow mock in local (NODE_ENV !== production) and deployed dev (APP_ENV/RAILWAY env). */
export function isUnifierMockAllowed(): boolean {
  if (process.env.UNIFIER_MOCK !== "true") return false;
  if (process.env.NODE_ENV !== "production") return true;
  const devLike = ["dev", "development", "staging"];
  const check = (v: string | undefined) => v && devLike.includes(v.toLowerCase());
  return check(process.env.APP_ENV) === true || check(process.env.RAILWAY_ENVIRONMENT_NAME) === true;
}

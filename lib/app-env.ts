/** True for local dev, Railway dev, and any non-production Node env. */
export function isNonProd(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.APP_ENV === "dev";
}

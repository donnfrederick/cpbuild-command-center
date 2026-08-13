/** Extracts `eventType.notIn` from default activity visibility where (OR-shaped). */
export function activityWhereNotIn(
  where: Record<string, unknown> | undefined,
): string[] {
  if (!where) return [];
  const direct = (where as { eventType?: { notIn?: string[] } }).eventType?.notIn;
  if (direct) return direct;
  const or = (where as { OR?: Array<{ eventType?: { notIn?: string[] } }> }).OR;
  if (Array.isArray(or)) {
    for (const clause of or) {
      if (clause.eventType?.notIn) return clause.eventType.notIn;
    }
  }
  return [];
}

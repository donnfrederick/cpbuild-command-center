/** Shared select for inspector User join on clear_inspections history rows. */
export const INSPECTION_INSPECTOR_SELECT = {
  inspectedById: true,
  inspectedBy: { select: { id: true, name: true } },
} as const;

export function resolveInspectorName(
  clearInspection:
    | { inspectedBy?: { name: string | null } | null }
    | null
    | undefined,
  fallback = "—",
): string {
  const name = clearInspection?.inspectedBy?.name?.trim();
  return name || fallback;
}

export function resolveInspectorId(
  clearInspection:
    | { inspectedById?: string | null; inspectedBy?: { id: string } | null }
    | null
    | undefined,
): string | null {
  return clearInspection?.inspectedBy?.id ?? clearInspection?.inspectedById ?? null;
}

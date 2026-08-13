import { mergeGridInspectionFromSubmissions } from "@/lib/inspections/scope-grid-inspection-display";
import { listByProject, type InspectionSubmission } from "@/lib/inspections/submissionsApi";

export interface UnitsApiPage<T extends { id: string } = { id: string }> {
  units: T[];
  hasMore?: boolean;
  nextCursor?: string | null;
  total?: number;
  totalUnits?: number;
}

/** Fetch unit rows and project submissions together, then merge grid shields before first paint. */
export async function fetchUnitsWithGridInspection<T extends { id: string }>(
  projectId: string,
  unitsUrl: string,
  loadAllRows: boolean,
  init?: RequestInit,
): Promise<{ page: UnitsApiPage<T>; submissions: InspectionSubmission[] }> {
  const unitsPromise = fetch(unitsUrl, init).then(async (res) => {
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as UnitsApiPage<T>;
  });

  if (!loadAllRows) {
    const page = await unitsPromise;
    return { page, submissions: [] };
  }

  const [page, submissionsResult] = await Promise.all([
    unitsPromise,
    listByProject(projectId).catch((err) => {
      console.warn(
        "[fetchUnitsWithGridInspection] project submissions unavailable — using server grid enrichment",
        err,
      );
      return [] as InspectionSubmission[];
    }),
  ]);

  const submissions = submissionsResult;

  return {
    page: {
      ...page,
      units:
        submissions.length > 0
          ? mergeGridInspectionFromSubmissions(page.units, submissions)
          : page.units,
    },
    submissions,
  };
}

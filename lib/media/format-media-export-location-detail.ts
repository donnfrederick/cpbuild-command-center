import type { MediaExportLocationEntry } from "@/lib/media/media-export-types";

export interface MediaExportLocationDetailLabels {
  area: (value: string) => string;
  buildPhase: (value: string) => string;
}

/** Human-readable hierarchy line for PDF location headers (building · level · area · phase). */
export function formatMediaExportLocationDetail(
  entry: MediaExportLocationEntry,
  labels: MediaExportLocationDetailLabels,
): string {
  const parts: string[] = [];

  const building = entry.buildingLabel?.trim();
  if (building) parts.push(building);

  const level = entry.levelLabel?.trim();
  if (level) parts.push(level);

  const area = entry.area?.trim();
  if (area) parts.push(labels.area(area));

  const buildPhase = entry.buildPhase?.trim();
  if (buildPhase) parts.push(labels.buildPhase(buildPhase));

  return parts.join(" · ");
}

export function withMediaExportLocationDetails(
  entries: MediaExportLocationEntry[],
  labels: MediaExportLocationDetailLabels,
): MediaExportLocationEntry[] {
  return entries.map((entry) => ({
    ...entry,
    detailLine: formatMediaExportLocationDetail(entry, labels),
  }));
}

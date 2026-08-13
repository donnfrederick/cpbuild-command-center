/** Max observations per POST /observations/export-pdf when using observationIds. */
export const OBSERVATIONS_PDF_EXPORT_BATCH_SIZE = 20;

/** Preserve caller order; drop empty/duplicate ids. */
export function uniqueObservationIdsInOrder(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

/** Split ordered observation ids into fixed-size chunks for batched PDF export. */
export function chunkObservationIds(ids: readonly string[]): string[][] {
  const ordered = uniqueObservationIdsInOrder(ids);
  const chunks: string[][] = [];
  for (let i = 0; i < ordered.length; i += OBSERVATIONS_PDF_EXPORT_BATCH_SIZE) {
    chunks.push(ordered.slice(i, i + OBSERVATIONS_PDF_EXPORT_BATCH_SIZE));
  }
  return chunks;
}

/**
 * Observation media can form a linear version chain: a new row after markup sets
 * `supersedesId` to the prior attachment. Only "head" rows (not replaced by a
 * newer row) appear in the main grid.
 */

export interface AttachmentChainLink {
  id: string;
  supersedesId: string | null;
}

export function filterObservationAttachmentHeads<T extends AttachmentChainLink>(attachments: T[]): T[] {
  const supersededIds = new Set(
    attachments.map((a) => a.supersedesId).filter((id): id is string => Boolean(id))
  );
  return attachments.filter((a) => !supersededIds.has(a.id));
}

/** True if no other attachment in the list supersedes this id (current version in its chain). */
export function isObservationAttachmentHead<T extends AttachmentChainLink>(
  attachmentId: string,
  attachments: T[],
): boolean {
  return !attachments.some((a) => a.supersedesId === attachmentId);
}

/** Older versions for one head, oldest first (for preview strip). */
export function collectPriorVersions<T extends AttachmentChainLink>(
  head: T,
  byId: Map<string, T>
): T[] {
  const out: T[] = [];
  let id: string | null = head.supersedesId;
  while (id) {
    const row = byId.get(id);
    if (!row) break;
    out.push(row);
    id = row.supersedesId;
  }
  return out.reverse();
}

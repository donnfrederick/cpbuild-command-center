/**
 * Offline edits for queued create-issue mutations (before sync).
 */

import type { IssueSummary } from "@/components/projects/UnitCards";
import {
  storeVerifiedBlobIds,
} from "@/lib/offline/enqueue-mutation-with-blobs";
import { getMutationById, updateQueuedMutation } from "@/lib/offline/mutation-queue";

export interface IssueOfflineEditInput {
  shortDescription: string;
  notes: string;
  issueType: string;
  isBlockingWork: boolean;
  responsibleParty: string;
  responsibleParties: string[];
  scopeTagIds: string[];
  removeAttachmentIds: string[];
  newMediaFiles: Array<{ file: File; mimeType: string }>;
}

function issueFromPatch(issue: IssueSummary, input: IssueOfflineEditInput): IssueSummary {
  const parties =
    input.responsibleParties.length > 0
      ? input.responsibleParties
      : input.responsibleParty
        ? [input.responsibleParty]
        : [];
  return {
    ...issue,
    shortDescription: input.shortDescription,
    notes: input.notes || null,
    issueType: input.issueType,
    isBlockingWork: input.isBlockingWork,
    responsibleParty: parties[0] ?? input.responsibleParty,
    responsibleParties: parties,
    scopeTags: input.scopeTagIds.map((id) => ({
      row: { id, scopeType: issue.scopeTags.find((t) => t.row.id === id)?.row.scopeType ?? null },
    })),
    _pendingSync: true,
  };
}

export async function saveIssueEditOffline(params: {
  projectId: string;
  issue: IssueSummary;
  input: IssueOfflineEditInput;
}): Promise<IssueSummary> {
  const { issue, input } = params;
  const pendingCreate = issue._pendingSync ? await getMutationById(issue.id) : null;

  if (pendingCreate?.type !== "create-issue") {
    throw new Error("Only queued issue creates can be edited offline");
  }

  const blobIds =
    input.newMediaFiles.length > 0
      ? await storeVerifiedBlobIds(input.newMediaFiles.map((m) => m.file))
      : [];

  await updateQueuedMutation(issue.id, {
    body: {
      shortDescription: input.shortDescription,
      notes: input.notes || undefined,
      issueType: input.issueType,
      isBlockingWork: input.isBlockingWork,
      responsibleParty: input.responsibleParties[0] ?? input.responsibleParty,
      responsibleParties: input.responsibleParties,
      projectRowIds: input.scopeTagIds,
    },
    appendBlobIds: blobIds.length > 0 ? blobIds : undefined,
  });

  return issueFromPatch(issue, input);
}

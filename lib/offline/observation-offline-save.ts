import type { ObsSummary } from "@/components/projects/UnitCards";
import {
  enqueueMutationWithVerifiedBlobs,
  storeVerifiedBlobIds,
} from "@/lib/offline/enqueue-mutation-with-blobs";
import {
  getMutationById,
  updateQueuedMutation,
} from "@/lib/offline/mutation-queue";
import { normalizeSnapshotObservation } from "@/lib/offline/normalize-snapshot-observation";
import { patchObservationInSnapshot } from "@/lib/offline/snapshot-patch";

export interface ObservationOfflineEditInput {
  title: string;
  description: string;
  observationType: string;
  unitRef?: string | null;
  scopeTagIds: string[];
  removeAttachmentIds: string[];
  newMediaFiles: Array<{ file: File; mimeType: string }>;
}

function buildPatchBody(input: ObservationOfflineEditInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: input.title,
    description: input.description,
    observationType: input.observationType,
    scopeTagIds: input.scopeTagIds,
  };
  if (input.unitRef !== undefined) {
    body.unitRef = input.unitRef;
  }
  if (input.removeAttachmentIds.length > 0) {
    body.removeAttachmentIds = input.removeAttachmentIds;
  }
  return body;
}

function observationFromPatch(
  obs: ObsSummary,
  input: ObservationOfflineEditInput,
): ObsSummary {
  const removeSet = new Set(input.removeAttachmentIds);
  return {
    ...obs,
    title: input.title,
    description: input.description,
    observationType: input.observationType,
    ...(input.unitRef !== undefined ? { unitRef: input.unitRef ?? undefined } : {}),
    scopeTags: input.scopeTagIds.map((id) => ({
      row: { id, scopeType: obs.scopeTags.find((t) => t.row.id === id)?.row.scopeType ?? null },
    })),
    attachments: obs.attachments.filter((a) => !removeSet.has(a.id)),
    _pendingSync: true,
  };
}

/**
 * Queue an observation edit while offline. Handles pending creates (revise queue row)
 * and synced observations (new update-observation mutation).
 */
export async function saveObservationEditOffline(params: {
  projectId: string;
  obs: ObsSummary;
  currentUserId: string;
  input: ObservationOfflineEditInput;
}): Promise<ObsSummary> {
  const { projectId, obs, currentUserId, input } = params;
  const patchBody = buildPatchBody(input);

  const blobIds =
    input.newMediaFiles.length > 0
      ? await storeVerifiedBlobIds(input.newMediaFiles.map((m) => m.file))
      : [];

  const pendingCreate = obs._pendingSync
    ? await getMutationById(obs.id)
    : null;

  if (pendingCreate?.type === "create-observation") {
    await updateQueuedMutation(obs.id, {
      body: {
        title: input.title,
        description: input.description,
        observationType: input.observationType,
        projectRowIds: input.scopeTagIds,
      },
      appendBlobIds: blobIds.length > 0 ? blobIds : undefined,
    });
    await patchObservationInSnapshot(projectId, obs.id, {
      ...patchBody,
      projectRowIds: input.scopeTagIds,
    });
    return observationFromPatch(obs, input);
  }

  await enqueueMutationWithVerifiedBlobs({
    type: "update-observation",
    url: `/api/projects/${projectId}/observations/${obs.id}`,
    method: "PATCH",
    body: patchBody,
    mediaFiles: input.newMediaFiles.map((m) => m.file),
    actorUserId: currentUserId,
  });

  return observationFromPatch(obs, input);
}

/** Rehydrate a snapshot row after offline list load. */
export { normalizeSnapshotObservation };

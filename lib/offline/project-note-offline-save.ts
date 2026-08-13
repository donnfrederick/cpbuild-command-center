import type { ProjectNoteDto } from "@/lib/project-notes/types";
import {
  discardMutation,
  enqueueMutation,
  getMutationById,
  updateQueuedMutation,
} from "@/lib/offline/mutation-queue";
import {
  patchProjectNoteBodyInSnapshot,
  patchProjectNotePinInSnapshot,
  removeProjectNoteFromSnapshot,
} from "@/lib/offline/snapshot-patch";

export async function saveProjectNoteCreateOffline(params: {
  projectId: string;
  currentUserId: string;
  body: string;
}): Promise<void> {
  const { projectId, currentUserId, body } = params;
  const id = `offline-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await enqueueMutation({
    id,
    type: "create-project-note",
    url: `/api/projects/${projectId}/notes`,
    method: "POST",
    body: { body },
    actorUserId: currentUserId,
  });
}

export async function saveProjectNoteEditOffline(params: {
  projectId: string;
  note: ProjectNoteDto;
  currentUserId: string;
  body: string;
}): Promise<void> {
  const { projectId, note, currentUserId, body } = params;
  const pendingCreate = note._pendingSync ? await getMutationById(note.id) : null;

  if (pendingCreate?.type === "create-project-note") {
    await updateQueuedMutation(note.id, { body: { body } });
    await patchProjectNoteBodyInSnapshot(projectId, note.id, body).catch(() => undefined);
    return;
  }

  await enqueueMutation({
    type: "edit-project-note",
    url: `/api/projects/${projectId}/notes/${note.id}`,
    method: "PATCH",
    body: { body },
    actorUserId: currentUserId,
  });
}

export async function toggleProjectNotePinOffline(params: {
  projectId: string;
  note: ProjectNoteDto;
  pinned: boolean;
  currentUserId: string;
}): Promise<void> {
  const { projectId, note, pinned, currentUserId } = params;

  await enqueueMutation({
    type: "pin-project-note",
    url: `/api/projects/${projectId}/notes/${note.id}`,
    method: "PATCH",
    body: { pinned },
    actorUserId: currentUserId,
  });

  await patchProjectNotePinInSnapshot(projectId, note.id, pinned).catch(() => undefined);
}

export async function deleteProjectNoteOffline(params: {
  projectId: string;
  note: ProjectNoteDto;
  currentUserId: string;
}): Promise<void> {
  const { projectId, note, currentUserId } = params;
  const pendingCreate = note._pendingSync ? await getMutationById(note.id) : null;

  if (pendingCreate?.type === "create-project-note") {
    await discardMutation(note.id);
    await removeProjectNoteFromSnapshot(projectId, note.id).catch(() => undefined);
    return;
  }

  await enqueueMutation({
    type: "delete-project-note",
    url: `/api/projects/${projectId}/notes/${note.id}`,
    method: "DELETE",
    body: {},
    actorUserId: currentUserId,
  });
}

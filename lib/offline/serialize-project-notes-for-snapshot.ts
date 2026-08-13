import type { ProjectNoteDto } from "@/lib/project-notes/types";
import { listProjectNotesForSnapshot } from "@/lib/project-notes/service";

/** Server-side serializer for offline snapshot bundle — keyed by projectId. */
export async function serializeProjectNotesForSnapshot(
  projectIds: string[],
): Promise<Record<string, ProjectNoteDto[]>> {
  const groups: Record<string, ProjectNoteDto[]> = {};
  await Promise.all(
    projectIds.map(async (projectId) => {
      try {
        groups[projectId] = await listProjectNotesForSnapshot(projectId);
      } catch (err) {
        console.warn(`[offline/snapshot] project-notes ${projectId} failed:`, err);
        groups[projectId] = [];
      }
    }),
  );
  return groups;
}

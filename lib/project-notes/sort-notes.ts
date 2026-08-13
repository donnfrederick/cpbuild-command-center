import type { ProjectNoteDto } from "@/lib/project-notes/types";

/** Pinned notes first (newest pin first), then unpinned by createdAt desc. */
export function sortProjectNotesForDisplay(notes: ProjectNoteDto[]): ProjectNoteDto[] {
  return [...notes].sort((a, b) => {
    const aPinned = a.pinnedAt ? 1 : 0;
    const bPinned = b.pinnedAt ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    if (a.pinnedAt && b.pinnedAt) {
      return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime();
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function splitProjectNotes(notes: ProjectNoteDto[]): {
  pinnedNotes: ProjectNoteDto[];
  unpinnedNotes: ProjectNoteDto[];
} {
  const pinnedNotes = notes.filter((n) => n.pinnedAt);
  const unpinnedNotes = notes.filter((n) => !n.pinnedAt);
  return {
    pinnedNotes: sortProjectNotesForDisplay(pinnedNotes),
    unpinnedNotes: sortProjectNotesForDisplay(unpinnedNotes),
  };
}

export function pickPreviewProjectNote(
  pinnedNotes: ProjectNoteDto[],
  unpinnedNotes: ProjectNoteDto[],
): ProjectNoteDto | null {
  return pinnedNotes[0] ?? unpinnedNotes[0] ?? null;
}

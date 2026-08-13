import { describe, expect, it } from "vitest";
import {
  pickPreviewProjectNote,
  sortProjectNotesForDisplay,
  splitProjectNotes,
} from "@/lib/project-notes/sort-notes";
import type { ProjectNoteDto } from "@/lib/project-notes/types";

function note(
  id: string,
  createdAt: string,
  pinnedAt: string | null = null,
): ProjectNoteDto {
  return {
    id,
    body: `Note ${id}`,
    author: { id: "u1", name: "Alex", email: "alex@test.com" },
    createdAt,
    editedAt: null,
    pinnedAt,
  };
}

describe("project-notes sort-notes", () => {
  it("sorts pinned notes before unpinned", () => {
    const sorted = sortProjectNotesForDisplay([
      note("a", "2026-07-17T12:00:00.000Z"),
      note("b", "2026-07-16T12:00:00.000Z", "2026-07-18T12:00:00.000Z"),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("splits pinned and unpinned lists", () => {
    const { pinnedNotes, unpinnedNotes } = splitProjectNotes([
      note("a", "2026-07-17T12:00:00.000Z"),
      note("b", "2026-07-16T12:00:00.000Z", "2026-07-18T12:00:00.000Z"),
    ]);
    expect(pinnedNotes.map((n) => n.id)).toEqual(["b"]);
    expect(unpinnedNotes.map((n) => n.id)).toEqual(["a"]);
  });

  it("prefers pinned note for preview", () => {
    const pinned = [note("b", "2026-07-16T12:00:00.000Z", "2026-07-18T12:00:00.000Z")];
    const unpinned = [note("a", "2026-07-17T12:00:00.000Z")];
    expect(pickPreviewProjectNote(pinned, unpinned)?.id).toBe("b");
    expect(pickPreviewProjectNote([], unpinned)?.id).toBe("a");
  });
});

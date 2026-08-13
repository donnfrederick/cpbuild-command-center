import { db } from "@/lib/db";
import { PROJECT_NOTES_PAGE_SIZE, PROJECT_NOTES_SNAPSHOT_CAP } from "@/lib/project-notes/constants";
import { pickPreviewProjectNote, sortProjectNotesForDisplay } from "@/lib/project-notes/sort-notes";
import type { ProjectNoteDto, ProjectNotesListResponse } from "@/lib/project-notes/types";

export { PROJECT_NOTES_PAGE_SIZE, PROJECT_NOTES_SNAPSHOT_CAP };

const AUTHOR_SELECT = {
  id: true,
  name: true,
  email: true,
} as const;

const NOTE_INCLUDE = {
  author: { select: AUTHOR_SELECT },
} as const;

type NoteRow = {
  id: string;
  body: string;
  editedAt: Date | null;
  pinnedAt: Date | null;
  createdAt: Date;
  author: { id: string; name: string | null; email: string };
};

export function toProjectNoteDto(row: NoteRow): ProjectNoteDto {
  return {
    id: row.id,
    body: row.body,
    author: {
      id: row.author.id,
      name: row.author.name,
      email: row.author.email,
    },
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    pinnedAt: row.pinnedAt?.toISOString() ?? null,
  };
}

async function resolveUnpinnedCursorFilter(projectId: string, cursorId: string | undefined) {
  const base = { projectId, deletedAt: null, pinnedAt: null } as const;

  if (!cursorId) {
    return base;
  }

  const cursorNote = await db.projectNote.findFirst({
    where: { id: cursorId, projectId, deletedAt: null, pinnedAt: null },
    select: { id: true, createdAt: true },
  });
  if (!cursorNote) {
    return { ...base, id: "__invalid_cursor__" };
  }

  return {
    ...base,
    OR: [
      { createdAt: { lt: cursorNote.createdAt } },
      { createdAt: cursorNote.createdAt, id: { lt: cursorNote.id } },
    ],
  };
}

async function listPinnedProjectNotes(projectId: string): Promise<ProjectNoteDto[]> {
  const rows = await db.projectNote.findMany({
    where: { projectId, deletedAt: null, pinnedAt: { not: null } },
    orderBy: [{ pinnedAt: "desc" }, { id: "desc" }],
    include: NOTE_INCLUDE,
  });
  return rows.map(toProjectNoteDto);
}

export async function listProjectNotes(options: {
  projectId: string;
  limit?: number;
  cursor?: string;
  includePreview?: boolean;
}): Promise<ProjectNotesListResponse> {
  const limit = Math.min(Math.max(options.limit ?? PROJECT_NOTES_PAGE_SIZE, 1), 50);
  const isFirstPage = !options.cursor;
  const where = await resolveUnpinnedCursorFilter(options.projectId, options.cursor);

  const [totalCount, pinnedNotes, rows, previewPinned, previewUnpinned] = await Promise.all([
    db.projectNote.count({
      where: { projectId: options.projectId, deletedAt: null },
    }),
    isFirstPage ? listPinnedProjectNotes(options.projectId) : Promise.resolve([]),
    db.projectNote.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: NOTE_INCLUDE,
    }),
    options.includePreview !== false && isFirstPage
      ? db.projectNote.findFirst({
          where: { projectId: options.projectId, deletedAt: null, pinnedAt: { not: null } },
          orderBy: [{ pinnedAt: "desc" }, { id: "desc" }],
          include: NOTE_INCLUDE,
        })
      : Promise.resolve(null),
    options.includePreview !== false && isFirstPage
      ? db.projectNote.findFirst({
          where: { projectId: options.projectId, deletedAt: null, pinnedAt: null },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: NOTE_INCLUDE,
        })
      : Promise.resolve(null),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  const unpinnedNotes = page.map(toProjectNoteDto);
  const pinnedDtos = isFirstPage ? pinnedNotes : undefined;
  const previewNote = pickPreviewProjectNote(
    previewPinned ? [toProjectNoteDto(previewPinned)] : pinnedNotes,
    previewUnpinned ? [toProjectNoteDto(previewUnpinned)] : unpinnedNotes,
  );

  return {
    pinnedNotes: pinnedDtos,
    notes: unpinnedNotes,
    totalCount,
    nextCursor,
    previewNote,
  };
}

export async function listProjectNotesForSnapshot(projectId: string): Promise<ProjectNoteDto[]> {
  const rows = await db.projectNote.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PROJECT_NOTES_SNAPSHOT_CAP,
    include: NOTE_INCLUDE,
  });
  return sortProjectNotesForDisplay(rows.map(toProjectNoteDto));
}

export async function createProjectNote(options: {
  projectId: string;
  authorId: string;
  body: string;
}): Promise<ProjectNoteDto | null> {
  const project = await db.project.findFirst({
    where: { id: options.projectId, deletedAt: null },
    select: { id: true },
  });
  if (!project) return null;

  const saved = await db.projectNote.create({
    data: {
      projectId: options.projectId,
      authorId: options.authorId,
      body: options.body.trim(),
    },
    include: NOTE_INCLUDE,
  });

  return toProjectNoteDto(saved);
}

export async function updateProjectNote(options: {
  projectId: string;
  noteId: string;
  authorId: string;
  body: string;
}): Promise<ProjectNoteDto | "not_found" | "forbidden"> {
  const existing = await db.projectNote.findFirst({
    where: {
      id: options.noteId,
      projectId: options.projectId,
      deletedAt: null,
    },
  });
  if (!existing) return "not_found";
  if (existing.authorId !== options.authorId) return "forbidden";

  const saved = await db.projectNote.update({
    where: { id: options.noteId },
    data: { body: options.body.trim(), editedAt: new Date() },
    include: NOTE_INCLUDE,
  });

  return toProjectNoteDto(saved);
}

export async function setProjectNotePinned(options: {
  projectId: string;
  noteId: string;
  pinned: boolean;
}): Promise<ProjectNoteDto | "not_found"> {
  const existing = await db.projectNote.findFirst({
    where: {
      id: options.noteId,
      projectId: options.projectId,
      deletedAt: null,
    },
  });
  if (!existing) return "not_found";

  const saved = await db.projectNote.update({
    where: { id: options.noteId },
    data: { pinnedAt: options.pinned ? new Date() : null },
    include: NOTE_INCLUDE,
  });

  return toProjectNoteDto(saved);
}

export async function softDeleteProjectNote(options: {
  projectId: string;
  noteId: string;
  authorId: string;
}): Promise<"ok" | "not_found" | "forbidden"> {
  const existing = await db.projectNote.findFirst({
    where: {
      id: options.noteId,
      projectId: options.projectId,
      deletedAt: null,
    },
  });
  if (!existing) return "not_found";
  if (existing.authorId !== options.authorId) return "forbidden";

  await db.projectNote.update({
    where: { id: options.noteId },
    data: { deletedAt: new Date(), pinnedAt: null },
  });

  return "ok";
}

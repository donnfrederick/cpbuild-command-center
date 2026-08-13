import { db } from "@/lib/db";
import { findFieldDailyReportProjectRow } from "@/lib/field-daily-report/report-project-row";
import { toFieldDailySectionNoteAuthorDto } from "@/lib/field-daily-report/note-author";
import type {
  FieldDailyReportSectionKey,
  FieldDailyReportSectionNoteDto,
  FieldDailyReportSectionNoteReplyDto,
} from "@/lib/field-daily-report/types";

const AUTHOR_SELECT = {
  id: true,
  name: true,
  email: true,
  role: { select: { code: true } },
} as const;

const NOTE_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  replies: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" as const },
    include: { author: { select: AUTHOR_SELECT } },
  },
} as const;

function toReplyDto(
  row: {
    id: string;
    body: string;
    editedAt: Date | null;
    createdAt: Date;
    author: Parameters<typeof toFieldDailySectionNoteAuthorDto>[0];
  },
  projectInstallManagerId: string | null,
): FieldDailyReportSectionNoteReplyDto {
  return {
    id: row.id,
    body: row.body,
    author: toFieldDailySectionNoteAuthorDto(row.author, projectInstallManagerId),
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

export function toSectionNoteDto(
  row: {
    id: string;
    sectionKey: string;
    itemKey: string;
    body: string;
    editedAt: Date | null;
    createdAt: Date;
    author: Parameters<typeof toFieldDailySectionNoteAuthorDto>[0];
    replies: Array<{
      id: string;
      body: string;
      editedAt: Date | null;
      createdAt: Date;
      author: Parameters<typeof toFieldDailySectionNoteAuthorDto>[0];
    }>;
  },
  projectInstallManagerId: string | null,
): FieldDailyReportSectionNoteDto {
  return {
    id: row.id,
    sectionKey: row.sectionKey as FieldDailyReportSectionKey,
    itemKey: row.itemKey,
    body: row.body,
    author: toFieldDailySectionNoteAuthorDto(row.author, projectInstallManagerId),
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    replies: row.replies.map((r) => toReplyDto(r, projectInstallManagerId)),
  };
}

export async function listFieldDailySectionNotesForProjectRow(
  fieldDailyReportProjectId: string,
  projectInstallManagerId: string | null,
): Promise<FieldDailyReportSectionNoteDto[]> {
  const rows = await db.fieldDailyReportSectionNote.findMany({
    where: { fieldDailyReportProjectId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: NOTE_INCLUDE,
  });
  return rows.map((row) => toSectionNoteDto(row, projectInstallManagerId));
}

async function resolveProjectRowContext(options: {
  ownerUserIds: string[];
  projectId: string;
  reportDate: string;
}) {
  const project = await db.project.findFirst({
    where: { id: options.projectId, deletedAt: null },
    select: { installManagerId: true },
  });
  if (!project) return null;

  const projectRow = await findFieldDailyReportProjectRow({
    projectId: options.projectId,
    reportDate: options.reportDate,
    ownerUserIds: options.ownerUserIds,
  });
  if (!projectRow) return null;

  return { projectRow, installManagerId: project.installManagerId };
}

export async function createFieldDailySectionNote(options: {
  ownerUserIds: string[];
  projectId: string;
  reportDate: string;
  sectionKey: FieldDailyReportSectionKey;
  itemKey?: string;
  body: string;
  authorUserId: string;
}): Promise<FieldDailyReportSectionNoteDto | null> {
  const ctx = await resolveProjectRowContext(options);
  if (!ctx) return null;

  const saved = await db.fieldDailyReportSectionNote.create({
    data: {
      fieldDailyReportProjectId: ctx.projectRow.id,
      sectionKey: options.sectionKey,
      itemKey: options.itemKey?.trim() ?? "",
      body: options.body.trim(),
      authorUserId: options.authorUserId,
    },
    include: NOTE_INCLUDE,
  });

  return toSectionNoteDto({ ...saved, replies: [] }, ctx.installManagerId);
}

export async function updateFieldDailySectionNote(options: {
  ownerUserIds: string[];
  projectId: string;
  reportDate: string;
  noteId: string;
  body: string;
  authorUserId: string;
}): Promise<FieldDailyReportSectionNoteDto | "not_found" | "forbidden"> {
  const ctx = await resolveProjectRowContext(options);
  if (!ctx) return "not_found";

  const existing = await db.fieldDailyReportSectionNote.findFirst({
    where: {
      id: options.noteId,
      fieldDailyReportProjectId: ctx.projectRow.id,
      deletedAt: null,
    },
  });
  if (!existing) return "not_found";
  if (existing.authorUserId !== options.authorUserId) return "forbidden";

  const saved = await db.fieldDailyReportSectionNote.update({
    where: { id: options.noteId },
    data: { body: options.body.trim(), editedAt: new Date() },
    include: NOTE_INCLUDE,
  });

  return toSectionNoteDto(saved, ctx.installManagerId);
}

export async function softDeleteFieldDailySectionNote(options: {
  ownerUserIds: string[];
  projectId: string;
  reportDate: string;
  noteId: string;
  authorUserId: string;
}): Promise<"ok" | "not_found" | "forbidden"> {
  const ctx = await resolveProjectRowContext(options);
  if (!ctx) return "not_found";

  const existing = await db.fieldDailyReportSectionNote.findFirst({
    where: {
      id: options.noteId,
      fieldDailyReportProjectId: ctx.projectRow.id,
      deletedAt: null,
    },
  });
  if (!existing) return "not_found";
  if (existing.authorUserId !== options.authorUserId) return "forbidden";

  const now = new Date();
  await db.$transaction([
    db.fieldDailyReportSectionNote.update({
      where: { id: options.noteId },
      data: { deletedAt: now },
    }),
    db.fieldDailyReportSectionNoteReply.updateMany({
      where: { noteId: options.noteId, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);

  return "ok";
}

export async function createFieldDailySectionNoteReply(options: {
  ownerUserIds: string[];
  projectId: string;
  reportDate: string;
  noteId: string;
  body: string;
  authorUserId: string;
}): Promise<FieldDailyReportSectionNoteReplyDto | "not_found"> {
  const ctx = await resolveProjectRowContext(options);
  if (!ctx) return "not_found";

  const note = await db.fieldDailyReportSectionNote.findFirst({
    where: {
      id: options.noteId,
      fieldDailyReportProjectId: ctx.projectRow.id,
      deletedAt: null,
    },
  });
  if (!note) return "not_found";

  const saved = await db.fieldDailyReportSectionNoteReply.create({
    data: {
      noteId: options.noteId,
      body: options.body.trim(),
      authorUserId: options.authorUserId,
    },
    include: { author: { select: AUTHOR_SELECT } },
  });

  return toReplyDto(saved, ctx.installManagerId);
}

export async function updateFieldDailySectionNoteReply(options: {
  ownerUserIds: string[];
  projectId: string;
  reportDate: string;
  noteId: string;
  replyId: string;
  body: string;
  authorUserId: string;
}): Promise<FieldDailyReportSectionNoteReplyDto | "not_found" | "forbidden"> {
  const ctx = await resolveProjectRowContext(options);
  if (!ctx) return "not_found";

  const note = await db.fieldDailyReportSectionNote.findFirst({
    where: {
      id: options.noteId,
      fieldDailyReportProjectId: ctx.projectRow.id,
      deletedAt: null,
    },
  });
  if (!note) return "not_found";

  const existing = await db.fieldDailyReportSectionNoteReply.findFirst({
    where: { id: options.replyId, noteId: options.noteId, deletedAt: null },
  });
  if (!existing) return "not_found";
  if (existing.authorUserId !== options.authorUserId) return "forbidden";

  const saved = await db.fieldDailyReportSectionNoteReply.update({
    where: { id: options.replyId },
    data: { body: options.body.trim(), editedAt: new Date() },
    include: { author: { select: AUTHOR_SELECT } },
  });

  return toReplyDto(saved, ctx.installManagerId);
}

export async function softDeleteFieldDailySectionNoteReply(options: {
  ownerUserIds: string[];
  projectId: string;
  reportDate: string;
  noteId: string;
  replyId: string;
  authorUserId: string;
}): Promise<"ok" | "not_found" | "forbidden"> {
  const ctx = await resolveProjectRowContext(options);
  if (!ctx) return "not_found";

  const note = await db.fieldDailyReportSectionNote.findFirst({
    where: {
      id: options.noteId,
      fieldDailyReportProjectId: ctx.projectRow.id,
      deletedAt: null,
    },
  });
  if (!note) return "not_found";

  const existing = await db.fieldDailyReportSectionNoteReply.findFirst({
    where: { id: options.replyId, noteId: options.noteId, deletedAt: null },
  });
  if (!existing) return "not_found";
  if (existing.authorUserId !== options.authorUserId) return "forbidden";

  await db.fieldDailyReportSectionNoteReply.update({
    where: { id: options.replyId },
    data: { deletedAt: new Date() },
  });

  return "ok";
}

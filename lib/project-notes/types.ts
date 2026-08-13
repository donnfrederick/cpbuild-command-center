export interface ProjectNoteAuthorDto {
  id: string;
  name: string | null;
  email: string;
}

export interface ProjectNoteDto {
  id: string;
  body: string;
  author: ProjectNoteAuthorDto;
  createdAt: string;
  editedAt: string | null;
  pinnedAt: string | null;
  /** Present on optimistic offline rows until sync completes. */
  _pendingSync?: boolean;
}

export interface ProjectNotesListResponse {
  /** Present on the first page (no cursor). Omitted on load-more requests. */
  pinnedNotes?: ProjectNoteDto[];
  notes: ProjectNoteDto[];
  totalCount: number;
  nextCursor: string | null;
  previewNote: ProjectNoteDto | null;
}

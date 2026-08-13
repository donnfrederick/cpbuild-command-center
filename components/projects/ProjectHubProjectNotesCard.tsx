"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { PROJECT_HUB_CARD_STYLE, ProjectHubCardHeader } from "@/components/projects/ProjectHubCardHeader";
import { ProjectNoteComposerModal } from "@/components/projects/ProjectNoteComposerModal";
import type { ProjectNoteDto, ProjectNotesListResponse } from "@/lib/project-notes/types";
import { PROJECT_NOTES_PAGE_SIZE } from "@/lib/project-notes/constants";
import { pickPreviewProjectNote, splitProjectNotes } from "@/lib/project-notes/sort-notes";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { readSnapshotProjectNotes } from "@/lib/offline/snapshot-project-reads";
import {
  deleteProjectNoteOffline,
  saveProjectNoteCreateOffline,
  saveProjectNoteEditOffline,
  toggleProjectNotePinOffline,
} from "@/lib/offline/project-note-offline-save";

interface ProjectHubProjectNotesCardProps {
  projectId: string;
  currentUserId: string;
}

function authorLabel(note: ProjectNoteDto): string {
  return note.author.name?.trim() || note.author.email;
}

function formatNoteTimestamp(iso: string, locale: string | undefined): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Avoid SSR/client timezone drift — format only after mount. */
function NoteTimestamp({
  iso,
  locale,
}: {
  iso: string;
  locale: string | undefined;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(formatNoteTimestamp(iso, locale));
  }, [iso, locale]);

  return (
    <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
      {label ?? "\u00a0"}
    </span>
  );
}

function NoteMeta({
  note,
  locale,
  t,
}: {
  note: ProjectNoteDto;
  locale: string | undefined;
  t: ReturnType<typeof useTranslations<"projects">>;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", alignItems: "baseline" }}>
      <span style={{ fontSize: "var(--text-caption)", fontWeight: 700, color: "var(--neutral-700)" }}>
        {authorLabel(note)}
      </span>
      <NoteTimestamp iso={note.createdAt} locale={locale} />
      {note.editedAt ? (
        <span style={{ fontSize: 11, color: "var(--neutral-400)" }}>{t("hubProjectNotesEdited")}</span>
      ) : null}
      {note.pinnedAt ? (
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--primary-700)" }}>
          {t("hubProjectNotesPinnedLabel")}
        </span>
      ) : null}
      {note._pendingSync ? (
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--warning-600)" }}>
          {t("hubProjectNotesPendingSync")}
        </span>
      ) : null}
    </div>
  );
}

function NoteRow({
  note,
  currentUserId,
  locale,
  expanded,
  onEdit,
  onDelete,
  onPin,
  t,
}: {
  note: ProjectNoteDto;
  currentUserId: string;
  locale: string | undefined;
  expanded: boolean;
  onEdit: (note: ProjectNoteDto) => void;
  onDelete: (note: ProjectNoteDto) => void;
  onPin: (note: ProjectNoteDto) => void;
  t: ReturnType<typeof useTranslations<"projects">>;
}) {
  const isAuthor = note.author.id === currentUserId;
  const isPinned = Boolean(note.pinnedAt);

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "10px 12px",
        borderTop: "1px solid var(--neutral-100)",
        ...(isPinned ? { backgroundColor: "var(--primary-50)" } : {}),
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <NoteMeta note={note} locale={locale} t={t} />
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "var(--text-body)",
            color: "var(--color-text-primary)",
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            ...(expanded
              ? {}
              : {
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }),
          }}
        >
          {note.body}
        </p>
      </div>
      <div style={{ flexShrink: 0, display: "flex", gap: 4, alignItems: "flex-start" }}>
        <button
          type="button"
          onClick={() => onPin(note)}
          aria-label={isPinned ? t("hubProjectNotesUnpinAria") : t("hubProjectNotesPinAria")}
          title={isPinned ? t("hubProjectNotesUnpinAria") : t("hubProjectNotesPinAria")}
          aria-pressed={isPinned}
          style={{
            width: 32,
            height: 32,
            border: "none",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--control-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: isPinned ? "var(--primary-700)" : "var(--neutral-600)",
          }}
        >
          {isPinned ? <PinOff size={15} aria-hidden /> : <Pin size={15} aria-hidden />}
        </button>
        {isAuthor ? (
          <>
          <button
            type="button"
            onClick={() => onEdit(note)}
            aria-label={t("hubProjectNotesEditAria")}
            title={t("hubProjectNotesEditAria")}
            style={{
              width: 32,
              height: 32,
              border: "none",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--control-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--neutral-600)",
            }}
          >
            <Pencil size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onDelete(note)}
            aria-label={t("hubProjectNotesDeleteAria")}
            title={t("hubProjectNotesDeleteAria")}
            style={{
              width: 32,
              height: 32,
              border: "none",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--control-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--error-600)",
            }}
          >
            <Trash2 size={15} aria-hidden />
          </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function ProjectHubProjectNotesCard({
  projectId,
  currentUserId,
}: ProjectHubProjectNotesCardProps) {
  const t = useTranslations("projects");
  const locale = useLocale();
  const { isOnline } = useOfflineStatus();
  const isOffline = !isOnline;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewNote, setPreviewNote] = useState<ProjectNoteDto | null>(null);
  const [pinnedNotes, setPinnedNotes] = useState<ProjectNoteDto[]>([]);
  const [notes, setNotes] = useState<ProjectNoteDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<"create" | "edit">("create");
  const [editingNote, setEditingNote] = useState<ProjectNoteDto | null>(null);
  const [saving, setSaving] = useState(false);

  const applyListPayload = useCallback((payload: ProjectNotesListResponse, append: boolean) => {
    setPreviewNote(payload.previewNote);
    setTotalCount(payload.totalCount);
    setNextCursor(payload.nextCursor);
    if (!append && payload.pinnedNotes) {
      setPinnedNotes(payload.pinnedNotes);
    }
    setNotes((prev) => (append ? [...prev, ...payload.notes] : payload.notes));
  }, []);

  const applySnapshotNotes = useCallback((snapshotNotes: ProjectNoteDto[]) => {
    const { pinnedNotes: pinned, unpinnedNotes } = splitProjectNotes(snapshotNotes);
    setPinnedNotes(pinned);
    setNotes(unpinnedNotes.slice(0, PROJECT_NOTES_PAGE_SIZE));
    setPreviewNote(pickPreviewProjectNote(pinned, unpinnedNotes));
    setTotalCount(snapshotNotes.length);
    setNextCursor(
      unpinnedNotes.length > PROJECT_NOTES_PAGE_SIZE
        ? unpinnedNotes[PROJECT_NOTES_PAGE_SIZE - 1]?.id ?? null
        : null,
    );
  }, []);

  const loadFromSnapshot = useCallback(async () => {
    const snapshotNotes = await readSnapshotProjectNotes(projectId);
    const notes = snapshotNotes ?? [];
    setLoadError(null);
    applySnapshotNotes(notes);
  }, [applySnapshotNotes, projectId]);

  const fetchNotes = useCallback(
    async (options?: { cursor?: string; append?: boolean }) => {
      const append = options?.append ?? false;
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        if (isOffline) {
          await loadFromSnapshot();
          return;
        }

        const params = new URLSearchParams({ limit: String(PROJECT_NOTES_PAGE_SIZE) });
        if (options?.cursor) params.set("cursor", options.cursor);

        const res = await fetch(`/api/projects/${projectId}/notes?${params.toString()}`);
        if (!res.ok) throw new Error("fetch failed");
        const payload = (await res.json()) as ProjectNotesListResponse;
        applyListPayload(payload, append);
        setLoadError(null);
      } catch {
        if (!append) {
          const snapshotNotes = await readSnapshotProjectNotes(projectId);
          if (snapshotNotes && snapshotNotes.length > 0) {
            setLoadError(null);
            applySnapshotNotes(snapshotNotes);
          } else {
            setLoadError(t("hubProjectNotesLoadFailed"));
          }
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [applyListPayload, applySnapshotNotes, isOffline, loadFromSnapshot, projectId, t],
  );

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  const openCreate = () => {
    setComposerMode("create");
    setEditingNote(null);
    setComposerOpen(true);
  };

  const openEdit = (note: ProjectNoteDto) => {
    setComposerMode("edit");
    setEditingNote(note);
    setComposerOpen(true);
  };

  const refreshAfterMutation = async () => {
    setExpanded(false);
    await fetchNotes();
  };

  const handleCreate = async (body: string) => {
    setSaving(true);
    try {
      if (isOffline) {
        await saveProjectNoteCreateOffline({ projectId, currentUserId, body });
        toast.success(t("hubProjectNotesQueuedOffline"));
        setComposerOpen(false);
        await loadFromSnapshot();
        return;
      }

      const res = await fetch(`/api/projects/${projectId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error("create failed");
      toast.success(t("hubProjectNotesSaved"));
      setComposerOpen(false);
      await refreshAfterMutation();
    } catch {
      toast.error(t("hubProjectNotesSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (body: string) => {
    if (!editingNote) return;
    setSaving(true);
    try {
      if (isOffline) {
        await saveProjectNoteEditOffline({
          projectId,
          note: editingNote,
          currentUserId,
          body,
        });
        toast.success(t("hubProjectNotesQueuedOffline"));
        setComposerOpen(false);
        await loadFromSnapshot();
        return;
      }

      const res = await fetch(`/api/projects/${projectId}/notes/${editingNote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error("edit failed");
      toast.success(t("hubProjectNotesSaved"));
      setComposerOpen(false);
      await refreshAfterMutation();
    } catch {
      toast.error(t("hubProjectNotesSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (note: ProjectNoteDto) => {
    if (!window.confirm(t("hubProjectNotesDeleteConfirm"))) return;

    try {
      if (isOffline) {
        await deleteProjectNoteOffline({ projectId, note, currentUserId });
        toast.success(t("hubProjectNotesQueuedOffline"));
        await loadFromSnapshot();
        return;
      }

      const res = await fetch(`/api/projects/${projectId}/notes/${note.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      toast.success(t("hubProjectNotesDeleted"));
      await refreshAfterMutation();
    } catch {
      toast.error(t("hubProjectNotesDeleteFailed"));
    }
  };

  const handlePin = async (note: ProjectNoteDto) => {
    const pinned = !note.pinnedAt;
    try {
      if (isOffline) {
        await toggleProjectNotePinOffline({ projectId, note, pinned, currentUserId });
        toast.success(t("hubProjectNotesQueuedOffline"));
        await loadFromSnapshot();
        return;
      }

      const res = await fetch(`/api/projects/${projectId}/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      if (!res.ok) throw new Error("pin failed");
      toast.success(pinned ? t("hubProjectNotesPinned") : t("hubProjectNotesUnpinned"));
      await fetchNotes();
    } catch {
      toast.error(t("hubProjectNotesPinFailed"));
    }
  };

  const displayNotes = expanded
    ? [...pinnedNotes, ...notes]
    : previewNote
      ? [previewNote]
      : [];
  const showExpandToggle = totalCount > 0;

  return (
    <>
      <div style={PROJECT_HUB_CARD_STYLE}>
        <ProjectHubCardHeader
          icon={StickyNote}
          title={t("hubProjectNotesTitle")}
          actions={
            <button
              type="button"
              onClick={openCreate}
              aria-label={t("hubProjectNotesAddAria")}
              title={t("hubProjectNotesAddAria")}
              style={{
                width: 32,
                height: 32,
                flexShrink: 0,
                borderRadius: "var(--radius-md)",
                border: "none",
                backgroundColor: "var(--control-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--color-accent-hover)",
              }}
            >
              <Plus size={16} aria-hidden />
            </button>
          }
        />

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
            <Loader2 size={18} className="animate-spin" aria-hidden style={{ color: "var(--neutral-400)" }} />
          </div>
        ) : loadError ? (
          <div style={{ padding: "8px 0" }}>
            <p style={{ margin: "0 0 8px", fontSize: "var(--text-caption)", color: "var(--error-600)" }}>
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void fetchNotes()}
              style={{
                border: "none",
                background: "none",
                padding: 0,
                color: "var(--primary-700)",
                fontWeight: 600,
                fontSize: "var(--text-caption)",
                cursor: "pointer",
              }}
            >
              {t("hubFieldNotesRetry")}
            </button>
          </div>
        ) : totalCount === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-caption)",
              color: "var(--color-text-tertiary)",
              lineHeight: 1.45,
            }}
          >
            {t("hubProjectNotesEmpty")}
          </p>
        ) : (
          <>
            <div
              style={{
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                border: "1px solid var(--neutral-200)",
              }}
            >
              {displayNotes.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  currentUserId={currentUserId}
                  locale={locale}
                  expanded={expanded}
                  onEdit={openEdit}
                  onDelete={(n) => void handleDelete(n)}
                  onPin={(n) => void handlePin(n)}
                  t={t}
                />
              ))}
            </div>

            {expanded && (nextCursor || loadingMore) ? (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                <button
                  type="button"
                  disabled={loadingMore || !nextCursor}
                  onClick={() => void fetchNotes({ cursor: nextCursor ?? undefined, append: true })}
                  style={{
                    padding: "6px 10px",
                    border: "none",
                    background: "transparent",
                    color: "var(--primary-600)",
                    fontWeight: 600,
                    fontSize: "var(--text-caption)",
                    cursor: loadingMore || !nextCursor ? "not-allowed" : "pointer",
                    opacity: loadingMore || !nextCursor ? 0.6 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                      {t("hubProjectNotesLoadingMore")}
                    </>
                  ) : (
                    t("hubProjectNotesLoadMore")
                  )}
                </button>
              </div>
            ) : null}

            {showExpandToggle ? (
              <button
                type="button"
                onClick={() => {
                  if (!expanded && pinnedNotes.length + notes.length <= 1) {
                    void fetchNotes();
                  }
                  setExpanded((v) => !v);
                }}
                aria-expanded={expanded}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  width: "100%",
                  marginTop: 8,
                  padding: "8px 12px",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--neutral-50)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--primary-700)",
                }}
              >
                {expanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                {expanded
                  ? t("hubProjectNotesShowLess")
                  : t("hubProjectNotesViewAll")}
              </button>
            ) : null}
          </>
        )}
      </div>

      {composerOpen ? (
        <ProjectNoteComposerModal
          key={composerMode === "edit" ? editingNote?.id ?? "edit" : "create"}
          mode={composerMode}
          initialBody={editingNote?.body ?? ""}
          saving={saving}
          onClose={() => setComposerOpen(false)}
          onSubmit={composerMode === "create" ? handleCreate : handleEdit}
        />
      ) : null}
    </>
  );
}

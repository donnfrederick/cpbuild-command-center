"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Pencil, Trash2, X, Check } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatRole } from "@/lib/permissions";
import type {
  FieldDailyReportSectionKey,
  FieldDailyReportSectionNoteDto,
  FieldDailyReportSectionNoteReplyDto,
} from "@/lib/field-daily-report/types";

const VISIBLE_COUNT = 3;

function authorRoleLabel(
  author: FieldDailyReportSectionNoteDto["author"],
  t: ReturnType<typeof useTranslations<"fieldDailyReport">>,
): string {
  if (author.isInstallManager) return t("sectionNoteAuthorInstallManager");
  return formatRole(author.roleCode);
}

interface FieldDailySectionNoteThreadProps {
  projectId: string;
  reportDate: string;
  sectionKey: FieldDailyReportSectionKey;
  itemKey?: string;
  notes: FieldDailyReportSectionNoteDto[];
  currentUserId: string;
  editable: boolean;
  onNotesChange: (notes: FieldDailyReportSectionNoteDto[]) => void;
}

function NoteMeta({
  author,
  createdAt,
  editedAt,
  now,
  t,
  format,
}: {
  author: FieldDailyReportSectionNoteDto["author"];
  createdAt: string;
  editedAt: string | null;
  now: number;
  t: ReturnType<typeof useTranslations<"fieldDailyReport">>;
  format: ReturnType<typeof useFormatter>;
}) {
  return (
    <div style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)", marginBottom: 4 }}>
      <span style={{ fontWeight: 600, color: "var(--neutral-700)" }}>{author.name}</span>
      {" · "}
      <span>{authorRoleLabel(author, t)}</span>
      {" · "}
      <time dateTime={createdAt}>{format.relativeTime(new Date(createdAt), now)}</time>
      {editedAt ? (
        <span style={{ marginLeft: 4, fontStyle: "italic" }}>({t("sectionNoteEdited")})</span>
      ) : null}
    </div>
  );
}

export function FieldDailySectionNoteThread({
  projectId,
  reportDate,
  sectionKey,
  itemKey = "",
  notes: allNotes,
  currentUserId,
  editable,
  onNotesChange,
}: FieldDailySectionNoteThreadProps) {
  const t = useTranslations("fieldDailyReport");
  const format = useFormatter();
  const [now] = useState(() => Date.now());

  const sectionNotes = useMemo(
    () =>
      allNotes
        .filter((n) => n.sectionKey === sectionKey && n.itemKey === itemKey)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [allNotes, sectionKey, itemKey],
  );

  const [notesExpanded, setNotesExpanded] = useState(false);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [replyingToNoteId, setReplyingToNoteId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [expandedRepliesByNoteId, setExpandedRepliesByNoteId] = useState<Record<string, boolean>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteBody, setEditingNoteBody] = useState("");
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyBody, setEditingReplyBody] = useState("");
  const [busy, setBusy] = useState(false);

  const visibleNotes = notesExpanded ? sectionNotes : sectionNotes.slice(0, VISIBLE_COUNT);
  const hiddenNoteCount = Math.max(0, sectionNotes.length - VISIBLE_COUNT);

  const mergeNote = useCallback(
    (updated: FieldDailyReportSectionNoteDto) => {
      const exists = allNotes.some((n) => n.id === updated.id);
      onNotesChange(
        exists ? allNotes.map((n) => (n.id === updated.id ? updated : n)) : [updated, ...allNotes],
      );
    },
    [allNotes, onNotesChange],
  );

  const removeNote = useCallback(
    (noteId: string) => {
      onNotesChange(allNotes.filter((n) => n.id !== noteId));
    },
    [allNotes, onNotesChange],
  );

  const submitNote = async () => {
    const body = newNoteBody.trim();
    if (!body || submittingNote) return;
    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/field-daily/section-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate, sectionKey, itemKey, body }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as { note: FieldDailyReportSectionNoteDto };
      mergeNote(data.note);
      setNewNoteBody("");
      toast.success(t("sectionNoteSubmitSuccess"));
    } catch {
      toast.error(t("sectionNoteSubmitError"));
    } finally {
      setSubmittingNote(false);
    }
  };

  const saveNoteEdit = async (noteId: string) => {
    const body = editingNoteBody.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/field-daily/section-notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate, body }),
      });
      if (!res.ok) throw new Error("patch failed");
      const data = (await res.json()) as { note: FieldDailyReportSectionNoteDto };
      mergeNote(data.note);
      setEditingNoteId(null);
    } catch {
      toast.error(t("sectionNoteSubmitError"));
    } finally {
      setBusy(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/field-daily/section-notes/${noteId}?reportDate=${encodeURIComponent(reportDate)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("delete failed");
      removeNote(noteId);
      toast.success(t("sectionNoteDeleteSuccess"));
    } catch {
      toast.error(t("sectionNoteSubmitError"));
    } finally {
      setBusy(false);
    }
  };

  const submitReply = async (noteId: string) => {
    const body = replyDraft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/field-daily/section-notes/${noteId}/replies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportDate, body }),
        },
      );
      if (!res.ok) throw new Error("reply failed");
      const data = (await res.json()) as { reply: FieldDailyReportSectionNoteReplyDto };
      const note = sectionNotes.find((n) => n.id === noteId);
      if (note) {
        mergeNote({
          ...note,
          replies: [data.reply, ...note.replies],
        });
      }
      setReplyDraft("");
      setReplyingToNoteId(null);
      toast.success(t("sectionNoteReplySubmitSuccess"));
    } catch {
      toast.error(t("sectionNoteReplyError"));
    } finally {
      setBusy(false);
    }
  };

  const cancelReply = () => {
    setReplyDraft("");
    setReplyingToNoteId(null);
  };

  const openReplyComposer = (noteId: string) => {
    setReplyingToNoteId(noteId);
    setReplyDraft("");
    setEditingReplyId(null);
  };

  const saveReplyEdit = async (noteId: string, replyId: string) => {
    const body = editingReplyBody.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/field-daily/section-notes/${noteId}/replies/${replyId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportDate, body }),
        },
      );
      if (!res.ok) throw new Error("patch reply failed");
      const data = (await res.json()) as { reply: FieldDailyReportSectionNoteReplyDto };
      const note = sectionNotes.find((n) => n.id === noteId);
      if (note) {
        mergeNote({
          ...note,
          replies: note.replies.map((r) => (r.id === replyId ? data.reply : r)),
        });
      }
      setEditingReplyId(null);
    } catch {
      toast.error(t("sectionNoteReplyError"));
    } finally {
      setBusy(false);
    }
  };

  const deleteReply = async (noteId: string, replyId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/field-daily/section-notes/${noteId}/replies/${replyId}?reportDate=${encodeURIComponent(reportDate)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("delete reply failed");
      const note = sectionNotes.find((n) => n.id === noteId);
      if (note) {
        mergeNote({
          ...note,
          replies: note.replies.filter((r) => r.id !== replyId),
        });
      }
    } catch {
      toast.error(t("sectionNoteReplyError"));
    } finally {
      setBusy(false);
    }
  };

  const linkBtnStyle = {
    border: "none",
    background: "transparent",
    color: "var(--primary-600)",
    fontSize: "var(--text-caption)",
    fontWeight: 600,
    cursor: "pointer",
    padding: 0,
    textAlign: "left" as const,
  };

  const secondaryBtnStyle = {
    padding: "4px 10px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--neutral-200)",
    background: "var(--neutral-0)",
    fontSize: "var(--text-caption)",
    fontWeight: 600,
    cursor: "pointer",
  } as const;

  const primaryBtnStyle = {
    padding: "4px 10px",
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: "var(--primary-600)",
    color: "var(--neutral-0)",
    fontSize: "var(--text-caption)",
    fontWeight: 600,
    cursor: "pointer",
  } as const;

  const actionBtnStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
    border: "none",
    background: "transparent",
    color: "var(--neutral-500)",
    cursor: "pointer",
    borderRadius: "var(--radius-sm)",
  } as const;

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          fontSize: "var(--text-caption)",
          color: "var(--neutral-500)",
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {t("sectionNotesLabel")}
      </div>

      {editable ? (
        <div style={{ marginBottom: 10 }}>
          <textarea
            value={newNoteBody}
            onChange={(e) => setNewNoteBody(e.target.value)}
            rows={3}
            placeholder={t("sectionNotePlaceholder")}
            aria-label={t("sectionNotePlaceholder")}
            style={{
              width: "100%",
              fontSize: "var(--text-body)",
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--neutral-200)",
              resize: "vertical",
              minHeight: 72,
            }}
          />
          <button
            type="button"
            onClick={() => void submitNote()}
            disabled={submittingNote || !newNoteBody.trim()}
            style={{
              marginTop: 6,
              padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "var(--primary-600)",
              color: "var(--neutral-0)",
              fontWeight: 600,
              fontSize: "var(--text-caption)",
              cursor: submittingNote || !newNoteBody.trim() ? "not-allowed" : "pointer",
              opacity: submittingNote || !newNoteBody.trim() ? 0.6 : 1,
            }}
          >
            {submittingNote ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              t("sectionNoteSubmit")
            )}
          </button>
        </div>
      ) : null}

      {visibleNotes.length === 0 && !editable ? (
        <p style={{ margin: 0, fontSize: "var(--text-body)", color: "var(--neutral-500)", fontStyle: "italic" }}>
          {t("sectionNotesEmpty")}
        </p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleNotes.map((note) => {
          const repliesExpanded = expandedRepliesByNoteId[note.id] ?? false;
          const visibleReplies = repliesExpanded ? note.replies : note.replies.slice(0, VISIBLE_COUNT);
          const hiddenReplyCount = Math.max(0, note.replies.length - VISIBLE_COUNT);
          const isAuthor = note.author.id === currentUserId;

          return (
            <div
              key={note.id}
              style={{
                padding: "8px 10px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--neutral-200)",
                background: "var(--neutral-0)",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <NoteMeta author={note.author} createdAt={note.createdAt} editedAt={note.editedAt} now={now} t={t} format={format} />
                  {editingNoteId === note.id ? (
                    <>
                      <textarea
                        value={editingNoteBody}
                        onChange={(e) => setEditingNoteBody(e.target.value)}
                        rows={3}
                        aria-label={t("sectionNoteEditAria")}
                        style={{
                          width: "100%",
                          fontSize: "var(--text-body)",
                          padding: "8px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--neutral-200)",
                        }}
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <button type="button" onClick={() => void saveNoteEdit(note.id)} aria-label={t("sectionNoteSaveEdit")} style={actionBtnStyle}>
                          <Check size={16} aria-hidden />
                        </button>
                        <button type="button" onClick={() => setEditingNoteId(null)} aria-label={t("sectionNoteCancelEdit")} style={actionBtnStyle}>
                          <X size={16} aria-hidden />
                        </button>
                      </div>
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: "var(--text-body)", color: "var(--neutral-800)", whiteSpace: "pre-wrap" }}>
                      {note.body}
                    </p>
                  )}
                  {editable && editingNoteId !== note.id && replyingToNoteId !== note.id ? (
                    <button
                      type="button"
                      onClick={() => openReplyComposer(note.id)}
                      style={{ ...linkBtnStyle, marginTop: 6 }}
                    >
                      {t("sectionNoteReplyLink")}
                    </button>
                  ) : null}
                </div>
                {editable && isAuthor && editingNoteId !== note.id ? (
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <button
                      type="button"
                      aria-label={t("sectionNoteEditAria")}
                      title={t("sectionNoteEditAria")}
                      style={actionBtnStyle}
                      onClick={() => {
                        setEditingNoteId(note.id);
                        setEditingNoteBody(note.body);
                      }}
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={t("sectionNoteDeleteAria")}
                      title={t("sectionNoteDeleteAria")}
                      style={actionBtnStyle}
                      onClick={() => void deleteNote(note.id)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                ) : null}
              </div>

              {visibleReplies.length > 0 ? (
                <div
                  style={{
                    marginTop: 8,
                    marginLeft: 8,
                    paddingLeft: 10,
                    borderLeft: "2px solid var(--neutral-200)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {visibleReplies.map((reply) => {
                    const replyAuthor = reply.author.id === currentUserId;
                    return (
                      <div key={reply.id}>
                        <NoteMeta author={reply.author} createdAt={reply.createdAt} editedAt={reply.editedAt} now={now} t={t} format={format} />
                        {editingReplyId === reply.id ? (
                          <>
                            <textarea
                              value={editingReplyBody}
                              onChange={(e) => setEditingReplyBody(e.target.value)}
                              rows={2}
                              aria-label={t("sectionNoteEditReplyAria")}
                              style={{
                                width: "100%",
                                fontSize: "var(--text-body)",
                                padding: "6px 8px",
                                borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--neutral-200)",
                              }}
                            />
                            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                              <button type="button" onClick={() => void saveReplyEdit(note.id, reply.id)} aria-label={t("sectionNoteSaveEdit")} style={actionBtnStyle}>
                                <Check size={14} aria-hidden />
                              </button>
                              <button type="button" onClick={() => setEditingReplyId(null)} aria-label={t("sectionNoteCancelEdit")} style={actionBtnStyle}>
                                <X size={14} aria-hidden />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div style={{ display: "flex", gap: 8 }}>
                            <p style={{ margin: 0, flex: 1, fontSize: "var(--text-body)", color: "var(--neutral-800)", whiteSpace: "pre-wrap" }}>
                              {reply.body}
                            </p>
                            {editable && replyAuthor ? (
                              <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                                <button
                                  type="button"
                                  aria-label={t("sectionNoteEditReplyAria")}
                                  style={actionBtnStyle}
                                  onClick={() => {
                                    setEditingReplyId(reply.id);
                                    setEditingReplyBody(reply.body);
                                  }}
                                >
                                  <Pencil size={12} aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  aria-label={t("sectionNoteDeleteReplyAria")}
                                  style={actionBtnStyle}
                                  onClick={() => void deleteReply(note.id, reply.id)}
                                >
                                  <Trash2 size={12} aria-hidden />
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {hiddenReplyCount > 0 && !repliesExpanded ? (
                    <button
                      type="button"
                      onClick={() => setExpandedRepliesByNoteId((p) => ({ ...p, [note.id]: true }))}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--primary-600)",
                        fontSize: "var(--text-caption)",
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: 0,
                        textAlign: "left",
                      }}
                    >
                      {t("sectionNoteShowMoreReplies", { count: hiddenReplyCount })}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {editable && replyingToNoteId === note.id ? (
                <div
                  style={{
                    marginTop: 8,
                    marginLeft: 8,
                    paddingLeft: 10,
                    borderLeft: "2px solid var(--primary-200)",
                  }}
                >
                  <textarea
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    rows={2}
                    placeholder={t("sectionNoteReplyPlaceholder")}
                    aria-label={t("sectionNoteReplyPlaceholder")}
                    autoFocus
                    style={{
                      width: "100%",
                      fontSize: "var(--text-body)",
                      padding: "6px 8px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--neutral-200)",
                    }}
                  />
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => void submitReply(note.id)}
                      disabled={busy || !replyDraft.trim()}
                      style={{
                        ...primaryBtnStyle,
                        opacity: busy || !replyDraft.trim() ? 0.6 : 1,
                        cursor: busy || !replyDraft.trim() ? "not-allowed" : "pointer",
                      }}
                    >
                      {busy ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                      ) : (
                        t("sectionNoteReplySubmit")
                      )}
                    </button>
                    <button type="button" onClick={cancelReply} style={secondaryBtnStyle}>
                      {t("sectionNoteReplyCancel")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {hiddenNoteCount > 0 && !notesExpanded ? (
        <button
          type="button"
          onClick={() => setNotesExpanded(true)}
          style={{
            marginTop: 8,
            border: "none",
            background: "transparent",
            color: "var(--primary-600)",
            fontSize: "var(--text-caption)",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: 0,
          }}
        >
          <ChevronDown size={14} aria-hidden />
          {t("sectionNoteShowMore", { count: hiddenNoteCount })}
        </button>
      ) : null}
      {notesExpanded && sectionNotes.length > VISIBLE_COUNT ? (
        <button
          type="button"
          onClick={() => setNotesExpanded(false)}
          style={{
            marginTop: 8,
            border: "none",
            background: "transparent",
            color: "var(--primary-600)",
            fontSize: "var(--text-caption)",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: 0,
          }}
        >
          <ChevronUp size={14} aria-hidden />
          {t("sectionNoteShowLess")}
        </button>
      ) : null}
    </div>
  );
}

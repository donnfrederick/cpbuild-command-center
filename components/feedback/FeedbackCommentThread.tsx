"use client";

/**
 * Comment list + composer for feedback reports (mirrors projects/CommentThread patterns).
 * Uploads use type=feedback-comments; DELETE is author-only soft delete.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Pencil, Trash2, X, Camera, Images, Mic, Video, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { CameraCapture } from "@/components/projects/CameraCapture";
import type { CapturedFile } from "@/components/projects/CameraCapture";
import { burnTimestamp, resolveClientMime, HEIC_LARGE_FILE_WARNING_BYTES } from "@/lib/image-utils";
import { uploadWithRetry } from "@/lib/upload-with-retry";
import { MentionTextarea } from "@/components/ui/MentionTextarea";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";
import { useFileDrop } from "@/hooks/use-file-drop";
import { renderMentionNodesWithLinkifiedUrls } from "@/lib/mention-render";
import type { FeedbackEnvironment } from "@/lib/feedback-environment";

const FIELD_MEDIA_ACCEPT = "image/*,image/heic,image/heif,video/*,audio/*";

export interface FeedbackCommentAttachment {
  id: string;
  storageKey: string;
  storageUrl: string;
  mimeType: string;
  fileSizeBytes: number | null;
  caption: string | null;
  transcriptStatus: string;
  transcriptOriginal: string | null;
  transcriptEnglish: string | null;
}

export interface FeedbackCommentData {
  id: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
  author: { id: string; name: string | null; email: string };
  attachments: FeedbackCommentAttachment[];
}

interface FeedbackCommentThreadProps {
  feedbackReportId: string;
  currentUserId?: string;
  pollingEnabled?: boolean;
  feedbackEnvironment?: FeedbackEnvironment;
}

const EDIT_WINDOW_MS = 30 * 60 * 1000;
const VIDEO_SIZE_LIMIT = 50 * 1024 * 1024;
const POLL_MS = 8000;

function initials(name: string | null, email: string): string {
  if (name && name.trim()) return name.trim().slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function canEdit(comment: FeedbackCommentData, userId?: string): boolean {
  if (!userId) return false;
  if (comment.author.id !== userId) return false;
  return Date.now() - new Date(comment.createdAt).getTime() < EDIT_WINDOW_MS;
}

const CSS = `
  @keyframes fct-spin { to { transform: rotate(360deg); } }
  .fct-spin { animation: fct-spin 1s linear infinite; }
`;

function AttachmentGrid({ attachments }: { attachments: FeedbackCommentAttachment[] }) {
  const t = useTranslations("feedback");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});

  async function handleTranscribe(a: FeedbackCommentAttachment) {
    setTranscribing((p) => ({ ...p, [a.id]: true }));
    try {
      const res = await fetch(`/api/upload/field-media/${a.id}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLang: "es" }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { transcriptEnglish?: string };
      setTranscripts((p) => ({ ...p, [a.id]: data.transcriptEnglish ?? "" }));
    } catch {
      toast.error(t("transcriptionFailed"));
    } finally {
      setTranscribing((p) => ({ ...p, [a.id]: false }));
    }
  }

  const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
  const others = attachments.filter((a) => !a.mimeType.startsWith("image/"));

  return (
    <div className="mt-2">
      {images.length > 0 && (
        <div
          className="mb-2 grid gap-1"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
        >
          {images.map((a, i) => (
            <button
              key={a.id}
              type="button"
              className="relative aspect-square w-full overflow-hidden rounded-lg bg-[var(--neutral-100)]"
              onClick={() => setLightbox(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.storageUrl} alt={a.caption ?? ""} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {others.map((a) => (
        <div key={a.id} className="mb-1.5">
          {a.mimeType.startsWith("audio/") && (
            <div className="flex flex-col gap-1">
              <audio controls src={a.storageUrl} className="h-9 w-full" />
              {!transcripts[a.id] && (
                <button
                  type="button"
                  className="flex items-center gap-1 self-start border-0 bg-transparent p-0 text-[11px] font-semibold text-[var(--primary-600)]"
                  onClick={() => handleTranscribe(a)}
                  disabled={transcribing[a.id]}
                >
                  {transcribing[a.id] && <Loader2 size={11} className="fct-spin" />}
                  {transcribing[a.id] ? t("transcribing") : t("transcribe")}
                </button>
              )}
              {transcripts[a.id] && (
                <p className="m-0 rounded-lg bg-[var(--neutral-50)] px-2.5 py-1.5 text-xs text-[var(--neutral-700)]">
                  {transcripts[a.id]}
                </p>
              )}
            </div>
          )}
          {a.mimeType.startsWith("video/") && (
            <div className="relative flex min-h-[80px] items-center justify-center overflow-hidden rounded-[10px] bg-black">
              <Video size={28} className="absolute text-white/50" aria-hidden />
              <video controls src={a.storageUrl} className="max-h-[200px] w-full" />
              {!transcripts[a.id] && (
                <button
                  type="button"
                  className="absolute bottom-1.5 right-2 cursor-pointer rounded-md border-0 bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white"
                  onClick={() => handleTranscribe(a)}
                  disabled={transcribing[a.id]}
                >
                  {transcribing[a.id] ? t("transcribing") : t("transcribe")}
                </button>
              )}
            </div>
          )}
          {a.caption && <p className="mt-0.5 text-[11px] text-[var(--neutral-500)]">{a.caption}</p>}
        </div>
      ))}

      {lightbox !== null && (
        <div
          className="fixed inset-0 z-[320] flex flex-col items-center justify-center bg-black/92"
          role="dialog"
          aria-modal="true"
          aria-label={t("attachmentLightboxImage")}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label={t("attachmentLightboxClose")}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border-0 bg-white/15 text-white"
          >
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[lightbox].storageUrl}
            alt=""
            className="max-h-[80dvh] max-w-[92vw] rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}

function commentsQuery(environment?: FeedbackEnvironment): string {
  return environment === "production" ? "?environment=production" : "";
}

export function FeedbackCommentThread({
  feedbackReportId,
  currentUserId,
  pollingEnabled = false,
  feedbackEnvironment,
}: FeedbackCommentThreadProps) {
  const t = useTranslations("feedback");
  const tCommon = useTranslations("common");
  const formatCommentRelTime = useCallback(
    (dateStr: string) => {
      const ms = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(ms / 60000);
      if (mins < 1) return t("commentRelJustNow");
      if (mins < 60) return t("commentRelMinutesAgo", { n: mins });
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return t("commentRelHoursAgo", { n: hrs });
      return t("commentRelDaysAgo", { n: Math.floor(hrs / 24) });
    },
    [t]
  );
  const [comments, setComments] = useState<FeedbackCommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newBody, setNewBody] = useState("");
  const [newMedia, setNewMedia] = useState<{ file: File; localUrl: string; mimeType: string; caption: string }[]>(
    []
  );
  const [showCamera, setShowCamera] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseUrl = `/api/feedback/${feedbackReportId}/comments${commentsQuery(feedbackEnvironment)}`;

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(baseUrl);
      if (!res.ok) return;
      const data = (await res.json()) as { comments: FeedbackCommentData[] };
      setComments(data.comments ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [baseUrl, feedbackEnvironment]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (!pollingEnabled) return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(baseUrl);
          if (!res.ok) return;
          const data = (await res.json()) as { comments: FeedbackCommentData[] };
          setComments(data.comments ?? []);
        } catch {
          /* silent */
        }
      })();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [pollingEnabled, baseUrl, feedbackEnvironment]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchComments();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchComments]);

  function startEdit(comment: FeedbackCommentData) {
    setEditingId(comment.id);
    setEditBody(comment.body);
  }

  async function saveEdit(commentId: string) {
    if (!editBody.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`${baseUrl}/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? t("commentEditFailed"));
        return;
      }
      const updated = (await res.json()) as FeedbackCommentData;
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      setEditingId(null);
    } catch {
      toast.error(t("commentEditFailed"));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(commentId: string) {
    setDeleting(true);
    try {
      const res = await fetch(`${baseUrl}/${commentId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? t("commentDeleteFailed"));
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setConfirmDeleteId(null);
    } catch {
      toast.error(t("commentDeleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  function handleCameraCapture(captured: CapturedFile[]) {
    const slots = 10 - newMedia.length;
    const items = captured.slice(0, slots).map((c) => ({
      file: c.file,
      localUrl: c.localUrl,
      mimeType: c.mimeType,
      caption: "",
    }));
    setNewMedia((p) => [...p, ...items]);
    setShowCamera(false);
  }

  const processLibraryFiles = useCallback(async (rawFiles: File[]) => {
    const slots = 10 - newMedia.length;
    const files = rawFiles.slice(0, slots);
    const newItems: typeof newMedia = [];
    for (const file of files) {
      const mime = resolveClientMime(file);
      if (mime.startsWith("video/") && file.size > VIDEO_SIZE_LIMIT) {
        toast.error(`"${file.name}" exceeds the 50 MB video limit.`);
        continue;
      }
      let processedFile = file;
      if (mime.startsWith("image/") && !mime.includes("heic") && !mime.includes("heif")) {
        try {
          const stamped = await burnTimestamp(file, new Date(), { uploaded: true });
          processedFile = new File([stamped], file.name, { type: "image/jpeg" });
        } catch {
          /* use original */
        }
      } else if ((mime.includes("heic") || mime.includes("heif")) && file.size > HEIC_LARGE_FILE_WARNING_BYTES) {
        toast(tCommon("heicLargeFileWarning", { filename: file.name, sizeMb: (file.size / 1024 / 1024).toFixed(0) }), { icon: "ℹ️" });
      }
      newItems.push({
        file: processedFile,
        localUrl: URL.createObjectURL(processedFile),
        mimeType: processedFile.type || mime,
        caption: "",
      });
    }
    if (newItems.length > 0) setNewMedia((p) => [...p, ...newItems]);
  }, [newMedia.length, tCommon]);

  async function handleLibraryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = "";
    await processLibraryFiles(rawFiles);
  }

  async function handleSubmit() {
    if (!newBody.trim() && newMedia.length === 0) return;
    setSubmitting(true);

    const uploadedKeys: string[] = [];
    const uploadedUrls: string[] = [];
    const uploadedMimes: string[] = [];
    const uploadedSizes: number[] = [];
    const uploadedCaptions: string[] = [];

    if (newMedia.length > 0) {
      setUploadProgress({ current: 0, total: newMedia.length });
      for (let i = 0; i < newMedia.length; i++) {
        setUploadProgress({ current: i + 1, total: newMedia.length });
        const m = newMedia[i];
        try {
          const form = new FormData();
          form.append("file", m.file);
          form.append("type", "feedback-comments");
          if (m.caption) form.append("caption", m.caption);
          const data = await uploadWithRetry(form);
          uploadedKeys.push(data.storageKey);
          uploadedUrls.push(data.storageUrl);
          uploadedMimes.push(data.mimeType);
          uploadedSizes.push(data.fileSizeBytes);
          uploadedCaptions.push(m.caption);
        } catch (uploadErr) {
          console.error(`[upload] feedback comment file "${m.file.name}" failed after retries:`, uploadErr);
          toast.error(`"${m.file.name}" failed to upload and was skipped.`);
        }
      }
    }
    setUploadProgress(null);

    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: newBody.trim() || "📎",
          attachmentKeys: uploadedKeys,
          attachmentUrls: uploadedUrls,
          attachmentMimeTypes: uploadedMimes,
          attachmentFileSizeBytes: uploadedSizes,
          attachmentCaptions: uploadedCaptions,
        }),
      });
      if (!res.ok) throw new Error();
      const comment = (await res.json()) as FeedbackCommentData;
      setComments((prev) => [...prev, comment]);
      setNewBody("");
      setNewMedia([]);
      void fetchComments();
    } catch {
      toast.error(t("commentPostFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  const isUploading = uploadProgress !== null;
  const canPost = (newBody.trim().length > 0 || newMedia.length > 0) && !isUploading && !submitting;

  const handleMediaDropRejected = useCallback(() => {
    toast.error(tCommon("dropRejectedFileType"));
  }, [tCommon]);

  const { dropHandlers } = useFileDrop({
    onFiles: processLibraryFiles,
    onRejected: handleMediaDropRejected,
    accept: FIELD_MEDIA_ACCEPT,
    disabled: newMedia.length >= 10 || isUploading || submitting,
  });

  const MEDIA_BTN: React.CSSProperties = {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 8,
    border: "1.5px solid var(--neutral-200)",
    backgroundColor: "var(--neutral-50)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "var(--neutral-600)",
  };

  return (
    <>
      <style>{CSS}</style>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-bold uppercase tracking-wide text-[var(--neutral-500)]">
            {t("commentsSection")}
            {comments.length > 0 ? ` (${comments.length})` : ""}
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 size={20} className="fct-spin text-[var(--neutral-400)]" />
          </div>
        ) : comments.length === 0 ? (
          <p className="my-3 text-center text-sm text-[var(--neutral-400)]">{t("noComments")}</p>
        ) : (
          <div className="mb-4 flex flex-col gap-4">
            {comments.map((comment) => {
              const isEditing = editingId === comment.id;
              const isAuthor = comment.author.id === currentUserId;

              return (
                <div key={comment.id}>
                  <div className="flex items-start gap-2.5">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[var(--primary-700)]"
                      style={{ backgroundColor: "var(--primary-100)" }}
                    >
                      {initials(comment.author.name, comment.author.email)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-[var(--neutral-800)]">
                          {comment.author.name ?? comment.author.email}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-[var(--neutral-400)]">
                            {formatCommentRelTime(comment.createdAt)}
                          </span>
                          {comment.editedAt && (
                            <span className="text-[10px] italic text-[var(--neutral-400)]">
                              ({t("edited")})
                            </span>
                          )}
                          {canEdit(comment, currentUserId) && !isEditing && (
                            <button
                              type="button"
                              onClick={() => startEdit(comment)}
                              aria-label={t("editCommentAria")}
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center border-0 bg-transparent p-2"
                            >
                              <Pencil size={12} className="text-[var(--neutral-400)]" />
                            </button>
                          )}
                          {isAuthor && !isEditing && confirmDeleteId !== comment.id && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(comment.id)}
                              aria-label={t("deleteCommentAria")}
                              className="flex min-h-[44px] min-w-[44px] items-center justify-center border-0 bg-transparent p-2"
                            >
                              <Trash2 size={12} className="text-[var(--neutral-400)]" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="mt-1.5">
                          <MentionTextarea
                            value={editBody}
                            onChange={setEditBody}
                            rows={3}
                            aria-label={t("editCommentAria")}
                            className="w-full rounded-lg border-[1.5px] border-[var(--primary-300)] bg-[var(--neutral-0)] p-2 font-sans text-sm outline-none"
                          />
                          <div className="mt-1.5 flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(comment.id)}
                              disabled={editSaving || !editBody.trim()}
                              className="flex items-center gap-1 rounded-md border-0 bg-[var(--primary-500)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {editSaving && <Loader2 size={11} className="fct-spin" />}
                              {t("saveComment")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-md border-0 bg-[var(--neutral-100)] px-3 py-1.5 text-xs font-semibold text-[var(--neutral-600)]"
                            >
                              {t("cancelEdit")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--neutral-800)]">
                          {renderMentionNodesWithLinkifiedUrls(comment.body, {
                            linkOpensNewTabSuffix: t("commentLinkOpensNewTabSuffix"),
                          })}
                        </p>
                      )}

                      {confirmDeleteId === comment.id && (
                        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--error-200)] bg-[var(--error-50)] px-2.5 py-2">
                          <span className="text-xs font-medium text-[var(--error-700)]">
                            {t("confirmDeleteComment")}
                          </span>
                          <div className="flex shrink-0 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deleting}
                              className="rounded-md border-0 bg-[var(--neutral-100)] px-2.5 py-1 text-[11px] font-semibold text-[var(--neutral-600)]"
                            >
                              {t("cancelEdit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(comment.id)}
                              disabled={deleting}
                              className="flex items-center gap-1 rounded-md border-0 bg-[var(--error-600)] px-2.5 py-1 text-[11px] font-semibold text-white"
                            >
                              {deleting && <Loader2 size={10} className="fct-spin" />}
                              {t("deleteComment")}
                            </button>
                          </div>
                        </div>
                      )}

                      {comment.attachments.length > 0 && <AttachmentGrid attachments={comment.attachments} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="relative border-t border-[var(--neutral-100)] pt-3.5" {...dropHandlers}>
          <MentionTextarea
            value={newBody}
            onChange={setNewBody}
            placeholder={t("addCommentPlaceholder")}
            rows={2}
            className="w-full rounded-[10px] border-[1.5px] border-[var(--neutral-200)] bg-[var(--neutral-0)] px-3 py-2 font-sans text-sm text-[var(--neutral-900)] outline-none"
            aria-label={t("addCommentAria")}
          />

          {newMedia.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {newMedia.map((m, i) => (
                <div
                  key={i}
                  className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg border-[1.5px] border-[var(--neutral-200)]"
                >
                  {m.mimeType.startsWith("image/") && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={m.localUrl} alt="" className="h-full w-full object-cover" />
                  )}
                  {m.mimeType.startsWith("video/") && (
                    <div className="flex h-full w-full items-center justify-center bg-[#111]">
                      <Video size={18} className="text-white" />
                    </div>
                  )}
                  {m.mimeType.startsWith("audio/") && (
                    <div className="flex h-full w-full items-center justify-center bg-[var(--neutral-100)]">
                      <Mic size={18} className="text-[var(--neutral-500)]" />
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={t("removeAttachmentAria")}
                    onClick={() => setNewMedia((p) => p.filter((_, j) => j !== i))}
                    className="absolute right-0.5 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-0 bg-black/60 p-0"
                  >
                    <X size={10} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FIELD_MEDIA_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={handleLibraryChange}
                />
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  disabled={newMedia.length >= 10}
                  style={MEDIA_BTN}
                  aria-label={t("cameraAria")}
                >
                  <Camera size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={newMedia.length >= 10}
                  style={MEDIA_BTN}
                  aria-label={t("libraryAria")}
                >
                  <Images size={14} />
                </button>
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canPost}
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg border-0 px-4 text-[13px] font-bold disabled:cursor-not-allowed"
                style={{
                  color: canPost ? "#fff" : "var(--neutral-400)",
                  backgroundColor: canPost ? "var(--primary-500)" : "var(--neutral-100)",
                }}
              >
                {submitting && <Loader2 size={13} className="fct-spin" />}
                {uploadProgress
                  ? t("uploadingProgress", {
                      current: uploadProgress.current,
                      total: uploadProgress.total,
                    })
                  : t("postComment")}
              </button>
            </div>
          <FileDropOverlay
            disabled={newMedia.length >= 10 || isUploading || submitting}
          />
        </div>
      </div>

      {showCamera && (
        <CameraCapture
          maxItems={10 - newMedia.length}
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </>
  );
}

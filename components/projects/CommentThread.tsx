"use client";

/**
 * CommentThread — shared comment list + composer for observations and issues.
 *
 * Features:
 *  - Comment list with avatar, author, relative timestamp, (edited) badge
 *  - EN/ES toggle pill per comment (calls /api/translate, caches in state)
 *  - 3-col photo/video/audio grid with lightbox
 *  - "Transcribe" button on audio/video attachments
 *  - Pencil icon (edit) on own comments ≤ 30 min old — inline textarea swap
 *  - Add-comment form: textarea + Camera (CameraCapture) + Library
 *  - Batch-uploads media on post, supports captions per attachment
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  BlobStoreVerificationError,
  enqueueMutationWithVerifiedBlobs,
  offlineAttachmentFieldsFromStaged,
} from "@/lib/offline/enqueue-mutation-with-blobs";
import { ImgWithOfflineFallback, VideoWithOfflineFallback } from "@/components/projects/MediaWithOfflineFallback";
import { useTranslations } from "next-intl";
import { Pencil, Trash2, X, Check, Camera, Images, Mic, Video, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CameraCapture } from "@/components/projects/CameraCapture";
import type { CapturedFile } from "@/components/projects/CameraCapture";
import { resolveClientMime, isFieldMediaImageFile } from "@/lib/image-utils";
import { processLibraryMediaFile } from "@/lib/stage-library-field-media";
import { uploadWithRetry } from "@/lib/upload-with-retry";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import { MentionTextarea } from "@/components/ui/MentionTextarea";
import { DictationButton } from "@/components/ui/DictationButton";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";
import { useFileDrop } from "@/hooks/use-file-drop";
import { readSnapshotCommentsForEntity } from "@/lib/offline/snapshot-project-reads";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { renderMentionNodes } from "@/lib/mention-render";
import { isFieldLeadershipRole } from "@/lib/permissions";
import { appendTranscriptSegment } from "@/lib/browser-speech";

const FIELD_MEDIA_ACCEPT = "image/*,image/heic,image/heif,video/*,audio/*";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommentAttachment {
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

export interface CommentData {
  id: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
  author: { id: string; name: string | null; email: string };
  attachments: CommentAttachment[];
}

export interface CommentThreadProps {
  projectId: string;
  entityType: "observation" | "issue";
  entityId: string;
  /** ID of the current authenticated user for edit gating */
  currentUserId?: string;
  /** Role of the current user — ADMIN can delete any comment */
  currentUserRole?: string;
}

const EDIT_WINDOW_MS = 30 * 60 * 1000;
const VIDEO_SIZE_LIMIT = 50 * 1024 * 1024;

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string | null, email: string): string {
  if (name && name.trim()) return name.trim().slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function relTime(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function canEdit(comment: CommentData, userId?: string): boolean {
  if (!userId) return false;
  if (comment.author.id !== userId) return false;
  return Date.now() - new Date(comment.createdAt).getTime() < EDIT_WINDOW_MS;
}

function renderMentionBody(text: string): React.ReactNode {
  return renderMentionNodes(text);
}

const CSS = `
  @keyframes ct-spin { to { transform: rotate(360deg); } }
  .ct-spin { animation: ct-spin 1s linear infinite; }
`;

// ── Sub-components ────────────────────────────────────────────────────────────

function AttachmentGrid({ attachments }: { attachments: CommentAttachment[] }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});

  async function handleTranscribe(a: CommentAttachment) {
    setTranscribing((p) => ({ ...p, [a.id]: true }));
    try {
      const res = await fetch(`/api/upload/field-media/${a.id}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLang: "es" }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { transcriptEnglish?: string };
      setTranscripts((p) => ({ ...p, [a.id]: data.transcriptEnglish ?? "" }));
    } catch {
      toast.error("Transcription failed. Please try again.");
    } finally {
      setTranscribing((p) => ({ ...p, [a.id]: false }));
    }
  }

  const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
  const others = attachments.filter((a) => !a.mimeType.startsWith("image/"));

  return (
    <div style={{ marginTop: 8 }}>
      {/* Image grid */}
      {images.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 8 }}>
          {images.map((a, i) => (
            <div key={a.id} style={{ position: "relative", paddingBottom: "100%", borderRadius: 8, overflow: "hidden", cursor: "pointer", backgroundColor: "var(--neutral-100)" }}
              onClick={() => setLightbox(i)}>
              <ImgWithOfflineFallback src={a.storageUrl} alt={a.caption ?? ""} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ))}
        </div>
      )}

      {/* Audio / Video */}
      {others.map((a) => (
        <div key={a.id} style={{ marginBottom: 6 }}>
          {a.mimeType.startsWith("audio/") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <audio controls src={a.storageUrl} style={{ width: "100%", height: 36 }} />
              {!transcripts[a.id] && (
                <button type="button" onClick={() => handleTranscribe(a)} disabled={transcribing[a.id]}
                  style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 600, color: "var(--primary-600)", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  {transcribing[a.id] && <Loader2 size={11} className="ct-spin" />}
                  {transcribing[a.id] ? "Transcribing…" : "Transcribe"}
                </button>
              )}
              {transcripts[a.id] && (
                <p style={{ fontSize: 12, color: "var(--neutral-700)", backgroundColor: "var(--neutral-50)", padding: "6px 10px", borderRadius: 8, margin: 0 }}>
                  {transcripts[a.id]}
                </p>
              )}
            </div>
          )}
          {a.mimeType.startsWith("video/") && (
            <div style={{ borderRadius: 10, overflow: "hidden", backgroundColor: "#000", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80, position: "relative" }}>
              <Video size={28} style={{ color: "rgba(255,255,255,0.5)", position: "absolute" }} />
              <VideoWithOfflineFallback controls src={a.storageUrl} style={{ width: "100%", maxHeight: 200 }} />
              {!transcripts[a.id] && (
                <button type="button" onClick={() => handleTranscribe(a)} disabled={transcribing[a.id]}
                  style={{ position: "absolute", bottom: 6, right: 8, fontSize: 11, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
                  {transcribing[a.id] ? "Transcribing…" : "Transcribe"}
                </button>
              )}
              {transcripts[a.id] && (
                <p style={{ fontSize: 12, color: "var(--neutral-700)", backgroundColor: "var(--neutral-50)", padding: "6px 10px", borderRadius: 8, margin: "4px 0 0" }}>
                  {transcripts[a.id]}
                </p>
              )}
            </div>
          )}
          {a.caption && <p style={{ fontSize: 11, color: "var(--neutral-500)", margin: "2px 0 0" }}>{a.caption}</p>}
        </div>
      ))}

      {/* Lightbox */}
      {lightbox !== null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 800, backgroundColor: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <button type="button" onClick={() => setLightbox(null)} aria-label="Close" style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 99, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={18} style={{ color: "#fff" }} />
          </button>
          <ImgWithOfflineFallback src={images[lightbox].storageUrl} alt="" style={{ maxWidth: "92vw", maxHeight: "80dvh", objectFit: "contain", borderRadius: 8 }} />
          {images[lightbox].caption && <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 10 }}>{images[lightbox].caption}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {images.length > 1 && images.map((_, i) => (
              <div key={i} onClick={() => setLightbox(i)} style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: i === lightbox ? "#fff" : "rgba(255,255,255,0.35)", cursor: "pointer" }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CommentThread({ projectId, entityType, entityId, currentUserId, currentUserRole }: CommentThreadProps) {
  const tCommon = useTranslations("common");
  const tUnits = useTranslations("units");
  const tOffline = useTranslations("offlineIndicator");
  const tOfflineMedia = useTranslations("offlineMedia");
  const td = useTranslations("dictation");
  const { isOnline } = useOfflineStatus();
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newBody, setNewBody] = useState("");
  const [newMedia, setNewMedia] = useState<{ file: File; localUrl: string; mimeType: string; caption: string }[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [commentFocused, setCommentFocused] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newCommentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editCommentTextareaRef = useRef<HTMLTextAreaElement>(null);

  const baseUrl = entityType === "observation"
    ? `/api/projects/${projectId}/observations/${entityId}/comments`
    : `/api/projects/${projectId}/issues/${entityId}/comments`;

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(baseUrl);
      if (!res.ok) return;
      const data = await res.json() as { comments: CommentData[] };
      setComments(data.comments ?? []);
    } catch {
      const cached = await readSnapshotCommentsForEntity(
        projectId,
        entityType,
        entityId,
      );
      if (cached) {
        setComments(cached as CommentData[]);
      }
    } finally {
      setLoading(false);
    }
  }, [baseUrl, projectId, entityType, entityId]);

  useEffect(() => { void fetchComments(); }, [fetchComments]);

  // ── Edit comment ───────────────────────────────────────────────────────────

  function startEdit(comment: CommentData) {
    setEditingId(comment.id);
    setEditBody(comment.body);
  }

  async function saveEdit(commentId: string) {
    if (!editBody.trim()) return;
    if (!isOnline) {
      toast.error(tOffline("offlineActionUnavailable"));
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch(`${baseUrl}/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast.error(err.error ?? "Failed to update comment.");
        return;
      }
      const updated = await res.json() as CommentData;
      setComments((prev) => prev.map((c) => c.id === commentId ? updated : c));
      setEditingId(null);
    } catch {
      toast.error("Failed to update comment.");
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete comment (admin only) ────────────────────────────────────────────

  async function handleDelete(commentId: string) {
    if (!isOnline) {
      toast.error(tOffline("offlineActionUnavailable"));
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`${baseUrl}/${commentId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast.error(err.error ?? "Failed to delete comment.");
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setConfirmDeleteId(null);
    } catch {
      toast.error("Failed to delete comment.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Media for new comment ──────────────────────────────────────────────────

  function handleCameraCapture(captured: CapturedFile[]) {
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - newMedia.length;
    const items = captured.slice(0, slots).map((c) => ({
      file: c.file, localUrl: c.localUrl, mimeType: c.mimeType, caption: "",
    }));
    setNewMedia((p) => [...p, ...items]);
    setShowCamera(false);
  }

  const processLibraryFiles = useCallback(async (rawFiles: File[]) => {
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - newMedia.length;
    const files = rawFiles.slice(0, slots);
    const newItems: typeof newMedia = [];
    for (const file of files) {
      const mime = resolveClientMime(file);
      if (mime.startsWith("video/") && file.size > VIDEO_SIZE_LIMIT) {
        toast.error(`"${file.name}" exceeds the 50 MB video limit.`);
        continue;
      }
      let processedFile = file;
      let processedMime = mime;
      try {
        const prepared = await processLibraryMediaFile(file, {
          stamp: { uploaded: true },
          onHeicLargeWarning: (f) =>
            toast(tCommon("heicLargeFileWarning", { filename: f.name, sizeMb: (f.size / 1024 / 1024).toFixed(0) }), { icon: "ℹ️" }),
        });
        processedFile = prepared.file;
        processedMime = prepared.mimeType;
      } catch {
        if (isFieldMediaImageFile(file)) {
          toast.error(tUnits("obsImagePrepareFailed"));
          continue;
        }
      }
      newItems.push({ file: processedFile, localUrl: URL.createObjectURL(processedFile), mimeType: processedMime, caption: "" });
    }
    if (newItems.length > 0) setNewMedia((p) => [...p, ...newItems]);
  }, [newMedia.length, tCommon, tUnits]);

  async function handleLibraryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = "";
    await processLibraryFiles(rawFiles);
  }

  // ── Submit new comment ─────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!newBody.trim() && newMedia.length === 0) return;
    setSubmitting(true);

    // Offline path: enqueue comment with verified local media blobs
    if (!navigator.onLine && (newBody.trim() || newMedia.length > 0)) {
      if (!newBody.trim() && newMedia.length > 0) {
        toast.error(tUnits("commentBodyRequiredForMedia"));
        setSubmitting(false);
        return;
      }
      try {
        await enqueueMutationWithVerifiedBlobs({
          type: "add-comment",
          url: baseUrl,
          method: "POST",
          body: {
            body: newBody.trim(),
            ...offlineAttachmentFieldsFromStaged(newMedia),
          },
          mediaFiles: newMedia.map((m) => m.file),
        });
        setNewBody("");
        setNewMedia([]);
        toast.success(
          newMedia.length > 0
            ? tUnits("commentSavedOfflineWithMedia")
            : tUnits("commentSavedOffline"),
        );
      } catch (err) {
        if (err instanceof BlobStoreVerificationError) {
          toast.error(tOfflineMedia("photoSaveFailed"));
        } else {
          toast.error(tUnits("commentSaveOfflineFailed"));
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

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
          form.append("type", entityType === "observation" ? "obs-comments" : "issue-comments");
          if (m.caption) form.append("caption", m.caption);
          const data = await uploadWithRetry(form, { projectId });
          uploadedKeys.push(data.storageKey);
          uploadedUrls.push(data.storageUrl);
          uploadedMimes.push(data.mimeType);
          uploadedSizes.push(data.fileSizeBytes);
          uploadedCaptions.push(m.caption);
        } catch (uploadErr) {
          console.error(`[upload] comment file "${m.file.name}" failed after retries:`, uploadErr);
          toast.error(tUnits("uploadFailedWithName", { name: m.file.name }));
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
      const comment = await res.json() as CommentData;
      setComments((prev) => [...prev, comment]);
      setNewBody("");
      setNewMedia([]);
    } catch {
      toast.error("Failed to post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isUploading = uploadProgress !== null;
  const canPost = (newBody.trim().length > 0 || newMedia.length > 0) && !isUploading && !submitting;

  const handleMediaDropRejected = useCallback(() => {
    toast.error(tCommon("dropRejectedFileType"));
  }, [tCommon]);

  const { dropHandlers } = useFileDrop({
    onFiles: processLibraryFiles,
    onRejected: handleMediaDropRejected,
    accept: FIELD_MEDIA_ACCEPT,
    disabled: newMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY || isUploading || submitting,
  });

  return (
    <>
      <style>{CSS}</style>
      <div>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Comments {comments.length > 0 ? `(${comments.length})` : ""}
          </span>
        </div>

        {/* Comment list */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
            <Loader2 size={20} style={{ color: "var(--neutral-400)" }} className="ct-spin" />
          </div>
        ) : comments.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--neutral-400)", textAlign: "center", margin: "12px 0" }}>No comments yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>
            {comments.map((comment) => {
              const isEditing = editingId === comment.id;

              return (
                <div key={comment.id}>
                  {/* Author row */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 99, flexShrink: 0,
                      backgroundColor: "var(--primary-100)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, color: "var(--primary-700)",
                    }}>
                      {initials(comment.author.name, comment.author.email)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-800)" }}>
                          {comment.author.name ?? comment.author.email}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, color: "var(--neutral-400)" }}>{relTime(comment.createdAt)}</span>
                          {comment.editedAt && (
                            <span style={{ fontSize: 10, color: "var(--neutral-400)", fontStyle: "italic" }}>(edited)</span>
                          )}
                          {canEdit(comment, currentUserId) && !isEditing && (
                            <button type="button" onClick={() => startEdit(comment)} aria-label="Edit comment"
                              style={{ background: "none", border: "none", padding: "2px", cursor: "pointer", display: "flex" }}>
                              <Pencil size={12} style={{ color: "var(--neutral-400)" }} />
                            </button>
                          )}
                          {isFieldLeadershipRole(currentUserRole ?? "") && !isEditing && confirmDeleteId !== comment.id && (
                            <button type="button" onClick={() => setConfirmDeleteId(comment.id)} aria-label="Delete comment"
                              style={{ background: "none", border: "none", padding: "2px", cursor: "pointer", display: "flex" }}>
                              <Trash2 size={12} style={{ color: "var(--neutral-400)" }} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Body or edit textarea */}
                      {isEditing ? (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ position: "relative" }}>
                            <MentionTextarea
                              value={editBody}
                              onChange={setEditBody}
                              textFieldRef={editCommentTextareaRef}
                              rows={3}
                              aria-label="Edit comment"
                              style={{
                                width: "100%", padding: "8px 10px 44px", borderRadius: 8, resize: "none",
                                border: "1.5px solid var(--primary-300)", fontSize: 14, fontFamily: "inherit",
                                backgroundColor: "var(--neutral-0)", boxSizing: "border-box", outline: "none",
                              }}
                            />
                            <DictationButton
                              disabled={editSaving}
                              fieldLabel={td("fieldComment")}
                              focusTargetRef={editCommentTextareaRef}
                              onAppendText={(segment) => setEditBody((prev) => appendTranscriptSegment(prev, segment))}
                              style={{ position: "absolute", right: 8, bottom: 8 }}
                            />
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" }}>
                            <button type="button" onClick={() => saveEdit(comment.id)} disabled={editSaving || !editBody.trim()}
                              style={{ fontSize: 12, fontWeight: 600, color: "#fff", backgroundColor: "var(--primary-500)", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                              {editSaving && <Loader2 size={11} className="ct-spin" />} Save
                            </button>
                            <button type="button" onClick={() => setEditingId(null)}
                              style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-600)", backgroundColor: "var(--neutral-100)", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p style={{ fontSize: 14, color: "var(--neutral-800)", margin: "4px 0 0", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {renderMentionBody(comment.body)}
                          </p>
                        </>
                      )}

                      {/* Admin delete confirmation */}
                      {confirmDeleteId === comment.id && (
                        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, backgroundColor: "var(--error-50)", border: "1px solid var(--error-200)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <span style={{ fontSize: 12, color: "var(--error-700)", fontWeight: 500 }}>Delete this comment?</span>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button type="button" onClick={() => setConfirmDeleteId(null)} disabled={deleting}
                              style={{ fontSize: 11, fontWeight: 600, color: "var(--neutral-600)", backgroundColor: "var(--neutral-100)", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                              Cancel
                            </button>
                            <button type="button" onClick={() => handleDelete(comment.id)} disabled={deleting}
                              style={{ fontSize: 11, fontWeight: 600, color: "#fff", backgroundColor: "var(--error-600)", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                              {deleting && <Loader2 size={10} className="ct-spin" />}
                              Delete
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Attachments */}
                      {comment.attachments.length > 0 && (
                        <AttachmentGrid attachments={comment.attachments} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Add comment form ── */}
        <div style={{ borderTop: "1px solid var(--neutral-100)", paddingTop: 14, position: "relative" }} {...dropHandlers}>
          <div style={{ position: "relative" }}>
            <MentionTextarea
              value={newBody}
              onChange={setNewBody}
              textFieldRef={newCommentTextareaRef}
              placeholder="Add a comment… (type @ to mention someone)"
              rows={2}
              style={{
                width: "100%", padding: "8px 44px 8px 12px", borderRadius: 10, resize: "none",
                border: "1.5px solid var(--neutral-200)", fontSize: 14, lineHeight: 1.5,
                backgroundColor: "var(--neutral-0)", color: "var(--neutral-900)",
                boxSizing: "border-box", fontFamily: "inherit", outline: "none",
                transition: "border-color 0.15s",
              }}
              aria-label="Add a comment"
              onFocus={() => setCommentFocused(true)}
            />
            <DictationButton
              disabled={submitting}
              fieldLabel={td("fieldComment")}
              focusTargetRef={newCommentTextareaRef}
              onAppendText={(segment) => setNewBody((prev) => appendTranscriptSegment(prev, segment))}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}
            />
          </div>

          {/* Staged media for comment */}
          {newMedia.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {newMedia.map((m, i) => (
                <div key={i} style={{ position: "relative", width: 60, height: 60, borderRadius: 8, overflow: "hidden", border: "1.5px solid var(--neutral-200)", flexShrink: 0 }}>
                  {m.mimeType.startsWith("image/") && <img src={m.localUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  {m.mimeType.startsWith("video/") && <div style={{ width: "100%", height: "100%", backgroundColor: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}><Video size={18} style={{ color: "#fff" }} /></div>}
                  {m.mimeType.startsWith("audio/") && <div style={{ width: "100%", height: "100%", backgroundColor: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center" }}><Mic size={18} style={{ color: "var(--neutral-500)" }} /></div>}
                  <button type="button" aria-label="Remove" onClick={() => setNewMedia((p) => p.filter((_, j) => j !== i))}
                    style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.6)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                    <X size={10} style={{ color: "#fff" }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Toolbar — shown while composing or while camera/library is active */}
          {(commentFocused || showCamera || newBody.trim().length > 0 || newMedia.length > 0) && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
              {/* Media buttons */}
              <div style={{ display: "flex", gap: 6 }}>
                <input ref={fileInputRef} type="file" accept={FIELD_MEDIA_ACCEPT} multiple
                  style={{ display: "none" }} onChange={handleLibraryChange} />
                <button type="button" onClick={() => setShowCamera(true)} disabled={newMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY}
                  style={MEDIA_BTN} aria-label="Camera">
                  <Camera size={14} />
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={newMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY}
                  style={MEDIA_BTN} aria-label="Library">
                  <Images size={14} />
                </button>
              </div>

              {/* Post button */}
              <button type="button" onClick={handleSubmit} disabled={!canPost}
                style={{
                  fontSize: 13, fontWeight: 700, color: canPost ? "#fff" : "var(--neutral-400)",
                  backgroundColor: canPost ? "var(--primary-500)" : "var(--neutral-100)",
                  border: "none", borderRadius: 8, padding: "7px 16px",
                  cursor: canPost ? "pointer" : "not-allowed", transition: "background-color 0.15s",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                {submitting && <Loader2 size={13} className="ct-spin" />}
                {uploadProgress ? `Uploading ${uploadProgress.current}/${uploadProgress.total}…` : "Post"}
              </button>
            </div>
          )}
          <FileDropOverlay
            disabled={newMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY || isUploading || submitting}
          />
        </div>
      </div>

      {showCamera && (
        <CameraCapture
          projectId={projectId}
          maxItems={MAX_MEDIA_ATTACHMENTS_PER_ENTITY - newMedia.length}
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </>
  );
}

const MEDIA_BTN: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: "1.5px solid var(--neutral-200)", backgroundColor: "var(--neutral-50)",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "var(--neutral-600)",
};

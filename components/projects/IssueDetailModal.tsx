"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Paperclip, Pencil, Trash2, Check, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Camera, Images, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { IssueSummary, ObsAttachment } from "@/components/projects/UnitCards";
import type { ImageAnnotationPayload } from "@/lib/image-annotation-schema";
import { parseImageAnnotation } from "@/lib/image-annotation-schema";
import type { UnitContext } from "@/components/projects/AddObservationModal";
import type { IssueScope } from "@/components/projects/AddIssueModal";
import { CommentThread } from "@/components/projects/CommentThread";
import { ImgWithOfflineFallback, VideoWithOfflineFallback } from "@/components/projects/MediaWithOfflineFallback";
import { renderMentionNodes } from "@/lib/mention-render";
import { MentionTextarea } from "@/components/ui/MentionTextarea";
import { ImageAnnotationEditor, type AnnotationSaveResult } from "@/components/projects/ImageAnnotationEditor";
import { ImageAnnotationOverlay } from "@/components/projects/ImageAnnotationOverlay";
import { CameraCapture } from "@/components/projects/CameraCapture";
import type { CapturedFile } from "@/components/projects/CameraCapture";
import { uploadWithRetry } from "@/lib/upload-with-retry";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import { formatFieldNotesLocationDisplay } from "@/lib/field-notes-scope";
import { useFieldNotesLocationLabels, useFieldNotesBuilderTagDisplayLabels } from "@/components/projects/useFieldNotesLocationLabels";
import { MAX_MEDIA_ATTACHMENTS_PER_ENTITY } from "@/lib/media-attachment-limits";
import { resolveIssueTypeLabel, resolvePartyLabel, useIssueCatalog } from "@/lib/issues/use-issue-catalog";
import { isFieldLeadershipRole } from "@/lib/permissions";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";
import { useFileDrop } from "@/hooks/use-file-drop";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { saveIssueEditOffline } from "@/lib/offline/issue-offline-save";
import { formatResponsibleParties } from "@/lib/issues/issueDisplay";
import { formatMissingMaterialQuantityDisplay } from "@/lib/issues/missing-materials";
import {
  FieldNotesEditLocationSection,
  fieldNotesEditLocationFromRecord,
  unitRefFromEditLocation,
  type FieldNotesEditLocationState,
} from "@/components/projects/FieldNotesEditLocationSection";

const ISSUE_MEDIA_ACCEPT = "image/*,video/*,audio/*";

// ── CSS ───────────────────────────────────────────────────────────────────────

const SHEET_CSS = `
  .idm-backdrop { position: fixed; inset: 0; z-index: 400; display: flex; align-items: flex-end; background: rgba(0,0,0,0); transition: background-color 0.26s ease; }
  .idm-backdrop.idm-visible { background: rgba(0,0,0,0.5); }
  .idm-sheet { position: relative; width: 100%; max-height: 94dvh; border-radius: 20px 20px 0 0; background: var(--neutral-0); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); display: flex; flex-direction: column; box-shadow: 0 -4px 40px rgba(0,0,0,0.18); }
  .idm-sheet.idm-visible { transform: translateY(0); }
  .idm-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 4px; flex-shrink: 0; }
  .idm-body { flex: 1; overflow-y: auto; padding: 0 var(--page-padding-x) calc(env(safe-area-inset-bottom, 0px) + 32px); }
  .idm-lightbox { position: fixed; inset: 0; z-index: 600; background: rgba(0,0,0,0.95); display: flex; align-items: center; justify-content: center; }
  @keyframes idm-spin { to { transform: rotate(360deg); } }
  .idm-spin { animation: idm-spin 1s linear infinite; }
  @media (min-width: 768px) {
    .idm-backdrop { align-items: stretch; justify-content: flex-end; }
    .idm-sheet { width: min(560px, 100vw); max-height: none; height: 100%; border-radius: 0; transform: translateX(105%); box-shadow: -4px 0 32px rgba(0,0,0,0.18); }
    .idm-sheet.idm-visible { transform: translateX(0); }
    .idm-handle { display: none; }
    .idm-body { padding-bottom: 32px; }
  }
`;

// ── Issue type meta (legacy badge colors; labels come from catalog) ───────────

const ISSUE_TYPE_META: Record<string, { bg: string; color: string }> = {
  SUBSTRATE_CONDITION: { bg: "#fef9c3", color: "#854d0e" },
  DAMAGED_MATERIALS:   { bg: "#fee2e2", color: "#991b1b" },
  MISSING_MATERIALS:   { bg: "#fff7ed", color: "#9a3412" },
  TRADE_DAMAGE_REPAIR: { bg: "#fce7f3", color: "#9d174d" },
};

function issueTypeBadgeStyle(code: string): { bg: string; color: string } {
  const colors = ISSUE_TYPE_META[code];
  return {
    bg: colors?.bg ?? "var(--neutral-100)",
    color: colors?.color ?? "var(--neutral-600)",
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function useIsBrowser() {
  const [ok, setOk] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOk(true), []);
  return ok;
}

// ── Media grid ────────────────────────────────────────────────────────────────

function MediaGrid({
  attachments,
  projectId,
  issueId,
  canAnnotate,
  onAnnotationSaved,
}: {
  attachments: ObsAttachment[];
  projectId: string;
  issueId: string;
  canAnnotate: boolean;
  onAnnotationSaved?: (updated: IssueSummary) => void;
}) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [annotatingIdx, setAnnotatingIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const photos = attachments.filter((a) => a.mimeType.startsWith("image/") || a.mimeType.startsWith("video/"));
  const audios = attachments.filter((a) => a.mimeType.startsWith("audio/"));

  async function handleTranscribe(a: ObsAttachment) {
    setTranscribing((p) => ({ ...p, [a.id]: true }));
    try {
      const res = await fetch(`/api/upload/field-media/${a.id}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceLang: "es" }) });
      if (!res.ok) throw new Error();
      const data = await res.json() as { transcriptEnglish?: string };
      setTranscripts((p) => ({ ...p, [a.id]: data.transcriptEnglish ?? "" }));
    } catch { toast.error("Transcription failed."); }
    finally { setTranscribing((p) => ({ ...p, [a.id]: false })); }
  }

  async function handleAnnotationSave(imageIdx: number, result: { kind: "layered"; annotation: ImageAnnotationPayload }) {
    setAnnotatingIdx(null);
    const original = photos[imageIdx];
    if (!original) return;
    setUploading((p) => ({ ...p, [original.id]: true }));
    try {
      const patch = await fetch(`/api/projects/${projectId}/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateAttachmentAnnotation: {
            attachmentId: original.id,
            imageAnnotation: result.annotation,
          },
        }),
      });
      if (!patch.ok) {
        const err = await patch.text().catch(() => "");
        throw new Error(err || `HTTP ${patch.status}`);
      }
      await patch.json().catch(() => ({}));
      const refreshed = await fetch(`/api/projects/${projectId}/issues/${issueId}`);
      if (refreshed.ok) {
        onAnnotationSaved?.((await refreshed.json()) as IssueSummary);
      }
      toast.success("Markup saved.");
    } catch {
      toast.error("Failed to save markup.");
    } finally {
      setUploading((p) => ({ ...p, [original.id]: false }));
    }
  }

  if (attachments.length === 0) return null;

  return (
    <>
      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginTop: 12 }}>
          {photos.map((a, idx) => (
            <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {/* Natural aspect ratio — no square crop */}
              <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", backgroundColor: "var(--neutral-100)" }}>
                <button type="button" onClick={() => setLightboxIdx(idx)} aria-label="View"
                  style={{ display: "block", width: "100%", border: "none", padding: 0, cursor: "pointer", backgroundColor: "transparent" }}>
                  {a.mimeType.startsWith("image/") ? (
                    <ImageAnnotationOverlay
                      src={a.storageUrl}
                      annotation={parseImageAnnotation(a.imageAnnotation)}
                      alt={a.caption ?? ""}
                      style={{ width: "100%", height: "auto", display: "block" }}
                    />
                  ) : (
                    <VideoWithOfflineFallback src={a.storageUrl} style={{ width: "100%", height: "auto", display: "block" }} muted playsInline />
                  )}
                </button>
                {a.mimeType.startsWith("image/") && canAnnotate && onAnnotationSaved && (
                  <button type="button" aria-label="Annotate" onClick={() => setAnnotatingIdx(idx)} disabled={!!uploading[a.id]}
                    style={{
                      position: "absolute", bottom: 8, right: 8,
                      width: 40, height: 40, minWidth: 40, minHeight: 40, borderRadius: 99,
                      backgroundColor: "rgba(0,0,0,0.6)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
                    }}>
                    {uploading[a.id] ? <Loader2 size={16} style={{ color: "#fff" }} className="idm-spin" /> : <Pencil size={16} style={{ color: "#fff" }} />}
                  </button>
                )}
              </div>
              {a.caption && <p style={{ fontSize: 11, color: "var(--neutral-500)", margin: 0 }}>{a.caption}</p>}
              {a.lastMarkedBy && a.lastMarkedAt && (
                <p style={{ fontSize: 10, color: "var(--neutral-400)", margin: "2px 0 0", lineHeight: 1.3 }}>
                  Last marked by {a.lastMarkedBy.name ?? a.lastMarkedBy.email.split("@")[0]} · {formatDate(a.lastMarkedAt)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {audios.map((a) => (
        <div key={a.id} style={{ marginTop: 10 }}>
          <div style={{ borderRadius: 10, overflow: "hidden", backgroundColor: "var(--neutral-50)", border: "1px solid var(--neutral-200)" }}>
            { }
            <audio src={a.storageUrl} controls style={{ width: "100%", display: "block" }} />
          </div>
          {(transcripts[a.id] ?? a.transcriptEnglish) ? (
            <p style={{ fontSize: 12, color: "var(--neutral-700)", backgroundColor: "var(--neutral-50)", padding: "6px 10px", borderRadius: 8, margin: "4px 0 0" }}>{transcripts[a.id] ?? a.transcriptEnglish}</p>
          ) : (
            <button type="button" onClick={() => handleTranscribe(a)} disabled={transcribing[a.id]}
              style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: "var(--primary-600)", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              {transcribing[a.id] && <Loader2 size={11} className="idm-spin" />}
              {transcribing[a.id] ? "Transcribing…" : "Transcribe"}
            </button>
          )}
        </div>
      ))}
      {lightboxIdx !== null && createPortal(
        (() => {
          const lbPhoto = photos[lightboxIdx];
          return (
        <div className="idm-lightbox" onClick={() => setLightboxIdx(null)}>
          <button type="button" aria-label="Close" onClick={() => setLightboxIdx(null)}
            style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 12px)", right: 16, width: 40, height: 40, borderRadius: 99, border: "none", backgroundColor: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={20} style={{ color: "#fff" }} />
          </button>
          {photos.length > 1 && (
            <button type="button" aria-label="Previous photo" onClick={(e) => {
              e.stopPropagation();
              const cur = lightboxIdx ?? 0;
              setLightboxIdx((cur - 1 + photos.length) % photos.length);
            }}
              style={{ position: "absolute", left: 8, top: "50%", marginTop: -22, width: 44, height: 44, borderRadius: 99, border: "none", backgroundColor: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={24} style={{ color: "#fff" }} />
            </button>
          )}
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100vw", maxHeight: "90dvh", padding: "0 56px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {lbPhoto.mimeType.startsWith("image/") ? (
              <div
                style={{
                  maxWidth: "100%",
                  maxHeight: "85dvh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ImageAnnotationOverlay
                  src={lbPhoto.storageUrl}
                  annotation={parseImageAnnotation(lbPhoto.imageAnnotation)}
                  alt=""
                  style={{ maxWidth: "100%", maxHeight: "85dvh", borderRadius: 8 }}
                />
              </div>
            ) : (
              <VideoWithOfflineFallback src={lbPhoto.storageUrl} controls autoPlay playsInline style={{ maxWidth: "100%", maxHeight: "85dvh", width: "auto", height: "auto", borderRadius: 8, display: "block" }} />
            )}
            {lbPhoto.caption && (
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 10, textAlign: "center" }}>{lbPhoto.caption}</p>
            )}
          </div>
          {photos.length > 1 && (
            <button type="button" aria-label="Next photo" onClick={(e) => {
              e.stopPropagation();
              const cur = lightboxIdx ?? 0;
              setLightboxIdx((cur + 1) % photos.length);
            }}
              style={{ position: "absolute", right: 8, top: "50%", marginTop: -22, width: 44, height: 44, borderRadius: 99, border: "none", backgroundColor: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronRight size={24} style={{ color: "#fff" }} />
            </button>
          )}
          {photos.length > 1 && (
            <div style={{ position: "absolute", bottom: "calc(env(safe-area-inset-bottom,0px) + 16px)", left: "50%", transform: "translateX(-50%)", color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600 }}>
              Photo {(lightboxIdx ?? 0) + 1} / {photos.length}
            </div>
          )}
        </div>
          );
        })(),
        document.body,
      )}
      {annotatingIdx !== null && photos[annotatingIdx] && (
        <ImageAnnotationEditor
          src={photos[annotatingIdx].storageUrl}
          exportMode="layered"
          initialAnnotation={photos[annotatingIdx].imageAnnotation}
          onSave={(result) => {
            if ("kind" in result && result.kind === "layered") {
              void handleAnnotationSave(annotatingIdx, result);
            }
          }}
          onClose={() => setAnnotatingIdx(null)}
        />
      )}
    </>
  );
}

// ── Resolve media staging ────────────────────────────────────────────────────

interface StagedMedia {
  clientId: string;
  file: File;
  localUrl: string;
  mimeType: string;
}

// ── Main modal ────────────────────────────────────────────────────────────────

export interface IssueDetailModalProps {
  issue: IssueSummary;
  unitContext: UnitContext;
  projectId: string;
  projectName?: string;
  currentUserId?: string;
  currentUserRole?: string;
  scopes?: IssueScope[];
  onClose: () => void;
  onUpdated?: (updated: IssueSummary) => void;
  /** Called after admin successfully deletes the issue — parent should remove it from the list */
  onDeleted?: (issueId: string) => void;
  /** Called when a group resolve resolves >1 issues — parent should refresh all units */
  onGroupResolved?: () => void;
  /** When true, opens the modal with the resolve section pre-expanded (for quick-resolve from the card). */
  initialResolveOpen?: boolean;
  /** When true, opens the modal with the edit form pre-expanded (for quick-edit from the card). */
  initialEditOpen?: boolean;
  /** Issue list navigation — when provided, renders Prev / N of N / Next bar at the bottom of the sheet */
  onPrev?: () => void;
  onNext?: () => void;
  issueIndex?: number;
  issueTotal?: number;
}

export function IssueDetailModal({
  issue: initialIssue,
  unitContext,
  projectId,
  projectName = "Project",
  currentUserId,
  currentUserRole,
  scopes = [],
  onClose,
  onUpdated,
  onDeleted,
  onGroupResolved,
  initialResolveOpen = false,
  initialEditOpen = false,
  onPrev,
  onNext,
  issueIndex,
  issueTotal,
}: IssueDetailModalProps) {
  const t = useTranslations("units");
  const fieldNotesLabels = useFieldNotesLocationLabels();
  const builderTagDisplayLabels = useFieldNotesBuilderTagDisplayLabels();
  const tCommon = useTranslations("common");
  const tOffline = useTranslations("offlineIndicator");
  const { isOnline } = useOfflineStatus();
  const { issueTypes: catalogIssueTypes, responsibleParties: catalogParties } =
    useIssueCatalog(projectId);

  function requireOnline(): boolean {
    if (isOnline) return true;
    toast.error(tOffline("offlineActionUnavailable"));
    return false;
  }
  const isBrowser = useIsBrowser();
  const [visible, setVisible] = useState(false);
  const mountedRef = useRef(true);
  const closeDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [issue, setIssue] = useState(initialIssue);
  const [editing, setEditing] = useState(initialEditOpen);
  const [editDesc, setEditDesc] = useState(issue.shortDescription);
  const [editType, setEditType] = useState(issue.issueType);
  const [editBlocking, setEditBlocking] = useState(issue.isBlockingWork);
  const [editLocation, setEditLocation] = useState<FieldNotesEditLocationState>(() =>
    fieldNotesEditLocationFromRecord(
      issue.unitRef,
      issue.scopeTags.map((t) => t.row.id),
    ),
  );
  const [editScopeIds, setEditScopeIds] = useState<Set<string>>(
    () => new Set(issue.scopeTags.map((t) => t.row.id))
  );
  const [editSelectedParties, setEditSelectedParties] = useState<Set<string>>(() =>
    new Set(
      initialIssue.responsibleParties?.length
        ? initialIssue.responsibleParties
        : initialIssue.responsibleParty
          ? [initialIssue.responsibleParty]
          : [],
    ),
  );
  const [editNotes, setEditNotes] = useState(issue.notes ?? "");
  const [editRemovedIds, setEditRemovedIds] = useState<Set<string>>(new Set());
  const [editNewMedia, setEditNewMedia] = useState<StagedMedia[]>([]);
  const [editUploadProgress, setEditUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [showEditCamera, setShowEditCamera] = useState(false);
  const [editAnnotatingAttachment, setEditAnnotatingAttachment] = useState<ObsAttachment | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Resolve UI state — pre-open for non-bulk quick-resolve (bulk shows option buttons by default)
  const isBulkInit = !!(initialIssue.bulkGroupId && (initialIssue.bulkGroupCount ?? 0) > 1);
  const [showResolveForm, setShowResolveForm] = useState(initialResolveOpen && !isBulkInit);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolveGroup, setResolveGroup] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveMedia, setResolveMedia] = useState<StagedMedia[]>([]);
  const [resolveUploadProgress, setResolveUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [showResolveCamera, setShowResolveCamera] = useState(false);
  const resolveFileInputRef = useRef<HTMLInputElement>(null);

  // Delete UI state (admin only)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    const id = requestAnimationFrame(() => {
      if (mountedRef.current) setVisible(true);
    });
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(id);
      if (closeDelayTimerRef.current) clearTimeout(closeDelayTimerRef.current);
      if (pendingCloseTimerRef.current) clearTimeout(pendingCloseTimerRef.current);
    };
  }, []);

  const close = useCallback(() => {
    if (!mountedRef.current) return;
    setVisible(false);
    if (closeDelayTimerRef.current) clearTimeout(closeDelayTimerRef.current);
    closeDelayTimerRef.current = setTimeout(() => {
      closeDelayTimerRef.current = null;
      if (mountedRef.current) onClose();
    }, 280);
  }, [onClose]);

  const scheduleClose = useCallback((delayMs: number) => {
    if (pendingCloseTimerRef.current) clearTimeout(pendingCloseTimerRef.current);
    pendingCloseTimerRef.current = setTimeout(() => {
      pendingCloseTimerRef.current = null;
      close();
    }, delayMs);
  }, [close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "ArrowLeft"  && onPrev) { onPrev(); return; }
      if (e.key === "ArrowRight" && onNext) { onNext(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, onPrev, onNext]);

  const isCreator = !!(currentUserId && issue.createdBy.id === currentUserId);
  // INSTALL_MANAGER is an operational role — they own installation work and must be able to
  // view all issue content (including photos), resolve issues, and edit issue details across
  // the project, not just their own. MEMBER and above can already view all photos; this
  // extends full operational control to INSTALL_MANAGER.
  const isPrivileged =
    currentUserRole === "ADMIN" ||
    currentUserRole === "DEVELOPER" ||
    currentUserRole === "INSTALL_MANAGER" ||
    currentUserRole === "INSTALL_DIRECTOR";
  const canEdit = issue._pendingSync || isCreator || isPrivileged || currentUserRole === "DESIGNER";
  const canResolve = isCreator || isPrivileged;

  async function handleReopen() {
    if (!requireOnline()) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/issues/${issue.id}/reopen`, { method: "POST" });
      if (!res.ok) { toast.error("Failed to reopen issue."); return; }
      setIssue({ ...issue, status: "OPEN", resolvedBy: null, resolvedAt: null, resolutionNote: null });
      onUpdated?.({ ...issue, status: "OPEN", resolvedBy: null, resolutionNote: null });
      toast.success("Issue reopened.");
    } catch { toast.error("Failed to reopen issue."); }
  }

  async function handleDelete() {
    if (!requireOnline()) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/issues/${issue.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to delete issue."); return; }
      onDeleted?.(issue.id);
      close();
    } catch {
      toast.error("Failed to delete issue.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleResolve(groupOverride?: boolean) {
    if (!requireOnline()) return;
    if (resolving) return;
    setResolving(true);
    const resolveGroupValue = groupOverride ?? resolveGroup;

    const attachmentKeys: string[] = [];
    const attachmentUrls: string[] = [];
    const attachmentMimeTypes: string[] = [];
    const attachmentFileSizeBytes: number[] = [];

    if (resolveMedia.length > 0) {
      setResolveUploadProgress({ current: 0, total: resolveMedia.length });
      for (let i = 0; i < resolveMedia.length; i++) {
        const m = resolveMedia[i];
        setResolveUploadProgress({ current: i + 1, total: resolveMedia.length });
        try {
          const form = new FormData();
          form.append("file", m.file);
          form.append("type", "issues");
          const data = await uploadWithRetry(form, { projectId });
          attachmentKeys.push(data.storageKey);
          attachmentUrls.push(data.storageUrl);
          attachmentMimeTypes.push(data.mimeType);
          attachmentFileSizeBytes.push(data.fileSizeBytes);
        } catch (uploadErr) {
          console.error(`[upload] resolve file ${i + 1} failed after retries:`, uploadErr);
          toast.error(`Failed to upload file ${i + 1}. It will be skipped.`);
        }
      }
      setResolveUploadProgress(null);
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/issues/${issue.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolutionNote: resolutionNote.trim() || undefined,
          resolveGroup: resolveGroupValue,
          attachmentKeys,
          attachmentUrls,
          attachmentMimeTypes,
          attachmentFileSizeBytes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        toast.error(body.error ?? "Failed to resolve issue.");
        return;
      }
      const data = await res.json() as IssueSummary & { resolvedCount: number };
      // Use the full server response to avoid stale closure values
      const resolved: IssueSummary = {
        ...issue,
        ...data,
        status: "RESOLVED",
        resolvedBy: data.resolvedBy ?? null,
        resolvedAt: data.resolvedAt,
        resolutionNote: data.resolutionNote ?? null,
        attachments: data.attachments ?? issue.attachments,
      };
      setIssue(resolved);
      onUpdated?.(resolved);
      resolveMedia.forEach((m) => URL.revokeObjectURL(m.localUrl));
      setShowResolveForm(false);
      setResolutionNote("");
      setResolveMedia([]);
      setResolveGroup(false);
      const msg = data.resolvedCount > 1
        ? `Resolved for all ${data.resolvedCount} units`
        : "Issue resolved";
      toast.success(msg);
      // When a group resolve happened, trigger a full cards refresh so
      // all sibling units reflect their newly-resolved status.
      if (data.resolvedCount > 1) onGroupResolved?.();
      // Close the modal so the user lands back on the unit view and sees
      // the issue card move into the resolved accordion.
      scheduleClose(400);
    } catch { toast.error("Failed to resolve issue."); }
    finally { setResolving(false); setResolveUploadProgress(null); }
  }

  const processResolveFiles = useCallback((rawFiles: File[]) => {
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - resolveMedia.length;
    const files = rawFiles.slice(0, slots);
    const toAdd = files.map((file) => ({
      clientId: `${Date.now()}-${Math.random()}`,
      file,
      localUrl: URL.createObjectURL(file),
      mimeType: file.type || "application/octet-stream",
    }));
    if (toAdd.length > 0) setResolveMedia((prev) => [...prev, ...toAdd]);
  }, [resolveMedia.length]);

  function handleResolveFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = "";
    processResolveFiles(rawFiles);
  }

  function handleResolveCameraCapture(captured: CapturedFile[]) {
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - resolveMedia.length;
    const toAdd = captured.slice(0, slots).map((c) => ({
      clientId: `${Date.now()}-${Math.random()}`,
      file: c.file,
      localUrl: c.localUrl,
      mimeType: c.mimeType,
    }));
    setResolveMedia((prev) => [...prev, ...toAdd]);
    setShowResolveCamera(false);
  }

  const processEditFiles = useCallback((rawFiles: File[]) => {
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - editNewMedia.length;
    const files = rawFiles.slice(0, slots);
    const toAdd = files.map((file) => ({
      clientId: `${Date.now()}-${Math.random()}`,
      file,
      localUrl: URL.createObjectURL(file),
      mimeType: file.type || "application/octet-stream",
    }));
    if (toAdd.length > 0) setEditNewMedia((prev) => [...prev, ...toAdd]);
  }, [editNewMedia.length]);

  function handleEditFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = "";
    processEditFiles(rawFiles);
  }

  function handleEditCameraCapture(captured: CapturedFile[]) {
    const slots = MAX_MEDIA_ATTACHMENTS_PER_ENTITY - editNewMedia.length;
    const toAdd = captured.slice(0, slots).map((c) => ({
      clientId: `${Date.now()}-${Math.random()}`,
      file: c.file,
      localUrl: c.localUrl,
      mimeType: c.mimeType,
    }));
    setEditNewMedia((prev) => [...prev, ...toAdd]);
    setShowEditCamera(false);
  }

  async function handleEditAnnotationSave(result: AnnotationSaveResult) {
    if (!editAnnotatingAttachment) return;
    if (!("kind" in result) || result.kind !== "layered") return;
    try {
      const patch = await fetch(`/api/projects/${projectId}/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateAttachmentAnnotation: {
            attachmentId: editAnnotatingAttachment.id,
            imageAnnotation: result.annotation,
          },
        }),
      });
      if (!patch.ok) {
        const err = await patch.text().catch(() => "");
        throw new Error(err || `HTTP ${patch.status}`);
      }
      const refreshed = await fetch(`/api/projects/${projectId}/issues/${issue.id}`);
      if (!refreshed.ok) throw new Error();
      const data = (await refreshed.json()) as IssueSummary;
      setIssue(data);
      onUpdated?.(data);
      setEditAnnotatingAttachment(null);
      toast.success(t("markupSaved"));
    } catch {
      toast.error(t("markupSaveFailed"));
    }
  }

  async function handleSaveEdit() {
    if (!editDesc.trim()) return;
    if (editSelectedParties.size === 0) {
      toast.error(t("responsiblePartiesRequired"));
      return;
    }

    const effectivelyOffline =
      issue._pendingSync ||
      !isOnline ||
      (typeof navigator !== "undefined" && !navigator.onLine);

    if (effectivelyOffline && issue._pendingSync) {
      if (!currentUserId) {
        toast.error(tOffline("offlineActionUnavailable"));
        return;
      }
      setEditSaving(true);
      try {
        const updated = await saveIssueEditOffline({
          projectId,
          issue,
          input: {
            shortDescription: editDesc.trim(),
            notes: editNotes.trim(),
            issueType: editType,
            isBlockingWork: editBlocking,
            responsibleParty: Array.from(editSelectedParties)[0] ?? issue.responsibleParty,
            responsibleParties: Array.from(editSelectedParties),
            scopeTagIds: isCreator ? editLocation.scopeTagIds : Array.from(editScopeIds),
            ...(isCreator ? { unitRef: unitRefFromEditLocation(editLocation) } : {}),
            removeAttachmentIds: Array.from(editRemovedIds),
            newMediaFiles: editNewMedia.map((m) => ({ file: m.file, mimeType: m.mimeType })),
          },
        });
        setIssue(updated);
        onUpdated?.(updated);
        setEditing(false);
        setEditRemovedIds(new Set());
        editNewMedia.forEach((m) => URL.revokeObjectURL(m.localUrl));
        setEditNewMedia([]);
        toast.success(t("issueUpdatedOffline"));
      } catch {
        toast.error(t("issueUpdateOfflineFailed"));
      } finally {
        setEditSaving(false);
      }
      return;
    }

    if (!requireOnline()) return;
    setEditSaving(true);
    try {
      const addAttachmentKeys: string[] = [];
      const addAttachmentUrls: string[] = [];
      const addAttachmentMimeTypes: string[] = [];
      const addAttachmentFileSizeBytes: number[] = [];

      if (editNewMedia.length > 0) {
        setEditUploadProgress({ current: 0, total: editNewMedia.length });
        for (let i = 0; i < editNewMedia.length; i++) {
          const m = editNewMedia[i];
          setEditUploadProgress({ current: i + 1, total: editNewMedia.length });
          try {
            const form = new FormData();
            form.append("file", m.file);
            form.append("type", "issues");
            const data = await uploadWithRetry(form, { projectId });
            addAttachmentKeys.push(data.storageKey);
            addAttachmentUrls.push(data.storageUrl);
            addAttachmentMimeTypes.push(data.mimeType);
            addAttachmentFileSizeBytes.push(data.fileSizeBytes);
          } catch (uploadErr) {
            console.error(`[upload] edit file ${i + 1} failed after retries:`, uploadErr);
            toast.error(`Failed to upload file ${i + 1}. It will be skipped.`);
          }
        }
        setEditUploadProgress(null);
      }

      const res = await fetch(`/api/projects/${projectId}/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortDescription: editDesc.trim(),
          notes: editNotes.trim() || null,
          issueType: editType,
          isBlockingWork: editBlocking,
          responsibleParties: Array.from(editSelectedParties),
          scopeTagIds: isCreator ? editLocation.scopeTagIds : Array.from(editScopeIds),
          ...(isCreator ? { unitRef: unitRefFromEditLocation(editLocation) } : {}),
          ...(editRemovedIds.size > 0 ? { removeAttachmentIds: Array.from(editRemovedIds) } : {}),
          ...(addAttachmentKeys.length > 0 ? { addAttachmentKeys, addAttachmentUrls, addAttachmentMimeTypes, addAttachmentFileSizeBytes } : {}),
        }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json() as IssueSummary;
      setIssue(updated);
      onUpdated?.(updated);
      setEditing(false);
      setEditRemovedIds(new Set());
      editNewMedia.forEach((m) => URL.revokeObjectURL(m.localUrl));
      setEditNewMedia([]);
      toast.success(t("editSaveSuccess"));
    } catch { toast.error(t("editSaveFailed")); }
    finally { setEditSaving(false); setEditUploadProgress(null); }
  }

  async function handleExportPdf() {
    if (!requireOnline()) return;
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const coverTitleLine = issue.shortDescription.slice(0, 200);
      const res = await fetch(`/api/projects/${projectId}/issues/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueIds: [issue.id],
          status: "all",
          projectName,
          filterSummary: t("exportDetailPdfFilterIssue"),
          coverTitleLine,
          sortOrder: "newest",
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(formatPdfExportErrorToast(errBody, t("exportDetailPdfFailed")));
        return;
      }
      const blob = await res.blob();
      const fileName = `issue-${issue.id.slice(0, 8)}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });
      const isMobilePwa =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] }) &&
        window.matchMedia("(display-mode: standalone)").matches;
      if (isMobilePwa) {
        await navigator.share({ files: [file], title: fileName });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 1000);
      }
    } catch {
      toast.error(t("exportDetailPdfFailedGeneric"));
    } finally {
      setExportingPdf(false);
    }
  }

  const handleMediaDropRejected = useCallback(() => {
    toast.error(tCommon("dropRejectedFileType"));
  }, [tCommon]);

  const { dropHandlers: editDropHandlers } = useFileDrop({
    onFiles: processEditFiles,
    onRejected: handleMediaDropRejected,
    accept: ISSUE_MEDIA_ACCEPT,
    disabled: editNewMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY || editSaving,
  });

  const { dropHandlers: resolveDropHandlers } = useFileDrop({
    onFiles: processResolveFiles,
    onRejected: handleMediaDropRejected,
    accept: ISSUE_MEDIA_ACCEPT,
    disabled: resolving || resolveMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY,
  });

  if (!isBrowser) return null;

  const metaStyle = issueTypeBadgeStyle(issue.issueType);
  const meta = {
    label: resolveIssueTypeLabel(issue.issueType, catalogIssueTypes),
    bg: metaStyle.bg,
    color: metaStyle.color,
  };
  const authorLabel = issue.createdBy.name ?? issue.createdBy.email.split("@")[0];
  const locationDisplay = formatFieldNotesLocationDisplay(
    issue.unitRef,
    projectName,
    t("projectLevelScope"),
    fieldNotesLabels,
    { buildPhaseTag: issue.buildPhaseTag, areaTag: issue.areaTag },
    builderTagDisplayLabels,
  );

  // Build grouped scope + sub-scope pills once, used in the header
  const scopePills: { key: string; label: string; hasSub: boolean }[] = [];
  if (issue.scopeTags.length > 0) {
    const subsByRowId = new Map<string, string[]>();
    for (const tag of (issue.subScopeTags ?? [])) {
      const rowId = tag.subScopeInstance.row.id;
      const subName = tag.subScopeInstance.subScope.name;
      const existing = subsByRowId.get(rowId);
      if (existing) existing.push(subName);
      else subsByRowId.set(rowId, [subName]);
    }
    for (const t of issue.scopeTags) {
      const scopeName = t.row?.scopeType?.name;
      if (!scopeName) continue;
      const subs = subsByRowId.get(t.row.id);
      if (subs?.length) {
        for (const sub of subs) scopePills.push({ key: `${t.row.id}:${sub}`, label: `${scopeName}: ${sub}`, hasSub: true });
      } else {
        scopePills.push({ key: t.row.id, label: scopeName, hasSub: false });
      }
    }
  }

  return createPortal(
    <>
      <style>{SHEET_CSS}</style>
      <div role="presentation" className={`idm-backdrop${visible ? " idm-visible" : ""}`}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div role="dialog" aria-modal="true" aria-label={t("issueDetailAria")} className={`idm-sheet${visible ? " idm-visible" : ""}`}>
          <div className="idm-handle" aria-hidden />

          {/* Header */}
          <div style={{ padding: "8px var(--page-padding-x) 0", flexShrink: 0 }}>

            {/* Row 1: Issue label (left) + action buttons (right) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 99,
                  backgroundColor: "var(--error-100)",
                  color: "var(--error-700)",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={11} aria-hidden />
                {t("issueViewerLabel")}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {canEdit && !editing && (
                  <button type="button" onClick={() => {
                    setEditing(true);
                    setEditDesc(issue.shortDescription);
                    setEditNotes(issue.notes ?? "");
                    setEditType(issue.issueType);
                    setEditBlocking(issue.isBlockingWork);
                    setEditLocation(fieldNotesEditLocationFromRecord(
                      issue.unitRef,
                      issue.scopeTags.map((t) => t.row.id),
                    ));
                    setEditScopeIds(new Set(issue.scopeTags.map((t) => t.row.id)));
                    setEditRemovedIds(new Set());
                    setEditNewMedia([]);
                  }}
                    aria-label={t("editIssueAria")} style={{ width: 30, height: 30, borderRadius: 99, border: "none", backgroundColor: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Pencil size={13} style={{ color: "var(--neutral-500)" }} />
                  </button>
                )}
                {!editing && (
                  <button
                    type="button"
                    onClick={() => void handleExportPdf()}
                    disabled={exportingPdf}
                    aria-label={exportingPdf ? t("exportDetailPdfBusyAria") : t("exportDetailPdfAria")}
                    title={exportingPdf ? t("exportDetailPdfBusyAria") : t("exportDetailPdfAria")}
                    style={{
                      width: 30, height: 30, borderRadius: 99, border: "none", backgroundColor: "var(--neutral-100)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: exportingPdf ? "wait" : "pointer", opacity: exportingPdf ? 0.7 : 1,
                    }}
                  >
                    {exportingPdf
                      ? <Loader2 size={14} style={{ color: "var(--neutral-500)" }} className="idm-spin" />
                      : <FileDown size={14} style={{ color: "var(--neutral-500)" }} />}
                  </button>
                )}
                <button type="button" onClick={close} aria-label={tCommon("close")}
                  style={{ width: 30, height: 30, borderRadius: 99, border: "none", backgroundColor: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <X size={15} style={{ color: "var(--neutral-500)" }} />
                </button>
              </div>
            </div>

            {/* Row 2: Title */}
            <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 800, color: "var(--neutral-900)", lineHeight: 1.25, letterSpacing: "-0.01em" }}>
              {issue.shortDescription || t("issueViewerLabel")}
            </h2>

            {/* Row 3: Context — location + author + date */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", rowGap: 2, marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--neutral-700)" }}>{locationDisplay.headline}</span>
                {locationDisplay.detail && (
                  <>
                    <span style={{ fontSize: 12, color: "var(--neutral-300)", margin: "0 5px" }}>·</span>
                    <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>{locationDisplay.detail}</span>
                  </>
                )}
                <span style={{ fontSize: 12, color: "var(--neutral-300)", margin: "0 5px" }}>·</span>
                <div style={{ width: 16, height: 16, borderRadius: "50%", backgroundColor: "#fee2e2", color: "#991b1b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0, marginRight: 4 }}>
                  {authorLabel.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>{authorLabel}</span>
                <span style={{ fontSize: 12, color: "var(--neutral-300)", margin: "0 5px" }}>·</span>
                <span style={{ fontSize: 12, color: "var(--neutral-400)" }}>{formatDate(issue.createdAt)}</span>
            </div>

            {/* Row 4: Responsible + Status */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("responsibleLabel")}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--neutral-700)" }}>
                  {formatResponsibleParties(issue.responsibleParties, issue.responsibleParty)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--neutral-400)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("statusLabel")}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: issue.status === "RESOLVED" ? "var(--success-700)" : "var(--neutral-700)" }}>
                  {issue.status === "RESOLVED" ? t("issueStatusResolved") : t("issueStatusOpen")}
                  {issue.status === "RESOLVED" && issue.resolvedBy && (
                    <span style={{ fontWeight: 400, color: "var(--neutral-400)", fontSize: 11 }}> · by {issue.resolvedBy.name ?? issue.resolvedBy.email}</span>
                  )}
                </span>
              </div>
            </div>

            {/* Row 2: type label + scope pills */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, backgroundColor: meta.bg, color: meta.color }}>
                {meta.label}
              </span>
              {scopePills.map((p) => (
                <span key={p.key} style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
                  backgroundColor: p.hasSub ? "#eff6ff" : "#fee2e2",
                  color: p.hasSub ? "#1d4ed8" : "#991b1b",
                  border: `1px solid ${p.hasSub ? "#bfdbfe" : "#fecaca"}`,
                }}>
                  {p.label}
                </span>
              ))}
            </div>

            {/* Blocking strip — red, only when blocking */}
            {issue.isBlockingWork && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, backgroundColor: "#fef2f2", border: "1px solid #fecaca", marginBottom: 10 }}>
                <AlertTriangle size={13} style={{ color: "#dc2626", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#b91c1c", letterSpacing: "0.01em" }}>Blocking work</span>
              </div>
            )}

            <div style={{ height: 1, backgroundColor: "var(--neutral-100)", margin: "0 calc(-1 * var(--page-padding-x))" }} />

            {/* Resolved banner — shown immediately when status flips */}
            {issue.status === "RESOLVED" && (
              <div style={{
                margin: "0 calc(-1 * var(--page-padding-x))",
                backgroundColor: "#dcfce7",
                borderBottom: "1px solid #bbf7d0",
              }}>
                {/* Resolved header line */}
                <div style={{ padding: "10px var(--page-padding-x) 8px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>✓</span>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>Issue Resolved</span>
                    {issue.resolvedBy && (
                      <span style={{ fontSize: 12, color: "#15803d", marginLeft: 6 }}>
                        · by {issue.resolvedBy.name ?? issue.resolvedBy.email}
                      </span>
                    )}
                  </div>
                </div>
                {/* Resolution note — distinct from comments */}
                {issue.resolutionNote && (
                  <div style={{ padding: "0 var(--page-padding-x) 12px" }}>
                    <p style={{ margin: "0 0 3px", fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.04em" }}>Resolution Details</p>
                    <p style={{ margin: 0, fontSize: 13, color: "#166534", lineHeight: 1.5, fontStyle: "italic" }}>
                      &ldquo;{issue.resolutionNote}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="idm-body">
            {editing ? (
              <div style={{ marginTop: 20 }}>
                {/* Issue type */}
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Issue type</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {catalogIssueTypes.map((type) => (
                      <button key={type.code} type="button" onClick={() => setEditType(type.code)}
                        style={{ padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${editType === type.code ? "var(--primary-500)" : "var(--neutral-200)"}`, backgroundColor: editType === type.code ? "var(--primary-500)" : "var(--neutral-0)", color: editType === type.code ? "#fff" : "var(--neutral-700)" }}>
                        {resolveIssueTypeLabel(type.code, catalogIssueTypes)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Title</span>
                  <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} autoFocus
                    style={{ width: "100%", marginTop: 8, padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--primary-300)", fontSize: 14, lineHeight: 1.5, resize: "none", fontFamily: "inherit", outline: "none", boxSizing: "border-box", backgroundColor: "var(--neutral-0)", color: "var(--neutral-900)" }} />
                </div>

                {/* Notes */}
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</span>
                  <MentionTextarea
                    value={editNotes}
                    onChange={setEditNotes}
                    rows={4}
                    placeholder="Add additional details, context, or next steps… (type @ to mention someone)"
                    aria-label="Issue notes"
                    style={{ width: "100%", marginTop: 8, padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--neutral-200)", fontSize: 14, lineHeight: 1.5, resize: "none", fontFamily: "inherit", outline: "none", boxSizing: "border-box", backgroundColor: "var(--neutral-0)", color: "var(--neutral-900)" }}
                  />
                </div>

                {/* Responsible parties */}
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("responsiblePartyLabel")}</span>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--neutral-400)" }}>{t("responsiblePartiesHint")}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {catalogParties.map((party) => {
                      const active = editSelectedParties.has(party.code);
                      return (
                        <button
                          key={party.code}
                          type="button"
                          onClick={() => setEditSelectedParties((prev) => {
                            const next = new Set(prev);
                            if (next.has(party.code)) {
                              if (next.size <= 1) return prev;
                              next.delete(party.code);
                            } else {
                              next.add(party.code);
                            }
                            return next;
                          })}
                          style={{
                            padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            border: `1.5px solid ${active ? "var(--primary-500)" : "var(--neutral-200)"}`,
                            backgroundColor: active ? "var(--primary-500)" : "var(--neutral-0)",
                            color: active ? "var(--neutral-0)" : "var(--neutral-700)",
                          }}
                        >
                          {resolvePartyLabel(party.code, catalogParties)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Blocking status */}
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Blocking status</span>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button type="button" onClick={() => setEditBlocking(true)}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${editBlocking ? "#f59e0b" : "var(--neutral-200)"}`, backgroundColor: editBlocking ? "#fef3c7" : "var(--neutral-0)", cursor: "pointer" }}>
                      <AlertTriangle size={14} style={{ color: editBlocking ? "#92400e" : "var(--neutral-400)", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: editBlocking ? "#92400e" : "var(--neutral-500)" }}>Blocking</span>
                    </button>
                    <button type="button" onClick={() => setEditBlocking(false)}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${!editBlocking ? "var(--primary-400)" : "var(--neutral-200)"}`, backgroundColor: !editBlocking ? "var(--primary-50)" : "var(--neutral-0)", cursor: "pointer" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: !editBlocking ? "var(--primary-700)" : "var(--neutral-500)" }}>Not blocking</span>
                    </button>
                  </div>
                </div>
                {isCreator && (
                  <FieldNotesEditLocationSection
                    projectId={projectId}
                    projectName={projectName}
                    unitRef={issue.unitRef}
                    value={editLocation}
                    onChange={setEditLocation}
                  />
                )}
                {!isCreator && scopes.length > 1 && (
                  <div style={{ marginBottom: 14 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("scopeLabel")}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {scopes.map((s) => {
                        const checked = editScopeIds.has(s.id);
                        return (
                          <button key={s.id} type="button" onClick={() => setEditScopeIds((prev) => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                            style={{ textAlign: "left", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${checked ? "var(--primary-400)" : "var(--neutral-200)"}`, backgroundColor: checked ? "var(--primary-50)" : "var(--neutral-0)", fontSize: 13, fontWeight: checked ? 600 : 400, color: checked ? "var(--primary-700)" : "var(--neutral-700)", cursor: "pointer" }}>
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Attachments */}
                <div style={{ marginBottom: 14, position: "relative" }} {...editDropHandlers}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Photos &amp; Files</span>

                  {/* Existing attachments */}
                  {issue.attachments.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
                      {issue.attachments.map((a) => {
                        const removed = editRemovedIds.has(a.id);
                        return (
                          <div key={a.id} style={{ position: "relative", aspectRatio: "1", opacity: removed ? 0.35 : 1, transition: "opacity 0.15s" }}>
                            {a.mimeType.startsWith("image/")
                              ? (
                                <div style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid var(--neutral-200)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <ImageAnnotationOverlay
                                    src={a.storageUrl}
                                    annotation={parseImageAnnotation(a.imageAnnotation)}
                                    alt={a.caption ?? ""}
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                </div>
                              )
                              : <div style={{ width: "100%", height: "100%", borderRadius: 8, backgroundColor: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--neutral-200)" }}>
                                  <span style={{ fontSize: 10, color: "var(--neutral-500)", fontWeight: 600 }}>{a.mimeType.startsWith("video/") ? "VID" : "AUD"}</span>
                                </div>
                            }
                            {/* Annotate button (only for un-removed images) */}
                            {a.mimeType.startsWith("image/") && !removed && (
                              <button type="button" aria-label="Annotate image"
                                onClick={() => setEditAnnotatingAttachment(a)}
                                style={{ position: "absolute", bottom: 3, left: 3, width: 40, height: 40, minWidth: 40, minHeight: 40, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.6)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                                <Pencil size={16} style={{ color: "#fff" }} />
                              </button>
                            )}
                            {/* Remove / Undo button */}
                            <button type="button" aria-label={removed ? "Undo remove" : "Remove attachment"}
                              onClick={() => setEditRemovedIds((prev) => { const n = new Set(prev); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}
                              style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: 99, backgroundColor: removed ? "rgba(22,163,74,0.8)" : "rgba(185,28,28,0.75)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                              {removed ? <Check size={10} style={{ color: "#fff" }} /> : <X size={10} style={{ color: "#fff" }} />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Newly staged media */}
                  {editNewMedia.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
                      {editNewMedia.map((m) => (
                        <div key={m.clientId} style={{ position: "relative", aspectRatio: "1" }}>
                          {m.mimeType.startsWith("image/")
                            ? <img src={m.localUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, border: "1.5px solid var(--primary-200)" }} />
                            : <div style={{ width: "100%", height: "100%", borderRadius: 8, backgroundColor: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid var(--primary-200)" }}>
                                <span style={{ fontSize: 10, color: "var(--neutral-500)", fontWeight: 600 }}>{m.mimeType.startsWith("video/") ? "VID" : "AUD"}</span>
                              </div>
                          }
                          <button type="button" aria-label="Remove new photo"
                            onClick={() => { URL.revokeObjectURL(m.localUrl); setEditNewMedia((prev) => prev.filter((x) => x.clientId !== m.clientId)); }}
                            style={{ position: "absolute", top: 3, right: 3, width: 22, height: 22, borderRadius: 99, backgroundColor: "rgba(185,28,28,0.75)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                            <X size={10} style={{ color: "#fff" }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add photos row */}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button type="button" onClick={() => setShowEditCamera(true)} disabled={editNewMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY}
                      aria-label="Open camera"
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--neutral-200)", backgroundColor: "var(--neutral-0)", color: "var(--neutral-600)", fontSize: 13, fontWeight: 500, cursor: editNewMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY ? "not-allowed" : "pointer", opacity: editNewMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY ? 0.5 : 1 }}>
                      <Camera size={14} /> Camera
                    </button>
                    <button type="button" onClick={() => editFileInputRef.current?.click()} disabled={editNewMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY}
                      aria-label="Choose files"
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--neutral-200)", backgroundColor: "var(--neutral-0)", color: "var(--neutral-600)", fontSize: 13, fontWeight: 500, cursor: editNewMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY ? "not-allowed" : "pointer", opacity: editNewMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY ? 0.5 : 1 }}>
                      <Images size={14} /> Gallery
                    </button>
                    <input ref={editFileInputRef} type="file" accept={ISSUE_MEDIA_ACCEPT} multiple style={{ display: "none" }} onChange={handleEditFileChange} />
                  </div>

                  {/* Annotation editor for existing images */}
                  {editAnnotatingAttachment && (
                    <ImageAnnotationEditor
                      src={editAnnotatingAttachment.storageUrl}
                      exportMode="layered"
                      initialAnnotation={editAnnotatingAttachment.imageAnnotation}
                      onSave={(r) => { void handleEditAnnotationSave(r); }}
                      onClose={() => setEditAnnotatingAttachment(null)}
                    />
                  )}
                  <FileDropOverlay
                    disabled={editNewMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY || editSaving}
                  />
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" onClick={handleSaveEdit} disabled={editSaving || !editDesc.trim()}
                    style={{ flex: 1, minHeight: 44, borderRadius: 10, border: "none", backgroundColor: "var(--primary-500)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    {editSaving && <Loader2 size={16} className="idm-spin" />}
                    {editUploadProgress
                      ? `Uploading ${editUploadProgress.current} of ${editUploadProgress.total}…`
                      : editSaving ? "Saving…" : "Save changes"}
                  </button>
                  <button type="button" onClick={() => { editNewMedia.forEach((m) => URL.revokeObjectURL(m.localUrl)); setEditing(false); setEditRemovedIds(new Set()); setEditNewMedia([]); }}
                    style={{ minHeight: 44, padding: "0 18px", borderRadius: 10, border: "1.5px solid var(--neutral-200)", backgroundColor: "var(--neutral-0)", color: "var(--neutral-700)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {issue.issueType === "MISSING_MATERIALS" && issue.missingMaterialDescription && (
                  <div style={{ marginTop: 20 }}>
                    <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {t("missingMaterialsSectionTitle")}
                    </p>
                    <p style={{ margin: "0 0 6px", fontSize: 14, lineHeight: 1.6, color: "var(--neutral-800)", wordBreak: "break-word" }}>
                      {issue.missingMaterialDescription}
                    </p>
                    {formatMissingMaterialQuantityDisplay(
                      issue.missingMaterialQuantity,
                      issue.missingMaterialUomCode,
                    ) && (
                      <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-600)" }}>
                        {t("missingMaterialAmountLabel")}:{" "}
                        {formatMissingMaterialQuantityDisplay(
                          issue.missingMaterialQuantity,
                          issue.missingMaterialUomCode,
                        )}
                      </p>
                    )}
                  </div>
                )}

                {/* Issue details / notes */}
                <div style={{ marginTop: 20 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Details</p>
                  {issue.notes
                    ? <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--neutral-800)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{renderMentionNodes(issue.notes)}</p>
                    : <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--neutral-400)", fontStyle: "italic" }}>No additional details were added to this issue.</p>
                  }
                </div>

                {/* Attachments */}
                {issue.attachments.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Paperclip size={12} style={{ color: "var(--neutral-500)" }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Attachments ({issue.attachments.length})
                      </span>
                    </div>
                    <MediaGrid
                      attachments={issue.attachments}
                      projectId={projectId}
                      issueId={issue.id}
                      canAnnotate={canEdit}
                      onAnnotationSaved={(u) => {
                        setIssue(u);
                        onUpdated?.(u);
                      }}
                    />
                  </div>
                )}

              </>
            )}

            {/* ── Resolve / Reopen UI ── */}
            {!editing && canResolve && (
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--neutral-100)" }}>
                {issue.status === "OPEN" && (() => {
                  const isBulk = !!(issue.bulkGroupId && (issue.bulkGroupCount ?? 0) > 1);

                  const resetResolveDraft = () => {
                    resolveMedia.forEach((m) => URL.revokeObjectURL(m.localUrl));
                    setShowResolveForm(false);
                    setResolutionNote("");
                    setResolveGroup(false);
                    setResolveMedia([]);
                  };

                  // ── Shared resolution note + photo staging ──
                  const resolutionInputs = (
                    <>
                      <MentionTextarea
                        rows={3}
                        placeholder="Add a resolution note… (type @ to mention someone)"
                        value={resolutionNote}
                        onChange={setResolutionNote}
                        aria-label="Resolution note"
                        style={{
                          width: "100%", padding: "10px 12px", fontSize: 14,
                          border: "1.5px solid var(--neutral-200)", borderRadius: 8,
                          outline: "none", resize: "none", boxSizing: "border-box",
                          backgroundColor: "var(--neutral-0)",
                        }}
                      />

                      <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative" }} {...resolveDropHandlers}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => setShowResolveCamera(true)}
                            disabled={resolving || resolveMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY}
                            aria-label="Open camera"
                            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--neutral-200)", backgroundColor: "var(--neutral-0)", color: "var(--neutral-600)", fontSize: 13, fontWeight: 500, cursor: resolving || resolveMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY ? "not-allowed" : "pointer", opacity: resolving || resolveMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY ? 0.5 : 1 }}
                          >
                            <Camera size={15} />
                            Camera
                          </button>
                          <button
                            type="button"
                            onClick={() => resolveFileInputRef.current?.click()}
                            disabled={resolving || resolveMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY}
                            aria-label="Choose files"
                            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--neutral-200)", backgroundColor: "var(--neutral-0)", color: "var(--neutral-600)", fontSize: 13, fontWeight: 500, cursor: resolving || resolveMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY ? "not-allowed" : "pointer", opacity: resolving || resolveMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY ? 0.5 : 1 }}
                          >
                            <Images size={15} />
                            Gallery
                          </button>
                          <input
                            ref={resolveFileInputRef}
                            type="file"
                            accept={ISSUE_MEDIA_ACCEPT}
                            multiple
                            style={{ display: "none" }}
                            onChange={handleResolveFileChange}
                          />
                        </div>

                        {resolveMedia.length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                            {resolveMedia.map((m) => (
                              <div key={m.clientId} style={{ position: "relative", aspectRatio: "1" }}>
                                {m.mimeType.startsWith("image/") ? (
                                  <img src={m.localUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, border: "1px solid var(--neutral-200)" }} />
                                ) : (
                                  <div style={{ width: "100%", height: "100%", borderRadius: 8, backgroundColor: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--neutral-200)" }}>
                                    <span style={{ fontSize: 10, color: "var(--neutral-500)", fontWeight: 600 }}>{m.mimeType.startsWith("video/") ? "VID" : "AUD"}</span>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  aria-label="Remove"
                                  disabled={resolving}
                                  onClick={() => {
                                    if (resolving) return;
                                    URL.revokeObjectURL(m.localUrl);
                                    setResolveMedia((prev) => prev.filter((x) => x.clientId !== m.clientId));
                                  }}
                                  style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 99, backgroundColor: "rgba(0,0,0,0.55)", border: "none", cursor: resolving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, opacity: resolving ? 0.5 : 1 }}
                                >
                                  <X size={10} style={{ color: "#fff" }} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <FileDropOverlay
                          disabled={resolving || resolveMedia.length >= MAX_MEDIA_ATTACHMENTS_PER_ENTITY}
                        />
                      </div>
                    </>
                  );

                  const resolveBusyLabel = resolveUploadProgress
                    ? `Uploading ${resolveUploadProgress.current} of ${resolveUploadProgress.total}…`
                    : "Resolving…";

                  // ── Bulk issue: note + photos always visible; green buttons confirm resolve ──
                  if (isBulk) {
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {resolutionInputs}

                        <button
                          type="button"
                          onClick={() => { void handleResolve(true); }}
                          disabled={resolving}
                          style={{
                            width: "100%", padding: "13px 16px", borderRadius: 10, border: "none",
                            cursor: resolving ? "not-allowed" : "pointer",
                            backgroundColor: resolving ? "var(--neutral-300)" : "var(--success-700)",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                            opacity: resolving ? 0.85 : 1,
                          }}
                        >
                          {resolving ? <Loader2 size={16} style={{ color: "var(--neutral-0)" }} className="idm-spin" /> : <Check size={16} style={{ color: "var(--neutral-0)", flexShrink: 0 }} />}
                          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--neutral-0)" }}>
                            {resolving ? resolveBusyLabel : `Resolve for all ${issue.bulkGroupCount} remaining units`}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => { void handleResolve(false); }}
                          disabled={resolving}
                          style={{
                            width: "100%", padding: "13px 16px", borderRadius: 10, border: "none",
                            cursor: resolving ? "not-allowed" : "pointer",
                            backgroundColor: resolving ? "var(--neutral-300)" : "var(--success-500)",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                            opacity: resolving ? 0.85 : 1,
                          }}
                        >
                          {resolving ? <Loader2 size={16} style={{ color: "var(--neutral-0)" }} className="idm-spin" /> : <Check size={16} style={{ color: "var(--neutral-0)", flexShrink: 0 }} />}
                          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--neutral-0)" }}>
                            {resolving ? resolveBusyLabel : "Resolve for this unit only"}
                          </span>
                        </button>
                      </div>
                    );
                  }

                  // ── Single issue: expand note + photos after tapping Resolve Issue ──
                  const singleResolveForm = (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {resolutionInputs}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={resetResolveDraft}
                          disabled={resolving}
                          style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid var(--neutral-200)", backgroundColor: "var(--neutral-0)", color: "var(--neutral-700)", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleResolve(false); }}
                          disabled={resolving}
                          style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", backgroundColor: resolving ? "var(--neutral-200)" : "var(--success-600)", color: resolving ? "var(--neutral-400)" : "#fff", fontSize: 14, fontWeight: 600, cursor: resolving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                        >
                          {resolving && <Loader2 size={15} className="idm-spin" />}
                          {resolveUploadProgress
                            ? `Uploading ${resolveUploadProgress.current} of ${resolveUploadProgress.total}…`
                            : resolving ? "Resolving…" : "Confirm Resolve"}
                        </button>
                      </div>
                    </div>
                  );

                  return (
                    <>
                      {!showResolveForm && (
                        <button
                          type="button"
                          onClick={() => setShowResolveForm(true)}
                          style={{
                            width: "100%", padding: "11px 16px",
                            borderRadius: 10, border: "none",
                            backgroundColor: "var(--success-600)", color: "#fff",
                            fontSize: 14, fontWeight: 600, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                          }}
                        >
                          Resolve Issue
                        </button>
                      )}
                      {showResolveForm && singleResolveForm}
                    </>
                  );
                })()}

                {issue.status === "RESOLVED" && canResolve && (
                  <button
                    type="button"
                    onClick={handleReopen}
                    style={{
                      width: "100%", padding: "11px 16px",
                      borderRadius: 10, border: "1.5px solid var(--neutral-300)",
                      backgroundColor: "var(--neutral-0)", color: "var(--neutral-600)",
                      fontSize: 14, fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    Reopen Issue
                  </button>
                )}
              </div>
            )}

            {/* Field-leadership delete (Admin + Install Director) */}
            {!editing && isFieldLeadershipRole(currentUserRole ?? "") && (
              <div style={{ marginTop: 16 }}>
                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: "none", border: "none", padding: "4px 0",
                      fontSize: 13, fontWeight: 500, color: "var(--error-500)",
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={14} />
                    Delete issue
                  </button>
                ) : (
                  <div style={{ padding: "10px 12px", borderRadius: 10, backgroundColor: "var(--error-50)", border: "1px solid var(--error-200)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "var(--error-700)", fontWeight: 500 }}>Permanently delete this issue?</span>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={deleting}
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-600)", backgroundColor: "var(--neutral-100)", border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        style={{ fontSize: 12, fontWeight: 600, color: "#fff", backgroundColor: "var(--error-600)", border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        {deleting && <Loader2 size={11} style={{ animation: "idm-spin 1s linear infinite" }} />}
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Comment thread */}
            {!editing && (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--neutral-100)" }}>
                <CommentThread
                  projectId={projectId}
                  entityType="issue"
                  entityId={issue.id}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                />
              </div>
            )}
          </div>

          {/* Issue list navigation — only shown when onPrev/onNext are provided */}
          {(onPrev !== undefined || onNext !== undefined) && issueIndex !== undefined && issueTotal !== undefined && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 14px)",
                borderTop: "1px solid var(--neutral-200)",
                backgroundColor: "var(--neutral-0)",
                flexShrink: 0,
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={onPrev}
                disabled={!onPrev}
                aria-label="Previous issue"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "10px 18px", borderRadius: 999,
                  border: "1.5px solid var(--neutral-200)",
                  backgroundColor: onPrev ? "var(--neutral-0)" : "var(--neutral-50)",
                  color: onPrev ? "var(--neutral-700)" : "var(--neutral-300)",
                  fontSize: 14, fontWeight: 600,
                  cursor: onPrev ? "pointer" : "default",
                  minHeight: 44, transition: "background-color 0.12s",
                }}
              >
                <ChevronLeft size={16} />
                Prev
              </button>
              <span
                style={{
                  fontSize: 13, fontWeight: 500, color: "var(--neutral-400)",
                  fontVariantNumeric: "tabular-nums", flexShrink: 0,
                }}
              >
                {issueIndex} <span style={{ color: "var(--neutral-300)" }}>of</span> {issueTotal}
              </span>
              <button
                type="button"
                onClick={onNext}
                disabled={!onNext}
                aria-label="Next issue"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "10px 18px", borderRadius: 999,
                  border: "1.5px solid var(--neutral-200)",
                  backgroundColor: onNext ? "var(--neutral-0)" : "var(--neutral-50)",
                  color: onNext ? "var(--neutral-700)" : "var(--neutral-300)",
                  fontSize: 14, fontWeight: 600,
                  cursor: onNext ? "pointer" : "default",
                  minHeight: 44, transition: "background-color 0.12s",
                }}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          )}

        </div>
      </div>
      {showResolveCamera && (
        <CameraCapture
          maxItems={MAX_MEDIA_ATTACHMENTS_PER_ENTITY - resolveMedia.length}
          onCapture={handleResolveCameraCapture}
          onClose={() => setShowResolveCamera(false)}
          location={{ building: unitContext.building, area: unitContext.area, level: unitContext.level, unit: unitContext.unit }}
        />
      )}
      {showEditCamera && (
        <CameraCapture
          maxItems={MAX_MEDIA_ATTACHMENTS_PER_ENTITY - editNewMedia.length}
          onCapture={handleEditCameraCapture}
          onClose={() => setShowEditCamera(false)}
          location={{ building: unitContext.building, area: unitContext.area, level: unitContext.level, unit: unitContext.unit }}
        />
      )}
    </>,
    document.body,
  );
}
